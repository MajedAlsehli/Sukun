import { ReportCategory, ReportPriority, ReportRepairStatus, ReportStatus } from '@prisma/client';
import {
  ACTIVE_REPORT_STATUSES,
  assertStartable,
  assertTransition,
  canTransition,
  computeSlaStartDueAt,
  computeSlaState,
  isGeneralMaintenanceSpecialty,
  MANUAL_DEFAULT_PRIORITY,
  normalizeSpecialty,
  OPEN_REPORT_STATUSES,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_TO_SPECIALTY,
  REPORT_CATEGORY_TO_WARRANTY_CATEGORY,
  REPORT_SLA_START_TARGET_HOURS,
  resolveAtRiskFraction,
  specialtyMatchesCategory,
  TECHNICIAN_SPECIALTIES,
} from '../report.types';
import { WARRANTY_CATEGORY_RULES } from '../../warranty/warranty.rules';

describe('report status machine (decisions.md I2)', () => {
  it('allows exactly the five documented transitions and nothing else', () => {
    const allowed: [ReportStatus, ReportStatus][] = [
      [ReportStatus.ROUTING_PENDING, ReportStatus.ROUTED],
      [ReportStatus.ROUTED, ReportStatus.IN_PROGRESS],
      [ReportStatus.IN_PROGRESS, ReportStatus.AWAITING_OWNER_APPROVAL],
      [ReportStatus.AWAITING_OWNER_APPROVAL, ReportStatus.CLOSED],
      [ReportStatus.AWAITING_OWNER_APPROVAL, ReportStatus.IN_PROGRESS],
    ];

    const all = Object.values(ReportStatus);
    for (const from of all) {
      for (const to of all) {
        const expected = allowed.some(([a, b]) => a === from && b === to);
        expect([from, to, canTransition(from, to)]).toEqual([from, to, expected]);
      }
    }
  });

  it('CLOSED is terminal - nothing may follow it', () => {
    for (const to of Object.values(ReportStatus)) {
      expect(canTransition(ReportStatus.CLOSED, to)).toBe(false);
    }
  });

  it('never allows skipping straight from ROUTING_PENDING to IN_PROGRESS or CLOSED', () => {
    expect(() => assertTransition(ReportStatus.ROUTING_PENDING, ReportStatus.IN_PROGRESS)).toThrow(
      /cannot move/,
    );
    expect(() => assertTransition(ReportStatus.ROUTING_PENDING, ReportStatus.CLOSED)).toThrow();
    expect(() => assertTransition(ReportStatus.ROUTED, ReportStatus.CLOSED)).toThrow();
  });

  it('rejects a transition with the stable INVALID_REPORT_STATUS_TRANSITION code', () => {
    expect(() => assertTransition(ReportStatus.CLOSED, ReportStatus.IN_PROGRESS)).toThrow(
      expect.objectContaining({ errorCode: 'INVALID_REPORT_STATUS_TRANSITION' }),
    );
  });

  it('groups OPEN and ACTIVE statuses the way H9 and every open-count query need', () => {
    expect(OPEN_REPORT_STATUSES).toEqual([ReportStatus.ROUTING_PENDING, ReportStatus.ROUTED]);
    expect(ACTIVE_REPORT_STATUSES).not.toContain(ReportStatus.CLOSED);
    expect(ACTIVE_REPORT_STATUSES).toHaveLength(4);
  });
});

describe('assertStartable (decisions.md I2)', () => {
  it('allows the first start from ROUTED with no repair row yet', () => {
    expect(() => assertStartable(ReportStatus.ROUTED, null)).not.toThrow();
  });

  it('allows resuming a repair the homeowner reopened', () => {
    expect(() => assertStartable(ReportStatus.IN_PROGRESS, ReportRepairStatus.REOPENED)).not.toThrow();
  });

  it('refuses to start a repair that is already in progress (no double-start)', () => {
    expect(() => assertStartable(ReportStatus.IN_PROGRESS, ReportRepairStatus.IN_PROGRESS)).toThrow(
      expect.objectContaining({ errorCode: 'INVALID_REPORT_STATUS_TRANSITION' }),
    );
  });

  it('refuses to start an unrouted, submitted, or closed report', () => {
    expect(() => assertStartable(ReportStatus.ROUTING_PENDING, null)).toThrow();
    expect(() =>
      assertStartable(ReportStatus.AWAITING_OWNER_APPROVAL, ReportRepairStatus.SUBMITTED),
    ).toThrow();
    expect(() => assertStartable(ReportStatus.CLOSED, ReportRepairStatus.APPROVED)).toThrow();
  });
});

