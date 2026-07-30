import {
  ReportCategory,
  ReportPriority,
  ReportRepairStatus,
  ReportStatus,
  ReportWarrantyVerdict,
} from '@prisma/client';
import { WarrantyCategoryKey } from '../warranty/warranty.rules';
import { BusinessError } from '../shared/errors';

export {
  ReportCategory,
  ReportPriority,
  ReportRepairStatus,
  ReportStatus,
  ReportWarrantyVerdict,
};

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md Part I): pure, dependency-free rules
// for the canonical post-ownership report domain. Everything in this file is
// deterministic and takes an explicit `now` where time matters, so tests never
// depend on wall-clock timing and the server is the only clock that counts.
// ---------------------------------------------------------------------------

export const REPORT_CATEGORIES: ReportCategory[] = [
  ReportCategory.PLUMBING,
  ReportCategory.ELECTRICAL,
  ReportCategory.CRACKS,
  ReportCategory.PAINT,
  ReportCategory.DOORS,
  ReportCategory.WINDOWS,
  ReportCategory.FLOORING,
  ReportCategory.CEILINGS,
  ReportCategory.OTHER,
];

export const REPORT_PRIORITIES: ReportPriority[] = [
  ReportPriority.LOW,
  ReportPriority.MEDIUM,
  ReportPriority.HIGH,
];

// decisions.md I6: a report filed without a validated AI analysis gets this
// documented deterministic priority - never an invented "AI said so" value.
export const MANUAL_DEFAULT_PRIORITY = ReportPriority.MEDIUM;

// ---------------------------------------------------------------------------
// decisions.md I4a - report categories are NOT warranty categories.
//
// Report categories come from H8's own nine tiles (`catList` in
// `Sakn Report Journey.dc.html`); warranty categories are H10's six
// (`coverageDefs` in `Sakn Warranty Center.dc.html`, frozen in Task 7 as
// WARRANTY_CATEGORY_RULES). The mapping below contains only pairs the
// reference actually evidences. FLOORING/CEILINGS/OTHER map to nothing - no
// warranty card anywhere covers floors or ceilings, and mapping them onto
// STRUCTURE would be an invention, so they deterministically resolve to
// NOT_CONFIGURED instead (which never blocks submission).
//
// MISUSE_EXCLUSION is deliberately the target of no report category: it is a
// coverage exclusion, not a defect type a homeowner can pick.
// ---------------------------------------------------------------------------
export const REPORT_CATEGORY_TO_WARRANTY_CATEGORY: Record<ReportCategory, WarrantyCategoryKey | null> = {
  [ReportCategory.PLUMBING]: WarrantyCategoryKey.PLUMBING,
  [ReportCategory.ELECTRICAL]: WarrantyCategoryKey.ELECTRICAL,
  // coverageDefs#structure's own covered list names "تشققات إنشائية في الجدران الحاملة".
  [ReportCategory.CRACKS]: WarrantyCategoryKey.STRUCTURE,
  [ReportCategory.PAINT]: WarrantyCategoryKey.PAINT_FINISHING,
  // coverageDefs#doors is titled "الأبواب والنوافذ" - one card covers both.
  [ReportCategory.DOORS]: WarrantyCategoryKey.DOORS_WINDOWS,
  [ReportCategory.WINDOWS]: WarrantyCategoryKey.DOORS_WINDOWS,
  [ReportCategory.FLOORING]: null,
  [ReportCategory.CEILINGS]: null,
  [ReportCategory.OTHER]: null,
};

// ---------------------------------------------------------------------------
// decisions.md I8 - routing specialty groups.
//
// `Technician.specialty` is free text holding one of RE5's five fixed tiles
// (decisions.md F2). تكييف وتبريد is deliberately unmapped: no H8 category
// corresponds to it (the C1 reference files an AC fault under `أخرى`), and
// inventing an HVAC report category to justify it would contradict H8's own
// tile list.
// ---------------------------------------------------------------------------
export const SPECIALTY_ELECTRICAL = 'كهرباء';
export const SPECIALTY_PLUMBING = 'سباكة';
export const SPECIALTY_HVAC = 'تكييف وتبريد';
export const SPECIALTY_PAINT = 'دهان';
export const SPECIALTY_GENERAL = 'صيانة عامة';

export const TECHNICIAN_SPECIALTIES = [
  SPECIALTY_ELECTRICAL,
  SPECIALTY_PLUMBING,
  SPECIALTY_HVAC,
  SPECIALTY_PAINT,
  SPECIALTY_GENERAL,
] as const;

