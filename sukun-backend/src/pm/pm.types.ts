import { ReportPriority, ReportStatus } from '@prisma/client';
import { computeSlaState, ReportSlaState } from '../reports/report.types';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md Part J): pure, dependency-free rules
// for the PM operations surface.
//
// Everything here is deterministic and takes an explicit `now` where time
// matters, so tests never depend on wall-clock timing and the server is the
// only clock that counts - the same discipline report.types.ts follows.
//
// This file computes NOTHING from the legacy pre-ownership InspectionReport /
// Repair pipeline (decisions.md I14/J4). Its only inputs are canonical
// post-ownership report facts.
// ---------------------------------------------------------------------------

/**
 * decisions.md J4 - the three "live" KPI buckets are DELIBERATELY DISJOINT, so
 * one report never lands in two cards. Their sum is the project's total active
 * report count.
 */
export const PM_OPEN_STATUSES: ReportStatus[] = [
  ReportStatus.ROUTING_PENDING,
  ReportStatus.ROUTED,
];

export interface PmStatusCounts {
  openReports: number;
  inProgress: number;
  awaitingOwnerApproval: number;
  closed: number;
}

/** Folds a `groupBy(status)` result into the disjoint KPI buckets. */
export function foldStatusCounts(rows: { status: ReportStatus; count: number }[]): PmStatusCounts {
  const counts: PmStatusCounts = {
    openReports: 0,
    inProgress: 0,
    awaitingOwnerApproval: 0,
    closed: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case ReportStatus.ROUTING_PENDING:
      case ReportStatus.ROUTED:
        counts.openReports += row.count;
        break;
      case ReportStatus.IN_PROGRESS:
        counts.inProgress += row.count;
        break;
      case ReportStatus.AWAITING_OWNER_APPROVAL:
        counts.awaitingOwnerApproval += row.count;
        break;
      case ReportStatus.CLOSED:
        counts.closed += row.count;
        break;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// decisions.md J4 - month boundaries.
//
// Computed once per request from a single server `now`, and the resolved
// boundaries are RETURNED in the payload so no client re-derives a month in its
// own timezone. Half-open [start, end): a report closed at exactly midnight on
// the 1st belongs to the new month, counted exactly once.
// ---------------------------------------------------------------------------
export function currentMonthRange(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { periodStart, periodEnd };
}

// ---------------------------------------------------------------------------
// decisions.md J5 - SLA compliance.
//
// Task 9 CONSUMES Task 8's immutable stored `slaStartDueAt` and never
// recomputes or reinterprets a historical due date.
// ---------------------------------------------------------------------------

/** The minimal projection the compliance calculation needs - nothing else. */
export interface SlaEvaluableReport {
  id: string;
  createdAt: Date;
  slaStartDueAt: Date | null;
  repairStartedAt: Date | null;
  assignedTechnicianId: string | null;
}

export interface SlaCompliance {
  /**
   * Rounded percentage, or NULL on an empty denominator. Never 0 and never 100
   * as a stand-in for "nothing to measure".
   */
  compliancePercent: number | null;
  eligibleCount: number;
  metCount: number;
  breachedCount: number;
}

/**
 * decisions.md J5. A report is ELIGIBLE when its SLA outcome is genuinely
 * determined:
 *
 *   * it has a configured target (`slaStartDueAt != null`; MEDIUM/LOW have
 *     none, so they are excluded entirely - not a pass, not a fail), AND
 *   * the repair has started (outcome frozen MET/BREACHED), OR it has not
 *     started and the due time has already passed (BREACHED).
 *
 * Open-but-not-yet-breached reports are excluded: the outcome is undetermined
 * and counting it either way would be a guess. Open-AND-breached reports ARE
 * included as failures - restricting the denominator to closed reports would
 * let a live breach hide from the very number a PM reads to find it.
 *
 * A reopen never re-opens a settled outcome: `repairStartedAt` is the FIRST
 * start and is never overwritten, so each report is counted exactly once
 * regardless of `reopenCount`.
 */
export function computeSlaCompliance(
  reports: SlaEvaluableReport[],
  now: Date,
  atRiskFraction: number | null,
): SlaCompliance {
  let eligibleCount = 0;
  let metCount = 0;
  let breachedCount = 0;

  for (const report of reports) {
    if (!report.slaStartDueAt) continue;

    const state = computeSlaState({
      slaStartDueAt: report.slaStartDueAt,
      createdAt: report.createdAt,
      repairStartedAt: report.repairStartedAt,
      now,
      atRiskFraction,
    });

    if (state === 'MET') {
      eligibleCount += 1;
      metCount += 1;
    } else if (state === 'BREACHED') {
      eligibleCount += 1;
      breachedCount += 1;
    }
    // ON_TIME / AT_RISK / NOT_CONFIGURED: outcome undetermined -> excluded.
  }

  return {
    compliancePercent: eligibleCount > 0 ? Math.round((metCount / eligibleCount) * 100) : null,
    eligibleCount,
    metCount,
    breachedCount,
  };
}

/** Mean of a set of durations, or null when there is nothing to average. */
export function averageMinutes(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// ---------------------------------------------------------------------------
// decisions.md J6 - alert rules.
//
// There is no alert table and no alert lifecycle: an alert exists exactly as
// long as the condition that produced it does, so a resolved condition
// disappears naturally on the next poll and nothing is ever "dismissed" into a
// stale state.
// ---------------------------------------------------------------------------

export type PmAlertType =
  | 'SLA_BREACHED'
  | 'ROUTING_PENDING'
  | 'REOPENED_BY_HOMEOWNER'
  | 'AWAITING_APPROVAL_AGING'
  | 'STALLED_REPAIR';

export type PmAlertSeverity = 'CRITICAL' | 'WARNING';

export interface PmAlertRules {
  /** decisions.md J6: null = NOT CONFIGURED = the alert type is not produced. */
  awaitingApprovalHours: number | null;
  stalledHours: number | null;
}

/** The minimal projection the alert rules need. */
export interface AlertEvaluableReport {
  id: string;
  reportNumber: number;
  status: ReportStatus;
  priority: ReportPriority;
  problemText: string;
  createdAt: Date;
  updatedAt: Date;
  createdAtDue: Date | null;
  repairStartedAt: Date | null;
  repairSubmittedAt: Date | null;
  reopenCount: number;
  routingReasonCode: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
}

export interface PmAlert {
  id: string;
  type: PmAlertType;
  severity: PmAlertSeverity;
  reportId: string;
  reportNumber: number;
  problemText: string;
  priority: ReportPriority;
  status: ReportStatus;
  /** Real code where one exists (routing), never invented copy. */
  reasonCode: string | null;
  /** Hours the condition has persisted, where the rule is time-based. */
  ageHours: number | null;
  technicianId: string | null;
  technicianName: string | null;
  occurredAt: Date;
  /** Built from a row just read inside the PM's scope - valid by construction. */
  target: { type: 'report'; id: string };
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10);
}

/**
 * decisions.md J6. Every alert points at a real report row. A CLOSED report is
 * never alerted on: its historical SLA breach stays visible in PM2's history
 * and in the compliance denominator, but presenting a finished job as an active
 * unresolved alert would be false.
 *
 * The two threshold-based rules produce NOTHING unless explicitly configured -
 * no invented default hours anywhere.
 */
export function generateAlerts(
  reports: AlertEvaluableReport[],
  rules: PmAlertRules,
  now: Date,
  atRiskFraction: number | null,
): PmAlert[] {
  const alerts: PmAlert[] = [];

  for (const report of reports) {
    if (report.status === ReportStatus.CLOSED) continue;

    const base = {
      reportId: report.id,
      reportNumber: report.reportNumber,
      problemText: report.problemText,
      priority: report.priority,
      status: report.status,
      technicianId: report.assignedTechnicianId,
      technicianName: report.assignedTechnicianName,
      target: { type: 'report' as const, id: report.id },
    };

    // 1. SLA breached - a stored due date that has genuinely passed.
    const slaState = computeSlaState({
      slaStartDueAt: report.createdAtDue,
      createdAt: report.createdAt,
      repairStartedAt: report.repairStartedAt,
      now,
      atRiskFraction,
    });
    if (slaState === 'BREACHED') {
      alerts.push({
        ...base,
        id: `${report.id}:SLA_BREACHED`,
        type: 'SLA_BREACHED',
        severity: 'CRITICAL',
        reasonCode: 'SLA_BREACHED',
        ageHours: report.createdAtDue ? hoursBetween(report.createdAtDue, now) : null,
        occurredAt: report.createdAtDue ?? report.createdAt,
      });
    }

    // 2. Automatic routing found no eligible technician (I8) - a stored fact.
    if (report.status === ReportStatus.ROUTING_PENDING) {
      alerts.push({
        ...base,
        id: `${report.id}:ROUTING_PENDING`,
        type: 'ROUTING_PENDING',
        severity: 'CRITICAL',
        reasonCode: report.routingReasonCode,
        ageHours: hoursBetween(report.createdAt, now),
        occurredAt: report.createdAt,
      });
    }

    // 3. The homeowner sent the work back - a stored counter, not a threshold.
    if (report.reopenCount > 0) {
      alerts.push({
        ...base,
        id: `${report.id}:REOPENED_BY_HOMEOWNER`,
        type: 'REOPENED_BY_HOMEOWNER',
        severity: 'WARNING',
        reasonCode: 'REOPENED_BY_HOMEOWNER',
        ageHours: null,
        occurredAt: report.updatedAt,
      });
    }

    // 4. Aging owner approval - ONLY when an operator configured the threshold.
    if (
      rules.awaitingApprovalHours != null &&
      report.status === ReportStatus.AWAITING_OWNER_APPROVAL &&
      report.repairSubmittedAt != null
    ) {
      const age = hoursBetween(report.repairSubmittedAt, now);
      if (age >= rules.awaitingApprovalHours) {
        alerts.push({
          ...base,
          id: `${report.id}:AWAITING_APPROVAL_AGING`,
          type: 'AWAITING_APPROVAL_AGING',
          severity: 'WARNING',
          reasonCode: 'AWAITING_APPROVAL_AGING',
          ageHours: age,
          occurredAt: report.repairSubmittedAt,
        });
      }
    }

    // 5. Stalled repair - ONLY when an operator configured the threshold.
    if (
      rules.stalledHours != null &&
      report.status === ReportStatus.IN_PROGRESS &&
      report.repairStartedAt != null &&
      report.repairSubmittedAt == null
    ) {
      const age = hoursBetween(report.repairStartedAt, now);
      if (age >= rules.stalledHours) {
        alerts.push({
          ...base,
          id: `${report.id}:STALLED_REPAIR`,
          type: 'STALLED_REPAIR',
          severity: 'WARNING',
          reasonCode: 'STALLED_REPAIR',
          ageHours: age,
          occurredAt: report.repairStartedAt,
        });
      }
    }
  }

  // Critical first, then the longest-standing condition.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
    return a.occurredAt.getTime() - b.occurredAt.getTime();
  });
}

