import crypto from 'crypto';
import {
  Prisma,
  ReportActorType,
  ReportCategory,
  ReportMediaStage,
  ReportOrigin,
  ReportPriority,
  ReportPrioritySource,
  ReportRepairStatus,
  ReportRoutingState,
  ReportStatus,
  ReportTimelineEventType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import {
  AuthenticationError,
  AuthorizationError,
  BusinessError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../shared/logger';
import { technicianRepository } from '../technicians/technician.repository';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { warrantyRepository } from '../warranty/warranty.repository';
import { reportRepository, ReportWithRelations, Db } from './report.repository';
import {
  decodeAndValidateImage,
  extensionForMimeType,
  MAX_HOMEOWNER_PHOTOS,
  reportMediaStorage,
} from './report-media-storage';
import { reportAnalysisProvider } from './providers/report-analysis.provider';
import { objectDetectionProvider } from './providers/object-detection.provider';
import { evaluateReportWarranty } from './report-warranty';
import {
  notifyRoutingPending,
  reportRoutingService,
  routeReport,
} from './report.routing';
import {
  ACTIVE_REPORT_STATUSES,
  assertStartable,
  assertTransition,
  computeSlaStartDueAt,
  MANUAL_DEFAULT_PRIORITY,
  REPORT_SLA_RULES_VERSION,
} from './report.types';
import {
  ReportViewer,
  toReportDetailDto,
  toReportSummaryDto,
  toTimelineEventDto,
} from './report.mapper';
import {
  AnalyzeReportDto,
  ApproveReportDto,
  CreateReportDto,
  ListReportsQueryDto,
  ListRepairHistoryQueryDto,
  ListTechnicianTasksQueryDto,
  ReopenReportDto,
  StartRepairDto,
  SubmitRepairDto,
  UploadReportMediaDto,
  WarrantyCheckDto,
} from './report.dto';

interface RequestContext {
  ipAddress: string | null;
}

export interface Principal {
  id: string;
  role: UserRole;
  companyId: string | null;
}

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md Part I): the canonical report service.
// Every state mutation below runs inside one prisma.$transaction that also
// writes the timeline event, so a status can never move without its audit
// trail moving with it (invariant 14).
// ---------------------------------------------------------------------------

/**
 * Invariants 10/11: a deactivated account performs no mutation. Re-read from
 * the database rather than trusted from the access token, whose `role`/status
 * view can be up to one TTL stale (decisions.md D4).
 */
async function assertActiveAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError('This account is deactivated', 'ACCOUNT_DEACTIVATED');
  }
}

/**
 * Builds the viewer identity AND the Prisma scope from the authenticated
 * principal alone (decisions.md I12). Client filters are later intersected
 * with this scope by `reportRepository.buildWhere` - never substituted for it,
 * so no query parameter can widen what a role can see.
 */
export async function resolveViewer(
  principal: Principal,
): Promise<{ viewer: ReportViewer; scope: Prisma.ReportWhereInput }> {
  switch (principal.role) {
    case UserRole.HOMEOWNER:
      return {
        viewer: { scope: 'HOMEOWNER', userId: principal.id },
        scope: { homeownerId: principal.id },
      };

    case UserRole.TECHNICIAN: {
      const technician = await technicianRepository.findByUserId(principal.id);
      if (!technician) {
        throw new AuthorizationError('You do not have permission to perform this action.');
      }
      return {
        viewer: { scope: 'TECHNICIAN', userId: principal.id, technicianId: technician.id },
        scope: { assignedTechnicianId: technician.id },
      };
    }

    case UserRole.PROJECT_MANAGER: {
      const manager = await projectManagerRepository.findByUserId(principal.id);
      if (!manager?.projectId) {
        // An unassigned manager (E3's eligible pool) supervises no project and
        // therefore sees no reports - an empty scope, not an error.
        return { viewer: { scope: 'PM', userId: principal.id }, scope: { id: '__none__' } };
      }
      return {
        viewer: { scope: 'PM', userId: principal.id },
        scope: { projectId: manager.projectId },
      };
    }

    case UserRole.COMPANY: {
      if (!principal.companyId) {
        throw new AuthorizationError('You do not have permission to perform this action.');
      }
      return {
        viewer: { scope: 'COMPANY', userId: principal.id },
        scope: { project: { companyId: principal.companyId } },
      };
    }

    default:
      // HOME_SEEKER and anything else: the canonical report domain is
      // post-ownership only.
      throw new AuthorizationError('You do not have permission to perform this action.');
  }
}

/** Loads a report the viewer is allowed to see, or 404s (hide existence, I12). */
async function loadScopedReport(reportId: string, principal: Principal) {
  const { viewer, scope } = await resolveViewer(principal);
  // Scope check and hydration are two steps on purpose: the scope predicate is
  // built from the principal only, so it is the thing that decides visibility,
  // and the rich include never influences it.
  const visible = await prisma.report.findFirst({
    where: { AND: [scope, { id: reportId }] },
    select: { id: true },
  });
  if (!visible) {
    throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  }
  const full = await reportRepository.findById(reportId);
  /* istanbul ignore next - the row was just proven to exist inside the scope. */
  if (!full) throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  return { viewer, report: full };
}

