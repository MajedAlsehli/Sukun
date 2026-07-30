import { ReportStatus, UserRole } from '@prisma/client';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { reportService, type Principal } from '../reports/report.service';
import { CONFIGURED_AT_RISK_FRACTION } from '../reports/report.mapper';
import {
  computeSlaState,
  REPORT_SLA_AT_RISK_POLICY_VERSION,
  REPORT_SLA_RULES_VERSION,
} from '../reports/report.types';
import { AuthorizationError, NotFoundError } from '../shared/errors';
import { env } from '../config/env';
import { logger } from '../shared/logger';
import { pmRepository } from './pm.repository';
import {
  averageMinutes,
  computeSlaCompliance,
  currentMonthRange,
  foldStatusCounts,
  generateAlerts,
  PmAlertRules,
  resolveTechnicianLoad,
  SlaEvaluableReport,
} from './pm.types';
import {
  PmActivityDto,
  PmActivityItemDto,
  PmAlertsDto,
  PmContractorCardDto,
  PmContractorProfileDto,
  PmContractorsDto,
  PmContractorStatsDto,
  PmOverviewDto,
  toAlertDto,
} from './pm.mapper';
import {
  buildCandidates,
  hoursSince,
  MAX_SNAPSHOT_ALERTS,
  MAX_SNAPSHOT_REPORTS,
  MAX_SNAPSHOT_TECHNICIANS,
  sanitizeChatMessage,
  validateReferences,
} from './pm.copilot';
import {
  MAX_REFERENCES,
  PM_COPILOT_MODEL,
  pmCopilotProvider,
  pmInsightProvider,
  PmCopilotProvider,
  PmCopilotSnapshot,
  PmInsightProvider,
  PmTechnicianInsightSnapshot,
} from './providers/pm-copilot.provider';
import { ListReportsQueryDto } from '../reports/report.dto';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md Part J).
//
// The PM is SUPERVISORY AND READ-ONLY. This service performs no write of any
// kind - it has no transaction, no create/update call, and no import of any
// mutating service. That is the guarantee, and it is structural: the only
// repositories it touches expose reads.
// ---------------------------------------------------------------------------

// The ONE principal shape, reused from the canonical report service rather
// than redeclared - a second, subtly-looser copy is exactly how a scoping bug
// gets in.
export type { Principal };

const MAX_ALERTS = 50;
const MAX_ACTIVITY = 50;
const DEFAULT_ACTIVITY = 20;
const MAX_RECENT_REPORTS = 10;
const MAX_REVIEWS = 10;

/**
 * decisions.md J7 - only audit actions that ALREADY exist are displayed. An
 * unknown action is dropped rather than rendered raw, so a future audit string
 * can never leak into a PM's feed unlabelled.
 */
const TECHNICIAN_AUDIT_ACTIONS = new Set([
  'TECHNICIAN_REGISTERED',
  'TECHNICIAN_ACTIVATED',
  'TECHNICIAN_STATUS_UPDATED',
  'TECHNICIAN_TRANSFERRED',
  'TECHNICIAN_REACTIVATED',
  'TECHNICIAN_DEACTIVATED',
  'TECHNICIAN_CONTACT_UPDATED',
  'TECHNICIAN_INVITATION_RESENT',
]);

export interface PmScope {
  /** Null for a manager in E3's unassigned pool - an honest state, not an error. */
  projectId: string | null;
}

/**
 * decisions.md J2. The PM's project comes from the DATABASE, keyed by the
 * authenticated principal. A `projectId` query parameter is INTERSECTED with
 * that, never substituted for it: a foreign value 404s (hide existence, I12),
 * it does not quietly filter to empty.
 */
export async function resolvePmScope(
  principal: Principal,
  requestedProjectId?: string,
): Promise<PmScope> {
  if (principal.role !== UserRole.PROJECT_MANAGER) {
    throw new AuthorizationError('You do not have permission to perform this action.');
  }
  const manager = await projectManagerRepository.findByUserId(principal.id);
  const assignedProjectId = manager?.projectId ?? null;

  if (requestedProjectId && requestedProjectId !== assignedProjectId) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }
  return { projectId: assignedProjectId };
}

