// Task 7 (H10, decisions.md Part H/H2): per-category warranty coverage rules.
//
// No policy-configuration endpoint exists anywhere in the docs (same gap
// Task 010 already documented for the overall Warranty term) - there is
// nowhere a company or admin sets these durations today. Rather than invent
// figures, every duration below is taken directly from the one place actual
// evidence exists: the coverageDefs `period` values embedded in the
// `Sakn Warranty Center.dc.html` reference design (the closest thing to a
// written product spec for this screen). Categories not evidenced there
// (e.g. "air conditioning", "general maintenance") are deliberately not
// invented - only the 6 categories that reference screen actually models.
//
// Computed entirely server-side from Warranty.startDate (see homeowner
// activation / decisions.md H1 for why startDate is the handover moment) -
// no schema migration was needed since nothing per-category is persisted;
// this is a pure, deterministic read-model over the existing flat Warranty
// row, the same "(b) read-model view" pattern already used elsewhere in this
// project (e.g. the canonical-report problem, decisions.md A4).
export enum WarrantyCategoryKey {
  STRUCTURE = 'STRUCTURE',
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  DOORS_WINDOWS = 'DOORS_WINDOWS',
  PAINT_FINISHING = 'PAINT_FINISHING',
  MISUSE_EXCLUSION = 'MISUSE_EXCLUSION',
}

export type WarrantyReasonCode = 'ACTIVE' | 'EXPIRED' | 'EXCLUDED' | 'NOT_CONFIGURED';

export interface WarrantyCategoryRule {
  key: WarrantyCategoryKey;
  sortOrder: number;
  /** null = no duration applies (either always-excluded, or genuinely unconfigured). */
  durationMonths: number | null;
  /** True for categories that are never covered regardless of date (e.g. misuse damage). */
  excludedAlways: boolean;
}

// Bump this string whenever a duration below changes, so a future historical-
// preservation need (recomputing what applied *at the time*) has something
// real to key off. Not persisted anywhere today - no rule has ever changed,
// so there is nothing yet to preserve (decisions.md H2 records this
// explicitly rather than silently leaving it unversioned).
export const WARRANTY_RULES_VERSION = '2026-07-28.1';

export const WARRANTY_CATEGORY_RULES: WarrantyCategoryRule[] = [
  { key: WarrantyCategoryKey.STRUCTURE, sortOrder: 0, durationMonths: 120, excludedAlways: false },
  { key: WarrantyCategoryKey.PLUMBING, sortOrder: 1, durationMonths: 24, excludedAlways: false },
  { key: WarrantyCategoryKey.ELECTRICAL, sortOrder: 2, durationMonths: 24, excludedAlways: false },
  { key: WarrantyCategoryKey.DOORS_WINDOWS, sortOrder: 3, durationMonths: 12, excludedAlways: false },
  { key: WarrantyCategoryKey.PAINT_FINISHING, sortOrder: 4, durationMonths: 6, excludedAlways: false },
  { key: WarrantyCategoryKey.MISUSE_EXCLUSION, sortOrder: 5, durationMonths: null, excludedAlways: true },
];

export interface WarrantyCategoryState {
  key: WarrantyCategoryKey;
  durationMonths: number | null;
  excludedAlways: boolean;
  covered: boolean;
  periodEndDate: Date | null;
  daysRemaining: number | null;
  reasonCode: WarrantyReasonCode;
}

// Calendar-month addition, not a fixed 30-day multiply - "2 years from
// handover" must land on the same day-of-month two years later (with the
// usual month-end clamp, e.g. Jan 31 + 1 month -> Feb 28/29), not drift.
// Uses UTC field accessors throughout (never local getMonth/setMonth) so the
// result is identical regardless of the host server's timezone - required
// for "safe around timezone/date boundaries" determinism.
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getUTCMonth() + months;
  result.setUTCMonth(targetMonth);
  // setUTCMonth rolls an out-of-range day (e.g. Jan 31 -> Mar 3 via Feb 31)
  // into the *next* month - detect and clamp back to the last real day instead.
  if (result.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
    result.setUTCDate(0);
  }
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

// Evaluated with an explicit `now` (server time only, never client-supplied)
// so the result is deterministic and testable across timezone/date
// boundaries - the frontend never computes or overrides this.
export function computeCategoryState(
  rule: WarrantyCategoryRule,
  warrantyStart: Date,
  now: Date,
): WarrantyCategoryState {
  if (rule.excludedAlways) {
    return {
      key: rule.key,
      durationMonths: rule.durationMonths,
      excludedAlways: true,
      covered: false,
      periodEndDate: null,
      daysRemaining: null,
      reasonCode: 'EXCLUDED',
    };
  }
  if (rule.durationMonths == null) {
    return {
      key: rule.key,
      durationMonths: null,
      excludedAlways: false,
      covered: false,
      periodEndDate: null,
      daysRemaining: null,
      reasonCode: 'NOT_CONFIGURED',
    };
  }

  const periodEndDate = addMonths(warrantyStart, rule.durationMonths);
  const covered = periodEndDate > now;
  return {
    key: rule.key,
    durationMonths: rule.durationMonths,
    excludedAlways: false,
    covered,
    periodEndDate,
    daysRemaining: covered ? daysBetween(now, periodEndDate) : null,
    reasonCode: covered ? 'ACTIVE' : 'EXPIRED',
  };
}

export function computeAllCategoryStates(warrantyStart: Date, now: Date = new Date()): WarrantyCategoryState[] {
  return [...WARRANTY_CATEGORY_RULES]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((rule) => computeCategoryState(rule, warrantyStart, now));
}