/** Resolves the homeowner's one active ownership chain. Invariant 15. */
async function requireActiveOwnership(userId: string) {
  const ownership = await prisma.ownership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { unit: { include: { building: true } } },
  });
  if (!ownership) {
    throw new BusinessError(
      'You do not have an active unit ownership',
      'NO_ACTIVE_OWNERSHIP',
    );
  }
  return ownership;
}

function stagingPrefix(userId: string): string {
  return `reports/staging/${userId}/`;
}

/**
 * Task 3 (Step 9) — best-effort release of staged objects a request has
 * abandoned.
 *
 * Safe by construction: it is only ever called with keys that
 * `assertOwnedStagingKeys` has already proven belong to the CALLING user's own
 * server-derived staging prefix, and only on a path where this request is
 * about to fail. It can therefore never touch a referenced object: a key only
 * becomes a `ReportMedia.storageKey` when creation SUCCEEDS, and this runs only
 * when it did not.
 *
 * Never throws, and never logs a key (a key is a capability-shaped string).
 */
async function releaseStagedMedia(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => reportMediaStorage.remove(key).catch(() => false)));
}

export const reportService = {
  // -------------------------------------------------------------------------
  // Provider status - booleans only, never a key (decisions.md I7).
  // -------------------------------------------------------------------------
  providerStatus() {
    return {
      analysis: {
        name: 'openai',
        available: reportAnalysisProvider.isConfigured(),
      },
      objectDetection: {
        name: 'yolov11',
        available: objectDetectionProvider.isConfigured(),
        // Explicit so no consumer can mistake "an endpoint exists" for "a
        // building-defect detector is running" (decisions.md I7).
        note: 'Requires a separately deployed inference service with custom-trained defect weights.',
      },
      media: {
        driver: reportMediaStorage.driver,
        durable: reportMediaStorage.driver === 'supabase',
        available: reportMediaStorage.isConfigured(),
      },
    };
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/media - stage one photo (H8's real upload step).
  // -------------------------------------------------------------------------
  async uploadMedia(dto: UploadReportMediaDto, principal: Principal) {
    await assertActiveAccount(principal.id);
    await requireActiveOwnership(principal.id);

    const { buffer, mimeType } = decodeAndValidateImage(dto);

    // Server-derived key only - the client's fileName never reaches a path.
    const key = `${stagingPrefix(principal.id)}${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
    const { url } = await reportMediaStorage.upload(key, buffer, mimeType);

    return { key, url, mimeType, sizeBytes: buffer.length };
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/analyze - AI advice only. Creates nothing, mutates nothing.
  // -------------------------------------------------------------------------
  async analyze(dto: AnalyzeReportDto, principal: Principal) {
    await assertActiveAccount(principal.id);
    await requireActiveOwnership(principal.id);

    const keys = assertOwnedStagingKeys(dto.mediaKeys, principal.id);

    if (!reportAnalysisProvider.isConfigured()) {
      throw new BusinessError(
        'Automatic photo analysis is not available right now',
        'AI_ANALYSIS_UNAVAILABLE',
      );
    }

    const images = await Promise.all(
      keys.map(async (key) => ({
        dataUri: await reportMediaStorage.getDataUri(key, mimeTypeFromKey(key)),
      })),
    );

    // Task 3 (Step 9): if the provider chain fails, the objects this caller
    // just staged are provably theirs (the prefix is server-derived from their
    // own user id) and provably abandoned by THIS request. Removing them is
    // best-effort and never replaces the real error.
    let detection: Awaited<ReturnType<typeof objectDetectionProvider.detect>>;
    let analysis: Awaited<ReturnType<typeof reportAnalysisProvider.analyze>>;
    try {
      // Advisory context only, and absent entirely whenever YOLO is unconfigured
      // - never presented as a defect detection (I7).
      detection = await objectDetectionProvider.detect(images);

      analysis = await reportAnalysisProvider.analyze({
        images,
        homeownerNote: dto.note ?? null,
        detections: detection?.detections,
      });
    } catch (err) {
      await releaseStagedMedia(keys);
      throw err;
    }

    const row = await prisma.reportAnalysis.create({
      data: {
        userId: principal.id,
        provider: analysis.provider,
        model: analysis.model,
        suggestedCategory: analysis.category,
        problemText: analysis.problemText,
        priority: analysis.priority,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
        mediaKeys: keys,
        detections: detection ? (detection as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    return {
      analysisId: row.id,
      category: row.suggestedCategory,
      problemText: row.problemText,
      priority: row.priority,
      confidence: row.confidence,
      explanation: row.explanation,
      provider: row.provider,
      model: row.model,
      detectionsAvailable: !!detection,
    };
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/warranty-check - a PREVIEW. Explicitly non-authoritative;
  // creation always recomputes (decisions.md I4).
  // -------------------------------------------------------------------------
  async warrantyCheck(dto: WarrantyCheckDto, principal: Principal) {
    await assertActiveAccount(principal.id);
    const ownership = await requireActiveOwnership(principal.id);
    const warranty = await warrantyRepository.findByUnitId(ownership.unitId);

    const snapshot = evaluateReportWarranty({
      category: dto.category as ReportCategory,
      warranty,
      now: new Date(),
    });

    return {
      verdict: snapshot.verdict,
      reasonCode: snapshot.reasonCode,
      categoryKey: snapshot.warrantyCategoryKey,
      rulesVersion: snapshot.rulesVersion,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      // Never let a caller mistake the preview for the stored verdict.
      preview: true as const,
    };
  },

  // -------------------------------------------------------------------------
  // POST /api/reports - create, snapshot warranty, route automatically.
  // -------------------------------------------------------------------------
  async create(dto: CreateReportDto, principal: Principal, ctx: RequestContext) {
    await assertActiveAccount(principal.id);
    const ownership = await requireActiveOwnership(principal.id);
    const keys = assertOwnedStagingKeys(dto.mediaKeys, principal.id);

    const category = dto.category as ReportCategory;

    // decisions.md I6: the AI fields come from the server's own record, keyed
    // by an opaque id - never from the request body.
    let analysis = null as Awaited<ReturnType<typeof prisma.reportAnalysis.findUnique>> | null;
    if (dto.analysisId) {
      analysis = await prisma.reportAnalysis.findUnique({ where: { id: dto.analysisId } });
      if (!analysis || analysis.userId !== principal.id) {
        throw new NotFoundError('Analysis not found', 'ANALYSIS_NOT_FOUND');
      }
      if (analysis.consumedByReportId) {
        throw new BusinessError('This analysis has already been used', 'ANALYSIS_ALREADY_USED');
      }
      const sameMedia =
        analysis.mediaKeys.length === keys.length &&
        [...analysis.mediaKeys].sort().every((k, i) => k === [...keys].sort()[i]);
      if (!sameMedia) {
        throw new BusinessError(
          'The analysis does not match the submitted photos',
          'ANALYSIS_MEDIA_MISMATCH',
        );
      }
    }

    const warranty = await warrantyRepository.findByUnitId(ownership.unitId);
    const now = new Date();
    const snapshot = evaluateReportWarranty({ category, warranty, now });

    const priority = analysis ? analysis.priority : MANUAL_DEFAULT_PRIORITY;
    const prioritySource = analysis ? ReportPrioritySource.AI : ReportPrioritySource.MANUAL_DEFAULT;
    const slaStartDueAt = computeSlaStartDueAt(priority, now);

    // Task 3 (Step 9): if the creation transaction rolls back, no `ReportMedia`
    // row was ever committed, so the staged objects are unreferenced and this
    // request abandoned them. Best-effort release; the original error wins.
    const created = await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          homeownerId: principal.id,
          ownershipId: ownership.id,
          unitId: ownership.unitId,
          buildingId: ownership.unit.buildingId,
          projectId: ownership.unit.building.projectId,
          category,
          categoryConfirmedByUser: dto.categoryConfirmedByUser ?? true,
          problemText: dto.problemText,
          homeownerNote: dto.note ?? null,
          analysisId: analysis?.id ?? null,
          aiSuggestedCategory: analysis?.suggestedCategory ?? null,
          aiConfidence: analysis?.confidence ?? null,
          aiProblemText: analysis?.problemText ?? null,
          aiExplanation: analysis?.explanation ?? null,
          aiProvider: analysis?.provider ?? null,
          aiModel: analysis?.model ?? null,
          priority,
          prioritySource,
          warrantyVerdict: snapshot.verdict,
          warrantyReasonCode: snapshot.reasonCode,
          warrantyCategoryKey: snapshot.warrantyCategoryKey,
          warrantyRulesVersion: snapshot.rulesVersion,
          warrantyEvaluatedAt: snapshot.evaluatedAt,
          warrantyPeriodStart: snapshot.periodStart,
          warrantyPeriodEnd: snapshot.periodEnd,
          status: ReportStatus.ROUTING_PENDING,
          routingState: ReportRoutingState.PENDING,
          slaStartDueAt,
          slaRulesVersion: REPORT_SLA_RULES_VERSION,
          origin: ReportOrigin.HOMEOWNER,
        },
      });

      // Media rows point at the keys the homeowner already staged - the objects
      // are not copied or moved, so there is no window where a report exists
      // with photos that failed to transfer.
      await reportRepository.createMedia(
        keys.map((key, index) => ({
          reportId: report.id,
          stage: ReportMediaStage.HOMEOWNER,
          storageKey: key,
          url: mediaUrlForKey(key),
          mimeType: mimeTypeFromKey(key),
          sizeBytes: 0,
          sortOrder: index,
          uploadedById: principal.id,
        })),
        tx,
      );

      if (analysis) {
        await tx.reportAnalysis.update({
          where: { id: analysis.id },
          data: { consumedByReportId: report.id },
        });
      }

      await reportRepository.appendTimelineEvent(
        {
          reportId: report.id,
          type: ReportTimelineEventType.REPORT_CREATED,
          actorType: ReportActorType.HOMEOWNER,
          actorId: principal.id,
          metadata: { photoCount: keys.length, category },
        },
        tx,
      );

      if (analysis) {
        await reportRepository.appendTimelineEvent(
          {
            reportId: report.id,
            type: ReportTimelineEventType.AI_ANALYSIS_RECORDED,
            actorType: ReportActorType.AI,
            metadata: {
              provider: analysis.provider,
              model: analysis.model,
              suggestedCategory: analysis.suggestedCategory,
              confidence: analysis.confidence,
              userCorrected: analysis.suggestedCategory !== category,
            },
          },
          tx,
        );
      } else {
        await reportRepository.appendTimelineEvent(
          {
            reportId: report.id,
            type: ReportTimelineEventType.AI_ANALYSIS_UNAVAILABLE,
            actorType: ReportActorType.SYSTEM,
            metadata: { reason: 'MANUAL_ENTRY' },
          },
          tx,
        );
      }

      await reportRepository.appendTimelineEvent(
        {
          reportId: report.id,
          type: ReportTimelineEventType.WARRANTY_EVALUATED,
          actorType: ReportActorType.SYSTEM,
          metadata: {
            verdict: snapshot.verdict,
            reasonCode: snapshot.reasonCode,
            rulesVersion: snapshot.rulesVersion,
          },
        },
        tx,
      );

      // decisions.md I8: selection + assignment happen inside this same
      // transaction, so a report is never briefly visible as unrouted when a
      // technician was in fact available.
      const routing = await routeReport(report.id, tx);

      if (!routing.assigned) {
        await reportRepository.appendTimelineEvent(
          {
            reportId: report.id,
            type: ReportTimelineEventType.ROUTING_PENDING_RECORDED,
            actorType: ReportActorType.SYSTEM,
            metadata: { reasonCode: routing.reasonCode },
          },
          tx,
        );
      }

      return { reportId: report.id, routing };
    }).catch(async (err) => {
      // Nothing committed, so no `ReportMedia` row references these keys and
      // this request abandoned them. Release, then re-throw the REAL error.
      await releaseStagedMedia(keys);
      throw err;
    });

    await writeAuditLog({
      userId: principal.id,
      action: 'REPORT_CREATED',
      entity: 'Report',
      entityId: created.reportId,
      ipAddress: ctx.ipAddress,
      metadata: {
        category,
        warrantyVerdict: snapshot.verdict,
        routed: created.routing.assigned,
        routingReasonCode: created.routing.reasonCode,
      },
    });

    const full = await reportRepository.findById(created.reportId);
    /* istanbul ignore next - just created in a committed transaction. */
    if (!full) throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');

    await notifyAfterCreate(full, created.routing.assigned, created.routing.reasonCode);

    return withSignedMedia(toReportDetailDto(full, { scope: 'HOMEOWNER', userId: principal.id }), full);
  },

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(query: ListReportsQueryDto, principal: Principal) {
    const { viewer, scope } = await resolveViewer(principal);
    const { items, total } = await reportRepository.list(
      scope,
      {
        projectId: query.projectId,
        unitId: query.unitId,
        homeownerId: query.homeownerId,
        technicianId: query.technicianId,
        status: query.status as ReportStatus[] | undefined,
        priority: query.priority as ReportPriority[] | undefined,
        search: query.q,
      },
      query.page,
      query.pageSize,
    );

    const now = new Date();
    return {
      items: items.map((r) => toReportSummaryDto(r, viewer, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getById(reportId: string, principal: Principal) {
    const { viewer, report } = await loadScopedReport(reportId, principal);
    return withSignedMedia(toReportDetailDto(report, viewer), report);
  },

  async getTimeline(reportId: string, principal: Principal) {
    // Scope check first: a foreign report's timeline must 404 exactly like the
    // report itself does.
    await loadScopedReport(reportId, principal);
    const events = await reportRepository.listTimeline(reportId);
    return events.map(toTimelineEventDto);
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/:id/start (technician, assignee only)
  // -------------------------------------------------------------------------
  async start(reportId: string, dto: StartRepairDto, principal: Principal, ctx: RequestContext) {
    await assertActiveAccount(principal.id);
    const { report, technicianId } = await requireAssignedTechnician(reportId, principal);

    assertStartable(report.status, report.repair?.status ?? null);

    // Friendly pre-check; the partial unique index
    // `report_repairs_active_technician_unique` is the actual guarantee under
    // concurrency (decisions.md I8).
    const active = await reportRepository.findActiveRepairByTechnician(technicianId);
    if (active && active.reportId !== reportId) {
      throw new ActiveRepairExistsError(active.report.id, active.report.reportNumber);
    }

    const beforeMedia = (dto.beforePhotos ?? []).map((photo) => ({
      photo,
      decoded: decodeAndValidateImage(photo),
    }));
    const uploaded = await Promise.all(
      beforeMedia.map(async ({ decoded }, index) => {
        const key = `reports/${reportId}/before/${crypto.randomUUID()}.${extensionForMimeType(decoded.mimeType)}`;
        const { url } = await reportMediaStorage.upload(key, decoded.buffer, decoded.mimeType);
        return { key, url, mimeType: decoded.mimeType, sizeBytes: decoded.buffer.length, index };
      }),
    );

    const startedAt = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        // Re-assert the exact preconditions inside the transaction so two
        // concurrent starts cannot both proceed.
        const fresh = await tx.report.findUnique({
          where: { id: reportId },
          include: { repair: true },
        });
        /* istanbul ignore next - loaded moments ago in the same request. */
        if (!fresh) throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
        assertStartable(fresh.status, fresh.repair?.status ?? null);

        if (fresh.repair) {
          await reportRepository.updateRepair(
            fresh.repair.id,
            { status: ReportRepairStatus.IN_PROGRESS, submittedAt: null },
            tx,
          );
        } else {
          await reportRepository.createRepair(
            { reportId, technicianId, status: ReportRepairStatus.IN_PROGRESS, startedAt },
            tx,
          );
          await tx.report.update({
            where: { id: reportId },
            data: { status: ReportStatus.IN_PROGRESS },
          });
        }

        if (uploaded.length > 0) {
          const max = await reportRepository.maxMediaSortOrder(reportId, 'BEFORE', tx);
          const base = (max._max.sortOrder ?? -1) + 1;
          await reportRepository.createMedia(
            uploaded.map((u) => ({
              reportId,
              stage: ReportMediaStage.BEFORE,
              storageKey: u.key,
              url: u.url,
              mimeType: u.mimeType,
              sizeBytes: u.sizeBytes,
              sortOrder: base + u.index,
              uploadedById: principal.id,
            })),
            tx,
          );
          await reportRepository.appendTimelineEvent(
            {
              reportId,
              type: ReportTimelineEventType.REPAIR_MEDIA_ADDED,
              actorType: ReportActorType.TECHNICIAN,
              actorId: principal.id,
              metadata: { stage: 'BEFORE', count: uploaded.length },
            },
            tx,
          );
        }

        await reportRepository.appendTimelineEvent(
          {
            reportId,
            type: ReportTimelineEventType.REPAIR_STARTED,
            actorType: ReportActorType.TECHNICIAN,
            actorId: principal.id,
            metadata: { technicianId, resumed: !!fresh.repair },
          },
          tx,
        );
      });
    } catch (err) {
      // The partial unique index firing means another repair became active
      // between the pre-check and the insert - surface it as the same friendly
      // 409 the pre-check would have.
      if (isActiveRepairUniqueViolation(err)) {
        const blocking = await reportRepository.findActiveRepairByTechnician(technicianId);
        throw new ActiveRepairExistsError(
          blocking?.report.id ?? null,
          blocking?.report.reportNumber ?? null,
        );
      }
      throw err;
    }

    await writeAuditLog({
      userId: principal.id,
      action: 'REPORT_REPAIR_STARTED',
      entity: 'Report',
      entityId: reportId,
      ipAddress: ctx.ipAddress,
      metadata: { technicianId },
    });

    await notificationService.send(
      report.homeownerId,
      'بدأ الإصلاح',
      `بدأ الفنيّ العمل على بلاغك #${report.reportNumber}.`,
    );

    return reportService.getById(reportId, principal);
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/:id/submit-repair (technician, assignee only)
  // -------------------------------------------------------------------------
  async submitRepair(reportId: string, dto: SubmitRepairDto, principal: Principal, ctx: RequestContext) {
    await assertActiveAccount(principal.id);
    const { report, technicianId } = await requireAssignedTechnician(reportId, principal);

    if (report.status !== ReportStatus.IN_PROGRESS || report.repair?.status !== ReportRepairStatus.IN_PROGRESS) {
      throw new BusinessError(
        'This repair is not currently in progress',
        'INVALID_REPORT_STATUS_TRANSITION',
      );
    }
    assertTransition(report.status, ReportStatus.AWAITING_OWNER_APPROVAL);

    // C2's hard requirement: at least one after-photo before submission.
    const decoded = dto.afterPhotos.map((photo) => decodeAndValidateImage(photo));
    if (decoded.length === 0) {
      throw new ValidationError('At least one after-repair photo is required');
    }

    const repairId = report.repair.id;
    const uploaded = await Promise.all(
      decoded.map(async (image, index) => {
        const key = `reports/${reportId}/after/${crypto.randomUUID()}.${extensionForMimeType(image.mimeType)}`;
        const { url } = await reportMediaStorage.upload(key, image.buffer, image.mimeType);
        return { key, url, mimeType: image.mimeType, sizeBytes: image.buffer.length, index };
      }),
    );

    const submittedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.report.findUnique({ where: { id: reportId }, include: { repair: true } });
      if (!fresh || fresh.status !== ReportStatus.IN_PROGRESS || fresh.repair?.status !== ReportRepairStatus.IN_PROGRESS) {
        throw new BusinessError(
          'This repair is not currently in progress',
          'INVALID_REPORT_STATUS_TRANSITION',
        );
      }

      const max = await reportRepository.maxMediaSortOrder(reportId, 'AFTER', tx);
      const base = (max._max.sortOrder ?? -1) + 1;
      await reportRepository.createMedia(
        uploaded.map((u) => ({
          reportId,
          stage: ReportMediaStage.AFTER,
          storageKey: u.key,
          url: u.url,
          mimeType: u.mimeType,
          sizeBytes: u.sizeBytes,
          sortOrder: base + u.index,
          uploadedById: principal.id,
        })),
        tx,
      );

      await reportRepository.updateRepair(
        repairId,
        {
          status: ReportRepairStatus.SUBMITTED,
          submittedAt,
          technicianNote: dto.note ?? null,
        },
        tx,
      );

      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.AWAITING_OWNER_APPROVAL },
      });

      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.REPAIR_MEDIA_ADDED,
          actorType: ReportActorType.TECHNICIAN,
          actorId: principal.id,
          metadata: { stage: 'AFTER', count: uploaded.length },
        },
        tx,
      );
      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.REPAIR_SUBMITTED,
          actorType: ReportActorType.TECHNICIAN,
          actorId: principal.id,
          metadata: { technicianId, afterPhotoCount: uploaded.length, hasNote: !!dto.note },
        },
        tx,
      );
    });

    await writeAuditLog({
      userId: principal.id,
      action: 'REPORT_REPAIR_SUBMITTED',
      entity: 'Report',
      entityId: reportId,
      ipAddress: ctx.ipAddress,
      metadata: { technicianId, afterPhotoCount: uploaded.length },
    });

    await notificationService.send(
      report.homeownerId,
      'بانتظار موافقتك',
      `تم رفع صور بعد الإصلاح لبلاغك #${report.reportNumber} وبانتظار اعتمادك.`,
    );

    // The technician just freed their single active slot - a pending report in
    // this project may now be routable (decisions.md I9).
    reportRoutingService.scheduleRetry(report.projectId);

    return reportService.getById(reportId, principal);
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/:id/approve (the report's homeowner only)
  // -------------------------------------------------------------------------
  async approve(reportId: string, dto: ApproveReportDto, principal: Principal, ctx: RequestContext) {
    await assertActiveAccount(principal.id);
    const report = await requireOwnReport(reportId, principal);

    if (report.status !== ReportStatus.AWAITING_OWNER_APPROVAL || !report.repair) {
      throw new BusinessError(
        'This report is not awaiting your approval',
        'INVALID_REPORT_STATUS_TRANSITION',
      );
    }
    assertTransition(report.status, ReportStatus.CLOSED);

    const decidedAt = new Date();
    const durationMinutes = Math.max(
      0,
      Math.round((decidedAt.getTime() - report.repair.startedAt.getTime()) / 60_000),
    );
    const repairId = report.repair.id;
    const technicianId = report.repair.technicianId;

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.report.findUnique({ where: { id: reportId }, include: { repair: true } });
      if (!fresh || fresh.status !== ReportStatus.AWAITING_OWNER_APPROVAL) {
        throw new BusinessError(
          'This report is not awaiting your approval',
          'INVALID_REPORT_STATUS_TRANSITION',
        );
      }

      await reportRepository.updateRepair(
        repairId,
        {
          status: ReportRepairStatus.APPROVED,
          homeownerDecisionAt: decidedAt,
          durationMinutes,
        },
        tx,
      );

      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.CLOSED, closedAt: decidedAt },
      });

      // One review per closed report - `reportId @unique` is the real guard.
      await reportRepository.createReview(
        {
          reportId,
          reportRepairId: repairId,
          technicianId,
          homeownerId: principal.id,
          rating: dto.rating,
          comment: dto.comment ?? null,
        },
        tx,
      );

      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.HOMEOWNER_APPROVED,
          actorType: ReportActorType.HOMEOWNER,
          actorId: principal.id,
          metadata: { durationMinutes },
        },
        tx,
      );
      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.REVIEW_SUBMITTED,
          actorType: ReportActorType.HOMEOWNER,
          actorId: principal.id,
          metadata: { rating: dto.rating, hasComment: !!dto.comment },
        },
        tx,
      );
      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.REPORT_CLOSED,
          actorType: ReportActorType.SYSTEM,
          metadata: { closedBy: 'HOMEOWNER_APPROVAL' },
        },
        tx,
      );
    });

    await writeAuditLog({
      userId: principal.id,
      action: 'REPORT_APPROVED',
      entity: 'Report',
      entityId: reportId,
      ipAddress: ctx.ipAddress,
      metadata: { rating: dto.rating, durationMinutes },
    });

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { userId: true },
    });
    if (technician) {
      await notificationService.send(
        technician.userId,
        'تم اعتماد الإصلاح',
        `اعتمد المالك الإصلاح وأُغلق البلاغ #${report.reportNumber}.`,
      );
    }

    reportRoutingService.scheduleRetry(report.projectId);

    return reportService.getById(reportId, principal);
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/:id/reopen (the report's homeowner only, reason required)
  // -------------------------------------------------------------------------
  async reopen(reportId: string, dto: ReopenReportDto, principal: Principal, ctx: RequestContext) {
    await assertActiveAccount(principal.id);
    const report = await requireOwnReport(reportId, principal);

    if (report.status !== ReportStatus.AWAITING_OWNER_APPROVAL || !report.repair) {
      throw new BusinessError(
        'This report is not awaiting your approval',
        'INVALID_REPORT_STATUS_TRANSITION',
      );
    }
    assertTransition(report.status, ReportStatus.IN_PROGRESS);

    const repairId = report.repair.id;
    const technicianId = report.repair.technicianId;

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.report.findUnique({ where: { id: reportId }, include: { repair: true } });
      if (!fresh || fresh.status !== ReportStatus.AWAITING_OWNER_APPROVAL) {
        throw new BusinessError(
          'This report is not awaiting your approval',
          'INVALID_REPORT_STATUS_TRANSITION',
        );
      }

      // REOPENED, not IN_PROGRESS (decisions.md I2): the homeowner's action must
      // never be blocked by, or silently violate, the technician's
      // single-active-repair lock. The technician re-acquires it via `start`.
      await reportRepository.updateRepair(
        repairId,
        {
          status: ReportRepairStatus.REOPENED,
          submittedAt: null,
          homeownerReopenReason: dto.reason,
          reopenCount: { increment: 1 },
        },
        tx,
      );

      await tx.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.IN_PROGRESS, reopenCount: { increment: 1 } },
      });

      await reportRepository.appendTimelineEvent(
        {
          reportId,
          type: ReportTimelineEventType.HOMEOWNER_REOPENED,
          actorType: ReportActorType.HOMEOWNER,
          actorId: principal.id,
          metadata: { reason: dto.reason.slice(0, 500) },
        },
        tx,
      );
    });

    await writeAuditLog({
      userId: principal.id,
      action: 'REPORT_REOPENED',
      entity: 'Report',
      entityId: reportId,
      ipAddress: ctx.ipAddress,
    });

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { userId: true },
    });
    if (technician) {
      await notificationService.send(
        technician.userId,
        'أُعيد فتح البلاغ',
        `أعاد المالك فتح البلاغ #${report.reportNumber}. يرجى المتابعة.`,
      );
    }

    return reportService.getById(reportId, principal);
  },

  // -------------------------------------------------------------------------
  // Technician self-service (C1/C3)
  // -------------------------------------------------------------------------

  async technicianTasks(query: ListTechnicianTasksQueryDto, principal: Principal) {
    const { viewer, scope } = await resolveViewer(principal);
    const statuses = (query.status as ReportStatus[] | undefined) ?? ACTIVE_REPORT_STATUSES;

    const { items, total } = await reportRepository.list(
      scope,
      { status: statuses },
      query.page,
      query.pageSize,
    );

    // C1 orders its queue by urgency, then by age - the reference's own
    // "لديك N مهام تحتاج إلى متابعة" list is priority-led, not date-led.
    const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    const now = new Date();
    const sorted = [...items].sort((a, b) => {
      const rank = priorityRank[a.priority] - priorityRank[b.priority];
      if (rank !== 0) return rank;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return {
      items: sorted.map((r) => toReportSummaryDto(r, viewer, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async technicianTaskSummary(principal: Principal) {
    const { viewer, scope } = await resolveViewer(principal);
    const technicianId = viewer.technicianId!;

    const [rows, active] = await Promise.all([
      prisma.report.groupBy({
        by: ['status', 'priority'],
        where: { AND: [scope, { status: { in: ACTIVE_REPORT_STATUSES } }] },
        _count: { _all: true },
      }),
      reportRepository.findActiveRepairByTechnician(technicianId),
    ]);

    const byPriority = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byPriority[row.priority] += row._count._all;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + row._count._all;
      total += row._count._all;
    }

    return {
      total,
      byPriority,
      byStatus,
      awaitingOwnerApprovalCount: byStatus[ReportStatus.AWAITING_OWNER_APPROVAL] ?? 0,
      activeRepair: active
        ? { reportId: active.report.id, reportNumber: active.report.reportNumber }
        : null,
    };
  },

  async technicianRepairHistory(query: ListRepairHistoryQueryDto, principal: Principal) {
    const { viewer } = await resolveViewer(principal);
    const technicianId = viewer.technicianId!;

    const [rows, total] = await reportRepository.listRepairHistory(
      technicianId,
      query.page,
      query.pageSize,
    );
    const stats = await reportRepository.technicianStats(technicianId);
    const now = new Date();

    // Task 10: ONE batched signing call for the whole page's photos, not one
    // per report and certainly not one per photo (decisions.md J15/K3).
    const signedByKey = await signMediaKeys(rows.map((row) => row.report));

    return {
      items: rows.map((row) => ({
        repairId: row.id,
        durationMinutes: row.durationMinutes,
        startedAt: row.startedAt,
        submittedAt: row.submittedAt,
        closedAt: row.homeownerDecisionAt,
        technicianNote: row.technicianNote,
        review: row.review
          ? { rating: row.review.rating, comment: row.review.comment, createdAt: row.review.createdAt }
          : null,
        // The DETAIL dto, not the summary: C3 shows the real before/after
        // photos inline, so deferring them to a second request would be a
        // worse screen for no benefit.
        report: applySignedMedia(toReportDetailDto(row.report, viewer, now), row.report, signedByKey),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      // Real aggregates only - never the reference mock's hardcoded "143".
      stats,
    };
  },

  // -------------------------------------------------------------------------
  // POST /api/reports/routing/retry - protected, cron-suitable (decisions.md I9)
  // -------------------------------------------------------------------------
  async retryRouting(providedSecret: string | undefined) {
    if (!env.routing.retrySecret) {
      throw new ServiceUnavailableError(
        'Routing retry is not configured in this environment',
        'ROUTING_RETRY_NOT_CONFIGURED',
      );
    }
    if (!providedSecret || !safeEqual(providedSecret, env.routing.retrySecret)) {
      throw new AuthenticationError('Invalid routing retry credentials', 'INVALID_TOKEN');
    }
    return reportRoutingService.retryPending();
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export class ActiveRepairExistsError extends BusinessError {
  readonly blockingReportId: string | null;
  readonly blockingReportNumber: number | null;

  constructor(blockingReportId: string | null, blockingReportNumber: number | null) {
    super('You already have an active repair in progress', 'ACTIVE_REPAIR_EXISTS');
    this.blockingReportId = blockingReportId;
    this.blockingReportNumber = blockingReportNumber;
    // C1 renders a "you are already working on #NNNN" lock screen with a link -
    // it needs the reference, not just the code (decisions.md I8).
    this.details = { blockingReportId, blockingReportNumber };
  }
}

function isActiveRepairUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    JSON.stringify(err.meta ?? {}).includes('report_repairs_active_technician_unique')
  );
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * A staged media key is only usable by the homeowner who staged it - the
 * prefix is server-derived from the authenticated user id, so one homeowner's
 * uploads can never be attached to another's report (decisions.md I11).
 */
function assertOwnedStagingKeys(keys: string[], userId: string): string[] {
  const prefix = stagingPrefix(userId);
  const unique = Array.from(new Set(keys));
  if (unique.length !== keys.length) {
    throw new ValidationError('Duplicate photo references');
  }
  if (unique.length > MAX_HOMEOWNER_PHOTOS) {
    throw new ValidationError(`At most ${MAX_HOMEOWNER_PHOTOS} photos are allowed`);
  }
  for (const key of unique) {
    if (!key.startsWith(prefix) || key.includes('..')) {
      throw new ValidationError('Unknown photo reference');
    }
  }
  return unique;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function mimeTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

/**
 * The adapter owns URL construction - the service must not know the driver.
 *
 * Task 10: with the PRIVATE Supabase bucket there is no durable URL to store
 * at all (a signature would expire long before the row does), so this returns
 * an empty string and `withSignedMedia()` below mints a fresh signed URL on
 * every read. The `test` driver still has a stable /files URL and keeps it.
 */
function mediaUrlForKey(key: string): string {
  try {
    return reportMediaStorage.publicUrl(key);
  } catch {
    return '';
  }
}

/**
 * Task 10 (decisions.md K3) - replaces every media `url` on an outgoing report
 * DTO with a freshly-minted, short-lived signed URL.
 *
 * This is NOT the authorization step. Authorization already happened: the
 * caller only holds this DTO because `loadScopedReport`/`requireOwnReport`
 * decided they may see this report. Signing is what lets a plain <img> load
 * the bytes without carrying a bearer token, and it is what keeps the object
 * unreachable to anyone who merely guesses the key.
 *
 * One batched signing call per DTO, never one per photo (J15's bounded-fan-out
 * discipline). A key that fails to sign keeps whatever URL was stored - which
 * for a private object is the empty string, i.e. an honest missing image.
 */
async function signMediaKeys(sources: ReportWithRelations[]): Promise<Map<string, string>> {
  const keys = sources.flatMap((source) => source.media.map((m) => m.storageKey));
  if (keys.length === 0) return new Map();
  return reportMediaStorage.signedUrls(keys).catch(() => new Map<string, string>());
}

function applySignedMedia<T extends { media: { id: string; url: string }[] }>(
  dto: T,
  source: ReportWithRelations,
  signedByKey: Map<string, string>,
): T {
  if (dto.media.length === 0) return dto;
  const keyById = new Map(source.media.map((m) => [m.id, m.storageKey]));
  return {
    ...dto,
    media: dto.media.map((m) => {
      const key = keyById.get(m.id);
      const url = key ? signedByKey.get(key) : undefined;
      return url ? { ...m, url } : m;
    }),
  };
}

async function withSignedMedia<T extends { media: { id: string; url: string }[] }>(
  dto: T,
  source: ReportWithRelations,
): Promise<T> {
  if (dto.media.length === 0) return dto;
  return applySignedMedia(dto, source, await signMediaKeys([source]));
}

async function requireOwnReport(reportId: string, principal: Principal): Promise<ReportWithRelations> {
  if (principal.role !== UserRole.HOMEOWNER) {
    // Structurally unreachable through the router (homeownerOnly guard), kept
    // as a service-level backstop so a future caller cannot bypass it.
    throw new AuthorizationError('You do not have permission to perform this action.');
  }
  const report = await reportRepository.findById(reportId);
  if (!report || report.homeownerId !== principal.id) {
    throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  }
  return report;
}

async function requireAssignedTechnician(
  reportId: string,
  principal: Principal,
): Promise<{ report: ReportWithRelations; technicianId: string }> {
  if (principal.role !== UserRole.TECHNICIAN) {
    throw new AuthorizationError('You do not have permission to perform this action.');
  }
  const technician = await technicianRepository.findByUserId(principal.id);
  if (!technician) {
    throw new AuthorizationError('You do not have permission to perform this action.');
  }
  const report = await reportRepository.findById(reportId);
  // A technician must not be able to tell the difference between "not yours"
  // and "does not exist" (I12).
  if (!report || report.assignedTechnicianId !== technician.id) {
    throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  }
  return { report, technicianId: technician.id };
}

async function notifyAfterCreate(
  report: ReportWithRelations,
  routed: boolean,
  reasonCode: string,
): Promise<void> {
  try {
    await notificationService.send(
      report.homeownerId,
      'تم استلام بلاغك',
      `تم استلام بلاغك #${report.reportNumber}.`,
    );

    if (routed && report.assignedTechnician) {
      await notificationService.send(
        report.assignedTechnician.user.id,
        'بلاغ جديد',
        `تم إسناد البلاغ #${report.reportNumber} إليك.`,
      );
    } else if (!routed) {
      await notifyRoutingPending(report.id, report.projectId, reasonCode);
    }
  } catch (err) {
    // A notification failure must never undo a committed report.
    logger.error('Report creation notifications failed', {
      reportId: report.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