function unassignedOverview(now: Date): PmOverviewDto {
  const { periodStart, periodEnd } = currentMonthRange(now);
  return {
    assigned: false,
    project: null,
    kpis: {
      openReports: 0,
      inProgress: 0,
      awaitingOwnerApproval: 0,
      closedThisMonth: 0,
      slaCompliancePercent: null,
      averageResolutionTimeMinutes: null,
    },
    period: { start: periodStart, end: periodEnd },
    sla: {
      eligibleCount: 0,
      metCount: 0,
      breachedCount: 0,
      rulesVersion: REPORT_SLA_RULES_VERSION,
      atRiskPolicy: {
        configured: CONFIGURED_AT_RISK_FRACTION != null,
        fraction: CONFIGURED_AT_RISK_FRACTION,
        version: REPORT_SLA_AT_RISK_POLICY_VERSION,
      },
    },
    totalActiveReports: 0,
    generatedAt: now,
  };
}

function alertRules(): PmAlertRules {
  return {
    awaitingApprovalHours: env.pmAlerts.awaitingApprovalHours,
    stalledHours: env.pmAlerts.stalledHours,
  };
}

function toSlaEvaluable(
  rows: Array<{
    id: string;
    createdAt: Date;
    slaStartDueAt: Date | null;
    assignedTechnicianId: string | null;
    repair: { startedAt: Date } | null;
  }>,
): SlaEvaluableReport[] {
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    slaStartDueAt: r.slaStartDueAt,
    repairStartedAt: r.repair?.startedAt ?? null,
    assignedTechnicianId: r.assignedTechnicianId,
  }));
}

