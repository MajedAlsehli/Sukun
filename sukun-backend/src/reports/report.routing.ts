import {
  Prisma,
  ReportActorType,
  ReportCategory,
  ReportRepairStatus,
  ReportRoutingState,
  ReportStatus,
  ReportTimelineEventType,
  TechnicianStatus,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../shared/logger';
import { writeAuditLog } from '../shared/audit.service';
import { notificationService } from '../notifications/notification.service';
import { reportRepository, Db } from './report.repository';
import {
  ACTIVE_REPORT_STATUSES,
  isGeneralMaintenanceSpecialty,
  specialtyMatchesCategory,
} from './report.types';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I8/I9): AUTOMATIC ROUTING.
//
// There is no human assignment anywhere in the canonical domain. No endpoint
// accepts a technician id; no role - homeowner, technician, PM, or company -
// can choose an assignee. Selection is a pure, deterministic function of the
// database state, so the same state always routes the same way (which is what
// makes the routing tests meaningful rather than flaky).
// ---------------------------------------------------------------------------

export type RoutingReasonCode =
  | 'SPECIALTY_MATCH'
  | 'GENERAL_MAINTENANCE_FALLBACK'
  | 'ANY_ELIGIBLE_FALLBACK'
  | 'NO_ACTIVE_TECHNICIAN_IN_PROJECT'
  | 'NO_ELIGIBLE_TECHNICIAN';

export interface RoutingCandidate {
  id: string;
  specialty: string | null;
  lastAssignedAt: Date | null;
  hasActiveRepair: boolean;
  openReportCount: number;
}

export interface RoutingDecision {
  technicianId: string | null;
  reasonCode: RoutingReasonCode;
}

/** A technician may never be routed to while inactive or still un-onboarded (invariant 10). */
export const ROUTABLE_TECHNICIAN_STATUSES: TechnicianStatus[] = [
  TechnicianStatus.ACTIVATED,
  TechnicianStatus.AVAILABLE,
  TechnicianStatus.BUSY,
];

/**
 * The whole selection rule, isolated from Prisma so it can be tested exhaustively
 * as a pure function.
 *
 * Tiers (decisions.md I8), in order:
 *   1. SPECIALTY_MATCH               - specialty maps to this category's group
 *   2. GENERAL_MAINTENANCE_FALLBACK  - a "صيانة عامة" technician
 *   3. ANY_ELIGIBLE_FALLBACK         - any eligible technician (also covers
 *                                      rows with no specialty recorded)
 *
 * Within a tier the order is total and deterministic:
 *   (a) no active repair first
 *   (b) fewest open canonical reports
 *   (c) oldest lastAssignedAt (never-assigned first)
 *   (d) technician id ascending  <- guarantees no ties remain
 */
export function selectTechnician(
  candidates: RoutingCandidate[],
  category: ReportCategory,
): RoutingDecision {
  if (candidates.length === 0) {
    return { technicianId: null, reasonCode: 'NO_ELIGIBLE_TECHNICIAN' };
  }

  const tiers: { reasonCode: RoutingReasonCode; members: RoutingCandidate[] }[] = [
    {
      reasonCode: 'SPECIALTY_MATCH',
      members: candidates.filter((c) => specialtyMatchesCategory(c.specialty, category)),
    },
    {
      reasonCode: 'GENERAL_MAINTENANCE_FALLBACK',
      members: candidates.filter(
        (c) => !specialtyMatchesCategory(c.specialty, category) && isGeneralMaintenanceSpecialty(c.specialty),
      ),
    },
    { reasonCode: 'ANY_ELIGIBLE_FALLBACK', members: candidates },
  ];

  for (const tier of tiers) {
    if (tier.members.length === 0) continue;
    const [best] = [...tier.members].sort(compareCandidates);
    return { technicianId: best.id, reasonCode: tier.reasonCode };
  }

  /* istanbul ignore next - unreachable: tier 3 always contains every candidate. */
  return { technicianId: null, reasonCode: 'NO_ELIGIBLE_TECHNICIAN' };
}