export const REPORT_CATEGORY_TO_SPECIALTY: Record<ReportCategory, string> = {
  [ReportCategory.PLUMBING]: SPECIALTY_PLUMBING,
  [ReportCategory.ELECTRICAL]: SPECIALTY_ELECTRICAL,
  [ReportCategory.PAINT]: SPECIALTY_PAINT,
  [ReportCategory.CRACKS]: SPECIALTY_GENERAL,
  [ReportCategory.DOORS]: SPECIALTY_GENERAL,
  [ReportCategory.WINDOWS]: SPECIALTY_GENERAL,
  [ReportCategory.FLOORING]: SPECIALTY_GENERAL,
  [ReportCategory.CEILINGS]: SPECIALTY_GENERAL,
  [ReportCategory.OTHER]: SPECIALTY_GENERAL,
};

/**
 * Specialty strings are free text (F2), so compare on a normalized form:
 * trimmed, whitespace-collapsed, and with the Arabic variants that users and
 * keyboards routinely mix (أ/إ/آ → ا, ة → ه, ى → ي) folded together. Same
 * spirit as Task 6's search normalization, applied to a much smaller domain.
 */
export function normalizeSpecialty(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

export function specialtyMatchesCategory(specialty: string | null | undefined, category: ReportCategory): boolean {
  const normalized = normalizeSpecialty(specialty);
  if (!normalized) return false;
  return normalized === normalizeSpecialty(REPORT_CATEGORY_TO_SPECIALTY[category]);
}

export function isGeneralMaintenanceSpecialty(specialty: string | null | undefined): boolean {
  return normalizeSpecialty(specialty) === normalizeSpecialty(SPECIALTY_GENERAL);
}

// ---------------------------------------------------------------------------
// decisions.md I10 - SLA.
//
// The ONE evidenced number in the whole reference set is PM2's breach copy:
// "المقاول لم يبدأ المهمة خلال الفترة المستهدفة (٤ ساعات لبلاغ عالي الأولوية)".
// MEDIUM/LOW therefore have NO configured target - null, not a guess.
//
// AT_RISK is NOT evidenced anywhere: PM2 renders a "near" chip without ever
// stating when it triggers. Task 8 chose 0.75 and said so; Task 9 (decisions.md
// J5a) demotes it to an explicitly configured operational heuristic that is OFF
// by default - see `resolveAtRiskFraction` below.
// ---------------------------------------------------------------------------

// Versions the STORED due-date rules (the 4h HIGH target). Unchanged by Task 9:
// `Report.slaStartDueAt` is written once at creation and is never reinterpreted,
// so this must not move when the at-risk *presentation* heuristic changes.
export const REPORT_SLA_RULES_VERSION = '2026-07-28.1';

// Versions the separate, configurable at-risk heuristic (decisions.md J5a).
export const REPORT_SLA_AT_RISK_POLICY_VERSION = '2026-07-28.j9';

export const REPORT_SLA_START_TARGET_HOURS: Record<ReportPriority, number | null> = {
  [ReportPriority.HIGH]: 4,
  [ReportPriority.MEDIUM]: null,
  [ReportPriority.LOW]: null,
};

/**
 * decisions.md J5a - the at-risk threshold is an operational heuristic with no
 * product evidence behind it, so it is configuration, not code, and its absence
 * is honest rather than defaulted:
 *
 *   * unset  -> `null` -> the AT_RISK label is NOT produced at all. A report
 *     inside its window reads ON_TIME until it genuinely BREACHES.
 *   * set to a fraction strictly between 0 and 1 -> that fraction of the window
 *     is the at-risk tail (0.75 reproduces Task 8's behaviour exactly).
 *   * set to anything else -> ignored (treated as unset), never silently
 *     coerced into a different threshold.
 *
 * The hard factual states (ON_TIME / BREACHED / MET / NOT_CONFIGURED) never
 * depend on this value.
 */
export function resolveAtRiskFraction(raw: string | undefined | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) return null;
  return parsed;
}

export type ReportSlaState = 'NOT_CONFIGURED' | 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET';

export function computeSlaStartDueAt(priority: ReportPriority, createdAt: Date): Date | null {
  const hours = REPORT_SLA_START_TARGET_HOURS[priority];
  if (hours == null) return null;
  return new Date(createdAt.getTime() + hours * 3_600_000);
}

/**
 * SLA here is a *start* deadline only - nothing in the reference defines a
 * completion SLA, so none is invented. Once the repair has actually started,
 * the outcome is frozen: MET if it started in time, BREACHED if it did not.
 */