export const pmService = {
  // -------------------------------------------------------------------------
  // GET /api/pm/overview (decisions.md J4)
  // -------------------------------------------------------------------------
  async overview(principal: Principal, requestedProjectId?: string): Promise<PmOverviewDto> {
    const now = new Date();
    const { projectId } = await resolvePmScope(principal, requestedProjectId);
    if (!projectId) return unassignedOverview(now);

    const { periodStart, periodEnd } = currentMonthRange(now);

    // Aggregates, not one query per KPI (J15) - but issued in BOUNDED BATCHES
    // rather than one wide Promise.all. The shared Supabase pooler caps this
    // project at 15 session-mode clients, and a browser pass with several
    // signed-in tabs polling at once genuinely exhausted it. Capping the peak
    // connections a single request holds is the fix that actually helps.
    const [project, statusRows, closedThisMonth] = await Promise.all([
      pmRepository.findManagedProject(projectId),
      pmRepository.statusCounts(projectId),
      pmRepository.countClosedInPeriod(projectId, periodStart, periodEnd),
    ]);
    const [resolutionRows, slaRows] = await Promise.all([
      pmRepository.closedResolutionTimestamps(projectId),
      pmRepository.slaEvaluableReports(projectId),
    ]);

    /* istanbul ignore next - a ProjectManager row cannot point at a missing project. */
    if (!project) throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');

    const counts = foldStatusCounts(statusRows);
    const sla = computeSlaCompliance(toSlaEvaluable(slaRows), now, CONFIGURED_AT_RISK_FRACTION);

    const resolutionMinutes = resolutionRows
      .filter((r) => r.closedAt != null)
      .map((r) => Math.round((r.closedAt!.getTime() - r.createdAt.getTime()) / 60_000));

    return {
      assigned: true,
      project: {
        id: project.id,
        name: project.name,
        code: project.code,
        city: project.city,
        district: project.district,
        status: project.status,
        isActive: project.isActive,
      },
      kpis: {
        openReports: counts.openReports,
        inProgress: counts.inProgress,
        awaitingOwnerApproval: counts.awaitingOwnerApproval,
        closedThisMonth,
        slaCompliancePercent: sla.compliancePercent,
        averageResolutionTimeMinutes: averageMinutes(resolutionMinutes),
      },
      period: { start: periodStart, end: periodEnd },
      sla: {
        eligibleCount: sla.eligibleCount,
        metCount: sla.metCount,
        breachedCount: sla.breachedCount,
        rulesVersion: REPORT_SLA_RULES_VERSION,
        atRiskPolicy: {
          configured: CONFIGURED_AT_RISK_FRACTION != null,
          fraction: CONFIGURED_AT_RISK_FRACTION,
          version: REPORT_SLA_AT_RISK_POLICY_VERSION,
        },
      },
      totalActiveReports: counts.openReports + counts.inProgress + counts.awaitingOwnerApproval,
      generatedAt: now,
    };
  },

  // -------------------------------------------------------------------------
  // GET /api/pm/alerts (decisions.md J6)
  // -------------------------------------------------------------------------
  async alerts(principal: Principal, requestedProjectId?: string): Promise<PmAlertsDto> {
    const now = new Date();
    const { projectId } = await resolvePmScope(principal, requestedProjectId);
    const rules = alertRules();

    if (!projectId) {
      return { assigned: false, items: [], total: 0, rules, generatedAt: now };
    }

    const candidates = await pmRepository.alertCandidates(projectId, MAX_ALERTS * 2);
    const alerts = generateAlerts(
      candidates.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        status: r.status,
        priority: r.priority,
        problemText: r.problemText,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdAtDue: r.slaStartDueAt,
        repairStartedAt: r.repair?.startedAt ?? null,
        repairSubmittedAt: r.repair?.submittedAt ?? null,
        reopenCount: r.reopenCount,
        routingReasonCode: r.routingReasonCode,
        assignedTechnicianId: r.assignedTechnicianId,
        assignedTechnicianName: r.assignedTechnician?.user.name ?? null,
      })),
      rules,
      now,
      CONFIGURED_AT_RISK_FRACTION,
    );

    return {
      assigned: true,
      items: alerts.slice(0, MAX_ALERTS).map(toAlertDto),
      total: alerts.length,
      rules,
      generatedAt: now,
    };
  },

  // -------------------------------------------------------------------------
  // GET /api/pm/activity (decisions.md J7)
  // -------------------------------------------------------------------------
  async activity(
    principal: Principal,
    options: { limit?: number; projectId?: string } = {},
  ): Promise<PmActivityDto> {
    const now = new Date();
    const { projectId } = await resolvePmScope(principal, options.projectId);
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_ACTIVITY, 1), MAX_ACTIVITY);

    if (!projectId) return { assigned: false, items: [], generatedAt: now };

    const roster = await pmRepository.rosterTechnicians(projectId);
    const rosterIds = roster.map((t) => t.id);
    const historical = await pmRepository.historicalTechnicians(projectId, rosterIds);
    const technicianIds = [...rosterIds, ...historical.map((t) => t.id)];
    const nameById = new Map(
      [...roster, ...historical].map((t) => [t.id, t.user.name] as const),
    );

    const [timeline, audits] = await Promise.all([
      pmRepository.timelineEvents(projectId, limit),
      pmRepository.technicianAuditEvents(technicianIds, limit),
    ]);

    const items: PmActivityItemDto[] = [
      ...timeline.map((event) => ({
        id: `timeline:${event.id}`,
        type: event.type as string,
        source: 'REPORT_TIMELINE' as const,
        actorType: event.actorType as string,
        actorName: event.actor?.name ?? null,
        occurredAt: event.createdAt,
        target: {
          type: 'report' as const,
          id: event.report.id,
          label: `#${event.report.reportNumber}`,
        },
      })),
      ...audits
        // No invented action strings: an unrecognised one is dropped, not
        // rendered raw into a manager's feed (J7).
        .filter((a) => TECHNICIAN_AUDIT_ACTIONS.has(a.action) && a.entityId != null)
        .map((a) => ({
          id: `audit:${a.id}`,
          type: a.action,
          source: 'TECHNICIAN_AUDIT' as const,
          actorType: 'SYSTEM',
          actorName: a.user?.name ?? null,
          occurredAt: a.timestamp,
          target: {
            type: 'technician' as const,
            id: a.entityId as string,
            label: nameById.get(a.entityId as string) ?? '',
          },
        })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);

    return { assigned: true, items, generatedAt: now };
  },

  // -------------------------------------------------------------------------
  // GET /api/pm/reports (decisions.md J8)
  //
  // Delegates to the ONE canonical read model. No second report query, no
  // second business rule, no duplicated scoping - `reportService.list` builds
  // the PM scope from the principal itself (I12).
  // -------------------------------------------------------------------------
  async reports(principal: Principal, query: ListReportsQueryDto) {
    // Still resolve the PM scope first, so an unassigned manager and a foreign
    // projectId behave identically here and on every other PM endpoint.
    await resolvePmScope(principal, query.projectId);
    return reportService.list(query, principal);
  },

  // -------------------------------------------------------------------------
  // GET /api/pm/contractors (decisions.md J9)
  // -------------------------------------------------------------------------
  async contractors(principal: Principal, requestedProjectId?: string): Promise<PmContractorsDto> {
    const now = new Date();
    const { projectId } = await resolvePmScope(principal, requestedProjectId);

    if (!projectId) {
      return {
        assigned: false,
        kpis: {
          totalTechnicians: 0,
          available: 0,
          busy: 0,
          averageRating: null,
          averageRepairDurationMinutes: null,
          awaitingStartReports: 0,
          historicalTechnicians: 0,
        },
        items: [],
        generatedAt: now,
      };
    }

    const roster = await pmRepository.rosterTechnicians(projectId);
    const rosterIds = roster.map((t) => t.id);
    const historical = await pmRepository.historicalTechnicians(projectId, rosterIds);
    const all = [
      ...roster.map((t) => ({ ...t, membership: 'CURRENT' as const })),
      ...historical.map((t) => ({ ...t, membership: 'HISTORICAL' as const })),
    ];
    const allIds = all.map((t) => t.id);

    // Grouped aggregates + one bounded SLA scan - never one query per
    // technician (J15) - issued in two bounded batches so a single request
    // never holds six pooler connections at once.
    const [openCounts, repairStats, reviewStats] = await Promise.all([
      pmRepository.openReportCounts(projectId, allIds),
      pmRepository.completedRepairStats(projectId, allIds),
      pmRepository.reviewStats(projectId, allIds),
    ]);
    const [activeRepairIds, statusRows, slaRows] = await Promise.all([
      pmRepository.technicianIdsWithActiveRepair(allIds),
      pmRepository.statusCounts(projectId),
      pmRepository.slaEvaluableReports(projectId),
    ]);

    const slaEvaluable = toSlaEvaluable(slaRows);
    const slaByTechnician = new Map<string, SlaEvaluableReport[]>();
    for (const row of slaEvaluable) {
      if (!row.assignedTechnicianId) continue;
      const bucket = slaByTechnician.get(row.assignedTechnicianId) ?? [];
      bucket.push(row);
      slaByTechnician.set(row.assignedTechnicianId, bucket);
    }

    const items: PmContractorCardDto[] = all.map((technician) => {
      const repairs = repairStats.get(technician.id);
      const reviews = reviewStats.get(technician.id);
      const sla = computeSlaCompliance(
        slaByTechnician.get(technician.id) ?? [],
        now,
        CONFIGURED_AT_RISK_FRACTION,
      );

      return {
        technicianId: technician.id,
        name: technician.user.name,
        specialty: technician.specialty,
        technicianStatus: technician.status,
        membership: technician.membership,
        load: resolveTechnicianLoad({
          technicianStatus: technician.status,
          userStatus: technician.user.status,
          hasActiveRepair: activeRepairIds.has(technician.id),
        }),
        stats: {
          openReportsCount: openCounts.get(technician.id) ?? 0,
          completedReportsCount: repairs?.completed ?? 0,
          averageRepairDurationMinutes: repairs?.averageDurationMinutes ?? null,
          averageRating: reviews?.averageRating ?? null,
          reviewsCount: reviews?.reviewsCount ?? 0,
          slaCompliancePercent: sla.compliancePercent,
          slaEligibleCount: sla.eligibleCount,
        },
      };
    });

    // Header KPIs count the CURRENT roster only - historical technicians are
    // real history, not current capacity (J9).
    const current = items.filter((i) => i.membership === 'CURRENT');
    const ratedCurrent = current.filter((i) => i.stats.averageRating != null);
    const durationCurrent = current.filter((i) => i.stats.averageRepairDurationMinutes != null);
    const statusCounts = foldStatusCounts(statusRows);

    return {
      assigned: true,
      kpis: {
        totalTechnicians: current.length,
        available: current.filter((i) => i.load === 'AVAILABLE').length,
        busy: current.filter((i) => i.load === 'BUSY').length,
        // Honest null (never 0) when nobody on the roster has a review yet.
        averageRating:
          ratedCurrent.length > 0
            ? Number(
                (
                  ratedCurrent.reduce((sum, i) => sum + (i.stats.averageRating as number), 0) /
                  ratedCurrent.length
                ).toFixed(2),
              )
            : null,
        averageRepairDurationMinutes: averageMinutes(
          durationCurrent.map((i) => i.stats.averageRepairDurationMinutes as number),
        ),
        awaitingStartReports: statusCounts.openReports,
        historicalTechnicians: items.length - current.length,
      },
      items,
      generatedAt: now,
    };
  },

  // -------------------------------------------------------------------------
  // GET /api/pm/contractors/:technicianId/performance (decisions.md J9/J10)
  // -------------------------------------------------------------------------
  async contractorPerformance(
    principal: Principal,
    technicianId: string,
  ): Promise<PmContractorProfileDto> {
    const now = new Date();
    const { projectId, technician, membership } = await this.requireScopedTechnician(
      principal,
      technicianId,
    );

    // Same bounded-batch discipline as `contractors` above (J15).
    const [openCounts, repairStats, reviewStats] = await Promise.all([
      pmRepository.openReportCounts(projectId, [technicianId]),
      pmRepository.completedRepairStats(projectId, [technicianId]),
      pmRepository.reviewStats(projectId, [technicianId]),
    ]);
    const [activeRepairIds, recentReports, reviews, slaRows] = await Promise.all([
      pmRepository.technicianIdsWithActiveRepair([technicianId]),
      pmRepository.recentReportsForTechnician(projectId, technicianId, MAX_RECENT_REPORTS),
      pmRepository.reviewsForTechnician(projectId, technicianId, MAX_REVIEWS),
      pmRepository.slaEvaluableReportsForTechnician(projectId, technicianId),
    ]);

    const repairs = repairStats.get(technicianId);
    const reviewAgg = reviewStats.get(technicianId);
    const sla = computeSlaCompliance(toSlaEvaluable(slaRows), now, CONFIGURED_AT_RISK_FRACTION);

    const stats: PmContractorStatsDto = {
      openReportsCount: openCounts.get(technicianId) ?? 0,
      completedReportsCount: repairs?.completed ?? 0,
      averageRepairDurationMinutes: repairs?.averageDurationMinutes ?? null,
      averageRating: reviewAgg?.averageRating ?? null,
      reviewsCount: reviewAgg?.reviewsCount ?? 0,
      slaCompliancePercent: sla.compliancePercent,
      slaEligibleCount: sla.eligibleCount,
    };

    return {
      technicianId: technician.id,
      name: technician.user.name,
      phone: technician.user.phone,
      specialty: technician.specialty,
      technicianStatus: technician.status,
      membership,
      load: resolveTechnicianLoad({
        technicianStatus: technician.status,
        userStatus: technician.user.status,
        hasActiveRepair: activeRepairIds.has(technicianId),
      }),
      projectId,
      stats,
      recentReports: recentReports.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        status: r.status,
        priority: r.priority,
        category: r.category,
        problemText: r.problemText,
        createdAt: r.createdAt,
        closedAt: r.closedAt,
        slaState: computeSlaState({
          slaStartDueAt: r.slaStartDueAt,
          createdAt: r.createdAt,
          repairStartedAt: r.repair?.startedAt ?? null,
          now,
          atRiskFraction: CONFIGURED_AT_RISK_FRACTION,
        }),
        durationMinutes: r.repair?.durationMinutes ?? null,
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        homeownerName: r.homeowner.name,
        reportId: r.report.id,
        reportNumber: r.report.reportNumber,
        category: r.report.category,
      })),
      readOnly: true,
      generatedAt: now,
    };
  },

  /**
   * decisions.md J2's object-level scoping. A technician who is neither on this
   * project's roster nor the assignee of any canonical report in it does not
   * exist as far as this PM is concerned - 404, not 403 (hide existence, I12).
   */
  async requireScopedTechnician(principal: Principal, technicianId: string) {
    const { projectId } = await resolvePmScope(principal);
    if (!projectId) throw new NotFoundError('Technician not found', 'TECHNICIAN_NOT_FOUND');

    const technician = await pmRepository.findTechnicianById(technicianId);
    if (!technician) throw new NotFoundError('Technician not found', 'TECHNICIAN_NOT_FOUND');

    if (technician.projectId === projectId) {
      return { projectId, technician, membership: 'CURRENT' as const };
    }

    // Transferred out (F9) but still holding real work here - their history
    // stays theirs and stays reachable (J9).
    const reportsHere = await pmRepository.countReportsForTechnician(projectId, technicianId);
    if (reportsHere > 0) {
      return { projectId, technician, membership: 'HISTORICAL' as const };
    }

    throw new NotFoundError('Technician not found', 'TECHNICIAN_NOT_FOUND');
  },

  // -------------------------------------------------------------------------
  // Copilot (decisions.md J11/J12/J13)
  // -------------------------------------------------------------------------

  /**
   * Builds the bounded, already-authorized snapshot. NOTE: it reuses the
   * overview/alerts/contractors results rather than re-querying, and it strips
   * every phone, email, national id, address, storage key and internal user id
   * before anything reaches a prompt (J12).
   */
  async buildSnapshot(principal: Principal): Promise<{ snapshot: PmCopilotSnapshot; assigned: boolean }> {
    const now = new Date();
    // decisions.md J15: deliberately SEQUENTIAL, not Promise.all.
    //
    // Each of these three already fans out 4-6 parallel queries of its own, so
    // running them concurrently issued ~15 simultaneous connections from ONE
    // request and exhausted the documented 15-client Supabase session pool
    // (`FATAL: (EMAXCONNSESSION) max clients reached in session mode`) - a real
    // failure the browser pass caught and no mocked unit test could. The
    // Copilot is not latency-critical, so the correct trade is fewer
    // simultaneous connections, not a faster snapshot.
    const overview = await this.overview(principal);
    const alerts = await this.alerts(principal);
    const contractors = await this.contractors(principal);

    if (!overview.assigned || !overview.project) {
      return {
        assigned: false,
        snapshot: {
          project: { name: '', city: '' },
          period: { start: overview.period.start.toISOString(), end: overview.period.end.toISOString() },
          kpis: {},
          previousPeriodKpis: null,
          today: { created: 0, closed: 0, reopened: 0 },
          alerts: [],
          reports: [],
          technicians: [],
        },
      };
    }

    const { projectId } = await resolvePmScope(principal);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const today = await pmRepository.dailyCounts(projectId as string, dayStart, dayEnd);

    // The most operationally relevant reports, bounded: alerts first, then the
    // rest of the active queue.
    const listed = await reportService.list(
      {
        status: [
          ReportStatus.ROUTING_PENDING,
          ReportStatus.ROUTED,
          ReportStatus.IN_PROGRESS,
          ReportStatus.AWAITING_OWNER_APPROVAL,
        ],
        page: 1,
        pageSize: MAX_SNAPSHOT_REPORTS,
      } as ListReportsQueryDto,
      principal,
    );

    return {
      assigned: true,
      snapshot: {
        project: { name: overview.project.name, city: overview.project.city },
        period: {
          start: overview.period.start.toISOString(),
          end: overview.period.end.toISOString(),
        },
        kpis: {
          openReports: overview.kpis.openReports,
          inProgress: overview.kpis.inProgress,
          awaitingOwnerApproval: overview.kpis.awaitingOwnerApproval,
          closedThisMonth: overview.kpis.closedThisMonth,
          slaCompliancePercent: overview.kpis.slaCompliancePercent,
          averageResolutionTimeMinutes: overview.kpis.averageResolutionTimeMinutes,
          slaBreachedCount: overview.sla.breachedCount,
        },
        // decisions.md J13: no historical comparison data is stored anywhere,
        // so this is honestly null and the prompt forbids any trend claim.
        previousPeriodKpis: null,
        today,
        alerts: alerts.items.slice(0, MAX_SNAPSHOT_ALERTS).map((a) => ({
          type: a.type,
          reportId: a.reportId,
          reportNumber: a.reportNumber,
          severity: a.severity,
          ageHours: a.ageHours,
        })),
        // Display-safe fields only: no homeowner name, no phone, no email, no
        // unit/building identifier, no media key, no internal user id.
        reports: listed.items.map((r) => ({
          id: r.id,
          reportNumber: r.reportNumber,
          status: r.status,
          priority: r.priority,
          category: r.category,
          slaState: r.sla.state,
          ageHours: hoursSince(new Date(r.createdAt), now),
          problemText: String(r.problemText).slice(0, 200),
          technicianName: r.technician?.name ?? null,
        })),
        technicians: contractors.items.slice(0, MAX_SNAPSHOT_TECHNICIANS).map((t) => ({
          id: t.technicianId,
          name: t.name,
          specialty: t.specialty,
          load: t.load,
          openReportsCount: t.stats.openReportsCount,
          completedReportsCount: t.stats.completedReportsCount,
          averageRating: t.stats.averageRating,
          slaCompliancePercent: t.stats.slaCompliancePercent,
        })),
      },
    };
  },

  /** POST /api/pm/copilot/summary */
  async copilotSummary(principal: Principal, provider: PmCopilotProvider = pmCopilotProvider) {
    const generatedAt = new Date();
    const { snapshot, assigned } = await this.buildSnapshot(principal);

    if (!assigned) {
      return {
        available: false,
        unavailableReason: 'INSUFFICIENT_DATA' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
    if (!provider.isConfigured()) {
      return {
        available: false,
        unavailableReason: 'NOT_CONFIGURED' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }

    try {
      const result = await provider.summarize(snapshot);
      const validated = validateReferences(
        result.references,
        buildCandidates(snapshot),
        MAX_REFERENCES,
      );
      return {
        available: true,
        unavailableReason: null,
        headline: result.headline,
        highlights: result.highlights,
        references: validated.references,
        droppedReferenceCount: validated.droppedReferenceCount,
        provider: provider.name,
        model: PM_COPILOT_MODEL,
        generatedAt,
      };
    } catch (err) {
      logger.warn('PM Copilot summary unavailable', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        available: false,
        unavailableReason: 'PROVIDER_ERROR' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
  },

  /** POST /api/pm/copilot/chat */
  async copilotChat(
    principal: Principal,
    input: { message: string; context?: string | null },
    provider: PmCopilotProvider = pmCopilotProvider,
  ) {
    const generatedAt = new Date();
    const { snapshot, assigned } = await this.buildSnapshot(principal);

    if (!assigned) {
      return {
        available: false,
        unavailableReason: 'INSUFFICIENT_DATA' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
    if (!provider.isConfigured()) {
      return {
        available: false,
        unavailableReason: 'NOT_CONFIGURED' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }

    try {
      // A UI-supplied context string is folded into the QUESTION, never into
      // the snapshot - it cannot broaden what the model was shown (J12).
      const message = sanitizeChatMessage(input.message, input.context);
      const result = await provider.chat({ snapshot, message });
      const validated = validateReferences(
        result.references,
        buildCandidates(snapshot),
        MAX_REFERENCES,
      );
      return {
        available: true,
        unavailableReason: null,
        reply: result.reply,
        references: validated.references,
        droppedReferenceCount: validated.droppedReferenceCount,
        provider: provider.name,
        model: PM_COPILOT_MODEL,
        generatedAt,
      };
    } catch (err) {
      logger.warn('PM Copilot chat unavailable', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        available: false,
        unavailableReason: 'PROVIDER_ERROR' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
  },

  /** GET /api/pm/contractors/:technicianId/insight */
  async contractorInsight(
    principal: Principal,
    technicianId: string,
    provider: PmInsightProvider = pmInsightProvider,
  ) {
    const generatedAt = new Date();
    const profile = await this.contractorPerformance(principal, technicianId);

    // decisions.md J13: with no completed work and no reviews there is nothing
    // true to say, so say that - rather than padding a sentence out of nothing.
    if (profile.stats.completedReportsCount === 0 && profile.stats.reviewsCount === 0) {
      return {
        available: false,
        unavailableReason: 'INSUFFICIENT_DATA' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
    if (!provider.isConfigured()) {
      return {
        available: false,
        unavailableReason: 'NOT_CONFIGURED' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }

    const contractors = await this.contractors(principal);
    const snapshot: PmTechnicianInsightSnapshot = {
      name: profile.name,
      specialty: profile.specialty,
      load: profile.load,
      openReportsCount: profile.stats.openReportsCount,
      completedReportsCount: profile.stats.completedReportsCount,
      averageRepairDurationMinutes: profile.stats.averageRepairDurationMinutes,
      averageRating: profile.stats.averageRating,
      reviewsCount: profile.stats.reviewsCount,
      slaCompliancePercent: profile.stats.slaCompliancePercent,
      slaEligibleCount: profile.stats.slaEligibleCount,
      projectAverages: {
        averageRepairDurationMinutes: contractors.kpis.averageRepairDurationMinutes,
        averageRating: contractors.kpis.averageRating,
        slaCompliancePercent: null,
      },
    };

    try {
      const result = await provider.explain(snapshot);
      return {
        available: true,
        unavailableReason: null,
        insight: result.insight,
        provider: provider.name,
        model: PM_COPILOT_MODEL,
        generatedAt,
      };
    } catch (err) {
      logger.warn('PM technician insight unavailable', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        available: false,
        unavailableReason: 'PROVIDER_ERROR' as const,
        provider: provider.name,
        model: null,
        generatedAt,
      };
    }
  },
};