describe('report category -> warranty category mapping (decisions.md I4a)', () => {
  it('covers every report category explicitly - no category can be silently unhandled', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY).toHaveProperty(category);
    }
    expect(Object.keys(REPORT_CATEGORY_TO_WARRANTY_CATEGORY).sort()).toEqual(
      [...REPORT_CATEGORIES].sort(),
    );
  });

  it('maps only pairs the reference actually evidences', () => {
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.PLUMBING]).toBe('PLUMBING');
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.ELECTRICAL]).toBe('ELECTRICAL');
    // coverageDefs#structure's covered list names "تشققات إنشائية في الجدران الحاملة".
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.CRACKS]).toBe('STRUCTURE');
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.PAINT]).toBe('PAINT_FINISHING');
    // One card, titled "الأبواب والنوافذ", covers both.
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.DOORS]).toBe('DOORS_WINDOWS');
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.WINDOWS]).toBe('DOORS_WINDOWS');
  });

  it('leaves floors, ceilings, and "other" unmapped rather than inventing coverage', () => {
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.FLOORING]).toBeNull();
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.CEILINGS]).toBeNull();
    expect(REPORT_CATEGORY_TO_WARRANTY_CATEGORY[ReportCategory.OTHER]).toBeNull();
  });

  it('never maps a report category onto a warranty key that does not exist in Task 7 rules', () => {
    const known = new Set(WARRANTY_CATEGORY_RULES.map((r) => r.key as string));
    for (const key of Object.values(REPORT_CATEGORY_TO_WARRANTY_CATEGORY)) {
      if (key) expect(known.has(key)).toBe(true);
    }
  });

  it('never routes a report category at the misuse EXCLUSION card (not a defect type)', () => {
    expect(Object.values(REPORT_CATEGORY_TO_WARRANTY_CATEGORY)).not.toContain('MISUSE_EXCLUSION');
  });
});

describe('category -> technician specialty mapping (decisions.md I8)', () => {
  it('maps every category to one of RE5\'s five real specialty tiles', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(TECHNICIAN_SPECIALTIES).toContain(REPORT_CATEGORY_TO_SPECIALTY[category]);
    }
  });

  it('matches specialties despite Arabic letter-variant and whitespace differences', () => {
    expect(specialtyMatchesCategory('سباكة', ReportCategory.PLUMBING)).toBe(true);
    expect(specialtyMatchesCategory('  سباكه  ', ReportCategory.PLUMBING)).toBe(true);
    expect(specialtyMatchesCategory('كهرباء', ReportCategory.PLUMBING)).toBe(false);
    expect(specialtyMatchesCategory(null, ReportCategory.PLUMBING)).toBe(false);
    expect(specialtyMatchesCategory('', ReportCategory.PLUMBING)).toBe(false);
  });

  it('recognizes the general-maintenance tile as the tier-2 fallback', () => {
    expect(isGeneralMaintenanceSpecialty('صيانة عامة')).toBe(true);
    expect(isGeneralMaintenanceSpecialty('صيانه   عامه')).toBe(true);
    expect(isGeneralMaintenanceSpecialty('تكييف وتبريد')).toBe(false);
    expect(isGeneralMaintenanceSpecialty(null)).toBe(false);
  });

  it('normalizes alef/teh-marbuta/alef-maqsura variants consistently', () => {
    expect(normalizeSpecialty('أحمد')).toBe(normalizeSpecialty('احمد'));
    expect(normalizeSpecialty('إدارة')).toBe(normalizeSpecialty('اداره'));
    expect(normalizeSpecialty('مبنى')).toBe(normalizeSpecialty('مبني'));
  });

  it('leaves HVAC unmapped - no H8 category corresponds to it', () => {
    expect(Object.values(REPORT_CATEGORY_TO_SPECIALTY)).not.toContain('تكييف وتبريد');
  });
});