export function compareCandidates(a: RoutingCandidate, b: RoutingCandidate): number {
  if (a.hasActiveRepair !== b.hasActiveRepair) return a.hasActiveRepair ? 1 : -1;
  if (a.openReportCount !== b.openReportCount) return a.openReportCount - b.openReportCount;
  const at = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -1;
  const bt = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -1;
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Loads every routable technician in a project, with the workload facts the tie-break needs. */
export async function loadRoutingCandidates(projectId: string, db: Db = prisma): Promise<RoutingCandidate[]> {
  const technicians = await db.technician.findMany({
    where: {
      projectId,
      status: { in: ROUTABLE_TECHNICIAN_STATUSES },
      // Invariant 10/11: a deactivated *account* is as ineligible as a
      // deactivated technician record. Checked here rather than trusted from
      // a possibly-stale access token (D4).
      user: { status: UserStatus.ACTIVE },
    },
    select: {
      id: true,
      specialty: true,
      lastAssignedAt: true,
      _count: {
        select: {
          reportRepairs: { where: { status: ReportRepairStatus.IN_PROGRESS } },
          assignedReports: { where: { status: { in: ACTIVE_REPORT_STATUSES } } },
        },
      },
    },
  });

  return technicians.map((t) => ({
    id: t.id,
    specialty: t.specialty,
    lastAssignedAt: t.lastAssignedAt,
    hasActiveRepair: t._count.reportRepairs > 0,
    openReportCount: t._count.assignedReports,
  }));
}

interface AssignResult {
  assigned: boolean;
  technicianId: string | null;
  reasonCode: RoutingReasonCode;
}

/**
 * Routes ONE report, transactionally and idempotently.
 *
 * Concurrency safety comes from the guarded `updateMany` inside the
 * transaction: it re-asserts `status = ROUTING_PENDING` in the WHERE clause, so
 * two concurrent routers racing on the same report produce exactly one winner
 * and the loser updates zero rows and reports `assigned: false` without writing
 * a timeline event (decisions.md I9's "no duplicate assignments").
 */
export async function routeReport(reportId: string, db: Db): Promise<AssignResult> {
  const report = await db.report.findUnique({
    where: { id: reportId },
    select: { id: true, projectId: true, category: true, status: true, originalTechnicianId: true },
  });

  if (!report || report.status !== ReportStatus.ROUTING_PENDING) {
    return { assigned: false, technicianId: null, reasonCode: 'NO_ELIGIBLE_TECHNICIAN' };
  }

  const candidates = await loadRoutingCandidates(report.projectId, db);
  const decision =
    candidates.length === 0
      ? { technicianId: null, reasonCode: 'NO_ACTIVE_TECHNICIAN_IN_PROJECT' as RoutingReasonCode }
      : selectTechnician(candidates, report.category);

  const now = new Date();

  if (!decision.technicianId) {
    await db.report.update({
      where: { id: reportId },
      data: {
        routingState: ReportRoutingState.PENDING,
        routingReasonCode: decision.reasonCode,
        routingAttemptCount: { increment: 1 },
        lastRoutingAttemptAt: now,
      },
    });
    return { assigned: false, technicianId: null, reasonCode: decision.reasonCode };
  }

  const updated = await db.report.updateMany({
    where: { id: reportId, status: ReportStatus.ROUTING_PENDING },
    data: {
      status: ReportStatus.ROUTED,
      routingState: ReportRoutingState.ROUTED,
      routingReasonCode: decision.reasonCode,
      routingAttemptCount: { increment: 1 },
      lastRoutingAttemptAt: now,
      assignedTechnicianId: decision.technicianId,
      // Written once, at the first successful assignment, and never updated -
      // the permanent historical record of who the system originally routed to.
      ...(report.originalTechnicianId ? {} : { originalTechnicianId: decision.technicianId }),
      assignedAt: now,
    },
  });

  if (updated.count === 0) {
    // Lost the race - another transaction already routed this report.
    return { assigned: false, technicianId: null, reasonCode: decision.reasonCode };
  }

  await db.technician.update({
    where: { id: decision.technicianId },
    data: { lastAssignedAt: now },
  });

  await reportRepository.appendTimelineEvent(
    {
      reportId,
      type: ReportTimelineEventType.TECHNICIAN_ASSIGNED,
      actorType: ReportActorType.SYSTEM,
      metadata: { technicianId: decision.technicianId, reasonCode: decision.reasonCode },
    },
    db,
  );

  return { assigned: true, technicianId: decision.technicianId, reasonCode: decision.reasonCode };
}

export const reportRoutingService = {
  selectTechnician,
  routeReport,

  /**
   * Retry every still-pending report, optionally narrowed to one project.
   *
   * Idempotent by construction: it only ever reads reports whose status is
   * still ROUTING_PENDING, and each assignment runs in its own transaction that
   * re-asserts that status. Re-running with nothing to do performs no writes
   * and appends no timeline events.
   *
   * Called from four real triggers (technician activation, reactivation,
   * transfer into a project, a technician freeing up) plus the protected
   * endpoint - decisions.md I9, which Task 10's Vercel Cron calls every 15
   * minutes.
   */
  async retryPending(options: { projectId?: string; limit?: number } = {}) {
    const limit = options.limit ?? 200;
    const pending = await prisma.report.findMany({
      where: {
        status: ReportStatus.ROUTING_PENDING,
        ...(options.projectId ? { projectId: options.projectId } : {}),
      },
      select: { id: true, projectId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    let assignedCount = 0;
    const stillPending: string[] = [];

    for (const row of pending) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const outcome = await routeReport(row.id, tx);
          if (outcome.assigned) {
            await reportRepository.appendTimelineEvent(
              {
                reportId: row.id,
                type: ReportTimelineEventType.ROUTING_RETRIED,
                actorType: ReportActorType.SYSTEM,
                metadata: { outcome: 'ASSIGNED', reasonCode: outcome.reasonCode },
              },
              tx,
            );
          }
          return outcome;
        });

        if (result.assigned) {
          assignedCount += 1;
          await notifyRouted(row.id, result.technicianId!);
        } else {
          stillPending.push(row.id);
        }
      } catch (err) {
        // One bad report must never stop the retry sweep for the rest.
        logger.error('Routing retry failed for a report', {
          reportId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        stillPending.push(row.id);
      }
    }

    if (assignedCount > 0) {
      await writeAuditLog({
        userId: null,
        action: 'REPORT_ROUTING_RETRY_COMPLETED',
        entity: 'Report',
        entityId: null,
        metadata: { scanned: pending.length, assigned: assignedCount, projectId: options.projectId ?? null },
      });
    }

    return { scanned: pending.length, assigned: assignedCount, stillPending: stillPending.length };
  },

  /**
   * Fire-and-forget wrapper for the four in-process triggers. A retry sweep
   * must never make the action that triggered it (activating a technician,
   * approving a repair) fail or hang.
   */
  scheduleRetry(projectId?: string): void {
    void reportRoutingService.retryPending({ projectId }).catch((err) => {
      logger.error('Background routing retry failed', {
        projectId: projectId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  },
};

async function notifyRouted(reportId: string, technicianId: string): Promise<void> {
  const [report, technician] = await Promise.all([
    prisma.report.findUnique({
      where: { id: reportId },
      select: { reportNumber: true, homeownerId: true },
    }),
    prisma.technician.findUnique({ where: { id: technicianId }, select: { userId: true } }),
  ]);
  if (!report || !technician) return;

  await notificationService.send(
    technician.userId,
    'بلاغ جديد',
    `تم إسناد البلاغ #${report.reportNumber} إليك.`,
  );
  await notificationService.send(
    report.homeownerId,
    'تم توجيه بلاغك',
    `تم تعيين فنيّ مختص لبلاغك #${report.reportNumber}.`,
  );
}

/**
 * Notifies the project's PM and the owning company that a report could not be
 * routed. Deliberately does NOT offer them any way to assign it manually - the
 * notification is supervisory (invariant 12), and the system retries on its own.
 */
export async function notifyRoutingPending(
  reportId: string,
  projectId: string,
  reasonCode: string,
): Promise<void> {
  const [report, project] = await Promise.all([
    prisma.report.findUnique({ where: { id: reportId }, select: { reportNumber: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        projectManager: { select: { userId: true } },
        company: { select: { users: { where: { role: 'COMPANY' }, select: { id: true } } } },
      },
    }),
  ]);
  if (!report || !project) return;

  const title = 'بلاغ بانتظار التوجيه';
  const body = `البلاغ #${report.reportNumber} في «${project.name}» لم يُوجَّه بعد (${reasonCode}). سيُعاد المحاولة تلقائياً.`;

  const recipients = new Set<string>();
  if (project.projectManager?.userId) recipients.add(project.projectManager.userId);
  for (const user of project.company?.users ?? []) recipients.add(user.id);

  for (const userId of recipients) {
    await notificationService.send(userId, title, body);
  }
}

export type { Prisma };
