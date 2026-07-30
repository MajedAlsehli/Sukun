import { Warranty } from '@prisma/client';
import { ReportCategory, ReportWarrantyVerdict } from '@prisma/client';
import {
  computeCategoryState,
  WARRANTY_CATEGORY_RULES,
  WARRANTY_RULES_VERSION,
} from '../warranty/warranty.rules';
import { REPORT_CATEGORY_TO_WARRANTY_CATEGORY, WarrantySnapshot } from './report.types';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I4): the ONE place a warranty verdict
// for a canonical report is produced.
//
// It reuses Task 7's `warranty.rules.ts` unchanged - the same durations, the
// same versioned rule table, the same UTC-safe month arithmetic - rather than
// re-deriving coverage. A client-supplied verdict is never read anywhere:
// `POST /api/reports` has no verdict field in its schema at all.
//
// The result is snapshotted onto the Report row and never recomputed
// (invariant 4). If a duration in WARRANTY_CATEGORY_RULES changes later, every
// existing report keeps the verdict - and the `warrantyRulesVersion` - that
// actually applied when it was filed.
// ---------------------------------------------------------------------------
export function evaluateReportWarranty(input: {
  category: ReportCategory;
  warranty: Pick<Warranty, 'startDate'> | null;
  now: Date;
}): WarrantySnapshot {
  const { category, warranty, now } = input;
  const warrantyCategoryKey = REPORT_CATEGORY_TO_WARRANTY_CATEGORY[category];

  // The unit genuinely has no Warranty row (a homeowner activated before the
  // warranty auto-creation existed, or a data gap). Honest, not "not covered
  // because the period lapsed" - those are different facts.
  if (!warranty) {
    return {
      verdict: ReportWarrantyVerdict.NO_WARRANTY,
      reasonCode: 'NO_WARRANTY_ON_UNIT',
      warrantyCategoryKey: null,
      rulesVersion: WARRANTY_RULES_VERSION,
      evaluatedAt: now,
      periodStart: null,
      periodEnd: null,
    };
  }

  // decisions.md I4a: FLOORING/CEILINGS/OTHER have no evidenced warranty card.
  // Deterministic "not configured" - no invented duration, submission still
  // allowed, reason recorded honestly.
  if (!warrantyCategoryKey) {
    return {
      verdict: ReportWarrantyVerdict.NOT_CONFIGURED,
      reasonCode: 'CATEGORY_NOT_CONFIGURED',
      warrantyCategoryKey: null,
      rulesVersion: WARRANTY_RULES_VERSION,
      evaluatedAt: now,
      periodStart: warranty.startDate,
      periodEnd: null,
    };
  }

  const rule = WARRANTY_CATEGORY_RULES.find((r) => r.key === warrantyCategoryKey);
  /* istanbul ignore next - unreachable: every mapped key exists in the rule table (asserted by test). */
  if (!rule) {
    return {
      verdict: ReportWarrantyVerdict.NOT_CONFIGURED,
      reasonCode: 'CATEGORY_NOT_CONFIGURED',
      warrantyCategoryKey,
      rulesVersion: WARRANTY_RULES_VERSION,
      evaluatedAt: now,
      periodStart: warranty.startDate,
      periodEnd: null,
    };
  }

  const state = computeCategoryState(rule, warranty.startDate, now);

  if (state.reasonCode === 'EXCLUDED') {
    return {
      verdict: ReportWarrantyVerdict.NOT_COVERED,
      reasonCode: 'CATEGORY_EXCLUDED',
      warrantyCategoryKey,
      rulesVersion: WARRANTY_RULES_VERSION,
      evaluatedAt: now,
      periodStart: warranty.startDate,
      periodEnd: null,
    };
  }

  if (state.reasonCode === 'NOT_CONFIGURED') {
    return {
      verdict: ReportWarrantyVerdict.NOT_CONFIGURED,
      reasonCode: 'CATEGORY_NOT_CONFIGURED',
      warrantyCategoryKey,
      rulesVersion: WARRANTY_RULES_VERSION,
      evaluatedAt: now,
      periodStart: warranty.startDate,
      periodEnd: null,
    };
  }

  return {
    verdict: state.covered ? ReportWarrantyVerdict.COVERED : ReportWarrantyVerdict.NOT_COVERED,
    reasonCode: state.covered ? 'COVERED' : 'PERIOD_EXPIRED',
    warrantyCategoryKey,
    rulesVersion: WARRANTY_RULES_VERSION,
    evaluatedAt: now,
    periodStart: warranty.startDate,
    periodEnd: state.periodEndDate,
  };
}