export function computeSlaState(input: {
  slaStartDueAt: Date | null;
  createdAt: Date;
  repairStartedAt: Date | null;
  now: Date;
  /**
   * decisions.md J5a. This file stays dependency-free, so the configured value
   * is passed IN by the mapper (`env.reportSla.atRiskFraction`) rather than
   * read here. Omitted or null -> no AT_RISK label is produced at all, which is
   * this environment's state. The Task 8 tests pass 0.75 explicitly to keep
   * asserting the exact 75% walk.
   */
  atRiskFraction?: number | null;
}): ReportSlaState {
  const { slaStartDueAt, createdAt, repairStartedAt, now } = input;
  if (!slaStartDueAt) return 'NOT_CONFIGURED';

  // Once work has actually started the outcome is frozen forever - a later
  // reopen never rescues or re-breaks it, because `ReportRepair.startedAt` is
  // written at the FIRST start and never overwritten (report.service.ts#start).
  if (repairStartedAt) {
    return repairStartedAt <= slaStartDueAt ? 'MET' : 'BREACHED';
  }

  if (now >= slaStartDueAt) return 'BREACHED';

  const atRiskFraction = input.atRiskFraction ?? null;
  if (atRiskFraction == null) return 'ON_TIME';

  const windowMs = slaStartDueAt.getTime() - createdAt.getTime();
  /* istanbul ignore next - a non-positive window is already BREACHED above. */
  if (windowMs <= 0) return 'BREACHED';
  const elapsedFraction = (now.getTime() - createdAt.getTime()) / windowMs;
  return elapsedFraction >= atRiskFraction ? 'AT_RISK' : 'ON_TIME';
}

// ---------------------------------------------------------------------------
// decisions.md I2 - the one canonical status machine.
// ---------------------------------------------------------------------------

/** Statuses a homeowner's H9 list groups as "open" (filed, nobody started yet). */
export const OPEN_REPORT_STATUSES: ReportStatus[] = [
  ReportStatus.ROUTING_PENDING,
  ReportStatus.ROUTED,
];

/** Every status that is not terminal - used by every "open reports" count. */
export const ACTIVE_REPORT_STATUSES: ReportStatus[] = [
  ReportStatus.ROUTING_PENDING,
  ReportStatus.ROUTED,
  ReportStatus.IN_PROGRESS,
  ReportStatus.AWAITING_OWNER_APPROVAL,
];

export const REPORT_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  [ReportStatus.ROUTING_PENDING]: [ReportStatus.ROUTED],
  [ReportStatus.ROUTED]: [ReportStatus.IN_PROGRESS],
  [ReportStatus.IN_PROGRESS]: [ReportStatus.AWAITING_OWNER_APPROVAL],
  [ReportStatus.AWAITING_OWNER_APPROVAL]: [ReportStatus.CLOSED, ReportStatus.IN_PROGRESS],
  [ReportStatus.CLOSED]: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReportStatus, to: ReportStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessError(
      `A report in status ${from} cannot move to ${to}`,
      'INVALID_REPORT_STATUS_TRANSITION',
    );
  }
}

/**
 * `start` is valid from ROUTED (the first start) and from IN_PROGRESS when the
 * repair row is REOPENED (the technician resuming work the homeowner sent
 * back - C1's "متابعة الإصلاح"). It is never valid at any other time.
 */
export function assertStartable(status: ReportStatus, repairStatus: ReportRepairStatus | null): void {
  if (status === ReportStatus.ROUTED && repairStatus === null) return;
  if (status === ReportStatus.IN_PROGRESS && repairStatus === ReportRepairStatus.REOPENED) return;
  throw new BusinessError(
    `This report cannot be started in its current state (${status})`,
    'INVALID_REPORT_STATUS_TRANSITION',
  );
}

// ---------------------------------------------------------------------------
// decisions.md I3 - legacy WarrantyReport status mapping (backfill only).
// ---------------------------------------------------------------------------
export const LEGACY_WARRANTY_STATUS_TO_REPORT_STATUS: Record<string, ReportStatus> = {
  AI_ANALYSIS: ReportStatus.ROUTING_PENDING,
  WAITING_MANUAL_REVIEW: ReportStatus.ROUTING_PENDING,
  ASSIGNED: ReportStatus.ROUTED,
  REPAIR_IN_PROGRESS: ReportStatus.IN_PROGRESS,
  WAITING_HOMEOWNER: ReportStatus.AWAITING_OWNER_APPROVAL,
  REJECTED: ReportStatus.CLOSED,
  CLOSED: ReportStatus.CLOSED,
};

// ---------------------------------------------------------------------------
// Warranty verdict codes (decisions.md I4).
// ---------------------------------------------------------------------------
export type ReportWarrantyReasonCode =
  | 'COVERED'
  | 'PERIOD_EXPIRED'
  | 'CATEGORY_EXCLUDED'
  | 'CATEGORY_NOT_CONFIGURED'
  | 'NO_WARRANTY_ON_UNIT'
  | 'LEGACY_IMPORT_NOT_EVALUATED';

export interface WarrantySnapshot {
  verdict: ReportWarrantyVerdict;
  reasonCode: ReportWarrantyReasonCode;
  warrantyCategoryKey: WarrantyCategoryKey | null;
  rulesVersion: string;
  evaluatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}
