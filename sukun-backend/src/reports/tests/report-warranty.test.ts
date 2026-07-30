import { ReportCategory, ReportWarrantyVerdict } from '@prisma/client';
import { evaluateReportWarranty } from '../report-warranty';
import { WARRANTY_RULES_VERSION } from '../../warranty/warranty.rules';
import { REPORT_CATEGORIES } from '../report.types';

// Warranty starts (handover) on 2026-01-01. Task 7's durations:
// STRUCTURE 120mo, PLUMBING 24, ELECTRICAL 24, DOORS_WINDOWS 12,
// PAINT_FINISHING 6, MISUSE_EXCLUSION always excluded.
const HANDOVER = new Date('2026-01-01T00:00:00.000Z');
const warranty = { startDate: HANDOVER };

describe('evaluateReportWarranty (decisions.md I4)', () => {
  it('returns COVERED inside the category period', () => {
    const result = evaluateReportWarranty({
      category: ReportCategory.PLUMBING,
      warranty,
      now: new Date('2027-06-01T00:00:00.000Z'), // 17 months in, of 24
    });

    expect(result.verdict).toBe(ReportWarrantyVerdict.COVERED);
    expect(result.reasonCode).toBe('COVERED');
    expect(result.warrantyCategoryKey).toBe('PLUMBING');
    expect(result.periodStart).toEqual(HANDOVER);
    expect(result.periodEnd).toEqual(new Date('2028-01-01T00:00:00.000Z'));
    expect(result.rulesVersion).toBe(WARRANTY_RULES_VERSION);
  });

  it('returns NOT_COVERED with PERIOD_EXPIRED once the category period has lapsed', () => {
    const result = evaluateReportWarranty({
      category: ReportCategory.PAINT, // 6 months
      warranty,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.verdict).toBe(ReportWarrantyVerdict.NOT_COVERED);
    expect(result.reasonCode).toBe('PERIOD_EXPIRED');
    expect(result.periodEnd).toEqual(new Date('2026-07-01T00:00:00.000Z'));
  });

  it('evaluates each category against its OWN duration, not one global term', () => {
    const now = new Date('2026-09-01T00:00:00.000Z'); // 8 months after handover

    // PAINT (6mo) has lapsed; PLUMBING (24mo) and STRUCTURE (120mo) have not.
    expect(evaluateReportWarranty({ category: ReportCategory.PAINT, warranty, now }).verdict).toBe(
      ReportWarrantyVerdict.NOT_COVERED,
    );
    expect(evaluateReportWarranty({ category: ReportCategory.PLUMBING, warranty, now }).verdict).toBe(
      ReportWarrantyVerdict.COVERED,
    );
    expect(evaluateReportWarranty({ category: ReportCategory.CRACKS, warranty, now }).verdict).toBe(
      ReportWarrantyVerdict.COVERED,
    );
  });

  it('maps DOORS and WINDOWS onto the same one-year card', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const doors = evaluateReportWarranty({ category: ReportCategory.DOORS, warranty, now });
    const windows = evaluateReportWarranty({ category: ReportCategory.WINDOWS, warranty, now });

    expect(doors.warrantyCategoryKey).toBe('DOORS_WINDOWS');
    expect(windows.warrantyCategoryKey).toBe('DOORS_WINDOWS');
    expect(doors.periodEnd).toEqual(windows.periodEnd);
  });

  it.each([ReportCategory.FLOORING, ReportCategory.CEILINGS, ReportCategory.OTHER])(
    'returns a deterministic NOT_CONFIGURED for %s - no invented duration',
    (category) => {
      const result = evaluateReportWarranty({
        category,
        warranty,
        now: new Date('2026-02-01T00:00:00.000Z'),
      });

      expect(result.verdict).toBe(ReportWarrantyVerdict.NOT_CONFIGURED);
      expect(result.reasonCode).toBe('CATEGORY_NOT_CONFIGURED');
      expect(result.warrantyCategoryKey).toBeNull();
      // The critical part: no end date is guessed at.
      expect(result.periodEnd).toBeNull();
    },
  );

  it('returns NO_WARRANTY (distinct from "expired") when the unit has no warranty row at all', () => {
    const result = evaluateReportWarranty({
      category: ReportCategory.PLUMBING,
      warranty: null,
      now: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(result.verdict).toBe(ReportWarrantyVerdict.NO_WARRANTY);
    expect(result.reasonCode).toBe('NO_WARRANTY_ON_UNIT');
    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
  });

  it('always produces a usable snapshot for every category - a report is never blocked', () => {
    for (const category of REPORT_CATEGORIES) {
      const result = evaluateReportWarranty({
        category,
        warranty,
        now: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(Object.values(ReportWarrantyVerdict)).toContain(result.verdict);
      expect(result.reasonCode).toBeTruthy();
      expect(result.rulesVersion).toBe(WARRANTY_RULES_VERSION);
      expect(result.evaluatedAt).toBeInstanceOf(Date);
    }
  });

  it('is deterministic - the same inputs always produce the same snapshot', () => {
    const now = new Date('2026-05-05T12:34:56.000Z');
    const a = evaluateReportWarranty({ category: ReportCategory.ELECTRICAL, warranty, now });
    const b = evaluateReportWarranty({ category: ReportCategory.ELECTRICAL, warranty, now });
    expect(a).toEqual(b);
  });

  it('takes `now` from the caller (server time), never from a client-controllable default', () => {
    const early = evaluateReportWarranty({
      category: ReportCategory.PAINT,
      warranty,
      now: new Date('2026-03-01T00:00:00.000Z'),
    });
    const late = evaluateReportWarranty({
      category: ReportCategory.PAINT,
      warranty,
      now: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(early.verdict).toBe(ReportWarrantyVerdict.COVERED);
    expect(late.verdict).toBe(ReportWarrantyVerdict.NOT_COVERED);
  });

  it('records the exact rules version in force, so a later rule change cannot rewrite history', () => {
    const result = evaluateReportWarranty({
      category: ReportCategory.PLUMBING,
      warranty,
      now: new Date('2026-02-01T00:00:00.000Z'),
    });
    // The snapshot carries a version string; nothing recomputes an old report
    // when WARRANTY_CATEGORY_RULES changes (asserted at the service level too).
    expect(typeof result.rulesVersion).toBe('string');
    expect(result.rulesVersion.length).toBeGreaterThan(0);
  });
});