describe('SLA rules (decisions.md I10)', () => {
  const createdAt = new Date('2026-07-01T00:00:00.000Z');

  it('configures a 4-hour start target for HIGH only - the one evidenced number', () => {
    expect(REPORT_SLA_START_TARGET_HOURS[ReportPriority.HIGH]).toBe(4);
    expect(REPORT_SLA_START_TARGET_HOURS[ReportPriority.MEDIUM]).toBeNull();
    expect(REPORT_SLA_START_TARGET_HOURS[ReportPriority.LOW]).toBeNull();
  });

  it('produces a due date only for a priority that has a configured target', () => {
    expect(computeSlaStartDueAt(ReportPriority.HIGH, createdAt)).toEqual(
      new Date('2026-07-01T04:00:00.000Z'),
    );
    expect(computeSlaStartDueAt(ReportPriority.MEDIUM, createdAt)).toBeNull();
    expect(computeSlaStartDueAt(ReportPriority.LOW, createdAt)).toBeNull();
  });

  it('reports NOT_CONFIGURED - never a fabricated chip - when there is no target', () => {
    expect(
      computeSlaState({
        slaStartDueAt: null,
        createdAt,
        repairStartedAt: null,
        now: new Date('2027-01-01T00:00:00.000Z'),
      }),
    ).toBe('NOT_CONFIGURED');
  });

  // decisions.md J5a: AT_RISK is a CONFIGURED operational heuristic, not a
  // default. With a policy configured, Task 8's exact 75% walk still holds -
  // this assertion is preserved verbatim, only the fraction is now explicit.
  it('walks ON_TIME -> AT_RISK -> BREACHED across the window when a fraction IS configured', () => {
    const dueAt = new Date('2026-07-01T04:00:00.000Z');
    const at = (iso: string) =>
      computeSlaState({
        slaStartDueAt: dueAt,
        createdAt,
        repairStartedAt: null,
        now: new Date(iso),
        atRiskFraction: 0.75,
      });

    expect(at('2026-07-01T00:30:00.000Z')).toBe('ON_TIME'); // 12.5% elapsed
    expect(at('2026-07-01T02:59:00.000Z')).toBe('ON_TIME'); // just under 75%
    expect(at('2026-07-01T03:00:00.000Z')).toBe('AT_RISK'); // exactly 75%
    expect(at('2026-07-01T03:59:00.000Z')).toBe('AT_RISK');
    expect(at('2026-07-01T04:00:00.000Z')).toBe('BREACHED'); // exactly at the deadline
    expect(at('2026-07-02T00:00:00.000Z')).toBe('BREACHED');
  });

  it('never produces AT_RISK when no fraction is configured - this environment\'s state', () => {
    const dueAt = new Date('2026-07-01T04:00:00.000Z');
    const at = (iso: string, atRiskFraction?: number | null) =>
      computeSlaState({
        slaStartDueAt: dueAt,
        createdAt,
        repairStartedAt: null,
        now: new Date(iso),
        atRiskFraction,
      });

    // Omitted entirely, and explicitly null, are the same honest outcome.
    for (const fraction of [undefined, null] as const) {
      expect(at('2026-07-01T00:30:00.000Z', fraction)).toBe('ON_TIME');
      expect(at('2026-07-01T03:00:00.000Z', fraction)).toBe('ON_TIME'); // would have been AT_RISK
      expect(at('2026-07-01T03:59:59.000Z', fraction)).toBe('ON_TIME');
      // The HARD state is untouched by the heuristic - it stays based strictly
      // on the immutable stored due date.
      expect(at('2026-07-01T04:00:00.000Z', fraction)).toBe('BREACHED');
      expect(at('2026-07-02T00:00:00.000Z', fraction)).toBe('BREACHED');
    }
  });

  it('resolves the at-risk fraction from configuration, rejecting anything malformed', () => {
    expect(resolveAtRiskFraction('0.75')).toBe(0.75);
    expect(resolveAtRiskFraction('0.5')).toBe(0.5);

    // Unset / blank -> not configured.
    expect(resolveAtRiskFraction(undefined)).toBeNull();
    expect(resolveAtRiskFraction(null)).toBeNull();
    expect(resolveAtRiskFraction('')).toBeNull();
    expect(resolveAtRiskFraction('   ')).toBeNull();

    // Out of range or nonsense -> ignored, NEVER coerced into a threshold.
    expect(resolveAtRiskFraction('0')).toBeNull();
    expect(resolveAtRiskFraction('1')).toBeNull();
    expect(resolveAtRiskFraction('1.5')).toBeNull();
    expect(resolveAtRiskFraction('-0.5')).toBeNull();
    expect(resolveAtRiskFraction('soon')).toBeNull();
  });

  it('freezes the outcome once the repair actually starts', () => {
    const dueAt = new Date('2026-07-01T04:00:00.000Z');
    const longAfter = new Date('2026-08-01T00:00:00.000Z');

    expect(
      computeSlaState({
        slaStartDueAt: dueAt,
        createdAt,
        repairStartedAt: new Date('2026-07-01T03:00:00.000Z'),
        now: longAfter,
      }),
    ).toBe('MET');

    expect(
      computeSlaState({
        slaStartDueAt: dueAt,
        createdAt,
        repairStartedAt: new Date('2026-07-01T09:00:00.000Z'),
        now: longAfter,
      }),
    ).toBe('BREACHED');
  });
});

describe('manual-entry default priority (decisions.md I6)', () => {
  it('is MEDIUM, and is a documented rule rather than an AI verdict', () => {
    expect(MANUAL_DEFAULT_PRIORITY).toBe(ReportPriority.MEDIUM);
  });
});