// ---------------------------------------------------------------------------
// decisions.md J9 - PM3 technician membership.
// ---------------------------------------------------------------------------

/**
 * CURRENT   - on the project's roster today. The only ones the header KPIs
 *             count, because they are the project's actual capacity.
 * HISTORICAL - transferred off the roster (F9) but still the assignee of real
 *             canonical work IN THIS PROJECT. Included so their past work stays
 *             attributed to them (I1's immutable historical references) and is
 *             never silently rewritten onto whoever replaced them.
 */
export type PmTechnicianMembership = 'CURRENT' | 'HISTORICAL';

export type PmTechnicianLoad = 'BUSY' | 'AVAILABLE' | 'UNAVAILABLE';

/**
 * Derived from REAL rows, not from `TechnicianStatus`'s AVAILABLE/BUSY enum
 * members - no code path in this product maintains those, so trusting them
 * would report a fiction.
 */
export function resolveTechnicianLoad(input: {
  technicianStatus: string;
  userStatus: string;
  hasActiveRepair: boolean;
}): PmTechnicianLoad {
  if (input.technicianStatus === 'INVITED' || input.technicianStatus === 'INACTIVE') {
    return 'UNAVAILABLE';
  }
  if (input.userStatus !== 'ACTIVE') return 'UNAVAILABLE';
  return input.hasActiveRepair ? 'BUSY' : 'AVAILABLE';
}

export type { ReportSlaState };
