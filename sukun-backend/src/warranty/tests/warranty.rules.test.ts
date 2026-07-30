import {
  WARRANTY_CATEGORY_RULES,
  WarrantyCategoryKey,
  computeAllCategoryStates,
  computeCategoryState,
} from '../warranty.rules';

const START = new Date('2026-01-01T00:00:00.000Z');

describe('computeCategoryState', () => {
  it('covers structure (10 years) well within its period', () => {
    const rule = WARRANTY_CATEGORY_RULES.find((r) => r.key === WarrantyCategoryKey.STRUCTURE)!;
    const now = new Date('2027-01-01T00:00:00.000Z');

    const state = computeCategoryState(rule, START, now);

    expect(state).toMatchObject({ covered: true, reasonCode: 'ACTIVE' });
    expect(state.daysRemaining).toBeGreaterThan(0);
    expect(state.periodEndDate).toEqual(new Date('2036-01-01T00:00:00.000Z'));
  });

  it('reports paint/finishing (6 months) as expired the instant its period ends', () => {
    const rule = WARRANTY_CATEGORY_RULES.find((r) => r.key === WarrantyCategoryKey.PAINT_FINISHING)!;
    const periodEnd = new Date('2026-07-01T00:00:00.000Z');

    const exactlyAtEnd = computeCategoryState(rule, START, periodEnd);
    expect(exactlyAtEnd).toMatchObject({ covered: false, reasonCode: 'EXPIRED', daysRemaining: null });

    const oneMsBefore = computeCategoryState(rule, START, new Date(periodEnd.getTime() - 1));
    expect(oneMsBefore.covered).toBe(true);
  });

  it('never covers the misuse-exclusion category regardless of date', () => {
    const rule = WARRANTY_CATEGORY_RULES.find((r) => r.key === WarrantyCategoryKey.MISUSE_EXCLUSION)!;

    const dayOne = computeCategoryState(rule, START, START);
    const decadesLater = computeCategoryState(rule, START, new Date('2100-01-01'));

    expect(dayOne).toMatchObject({ covered: false, reasonCode: 'EXCLUDED', periodEndDate: null });
    expect(decadesLater).toMatchObject({ covered: false, reasonCode: 'EXCLUDED' });
  });

  it('reports NOT_CONFIGURED for a rule with no duration and no exclusion flag', () => {
    const state = computeCategoryState(
      { key: WarrantyCategoryKey.STRUCTURE, sortOrder: 0, durationMonths: null, excludedAlways: false },
      START,
      new Date('2027-01-01'),
    );

    expect(state).toMatchObject({ covered: false, reasonCode: 'NOT_CONFIGURED', periodEndDate: null });
  });

  it('clamps month-end overflow correctly (Jan 31 + 1 month -> Feb 28)', () => {
    const rule = { key: WarrantyCategoryKey.DOORS_WINDOWS, sortOrder: 3, durationMonths: 1, excludedAlways: false };
    const jan31 = new Date('2026-01-31T00:00:00.000Z');

    const state = computeCategoryState(rule, jan31, new Date('2026-02-01'));

    expect(state.periodEndDate?.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(state.periodEndDate?.getUTCDate()).toBe(28);
  });
});

describe('computeAllCategoryStates', () => {
  it('returns every configured category, sorted, independent of frontend input', () => {
    const states = computeAllCategoryStates(START, new Date('2026-06-01'));

    expect(states).toHaveLength(WARRANTY_CATEGORY_RULES.length);
    expect(states.map((s) => s.key)).toEqual([
      WarrantyCategoryKey.STRUCTURE,
      WarrantyCategoryKey.PLUMBING,
      WarrantyCategoryKey.ELECTRICAL,
      WarrantyCategoryKey.DOORS_WINDOWS,
      WarrantyCategoryKey.PAINT_FINISHING,
      WarrantyCategoryKey.MISUSE_EXCLUSION,
    ]);
  });
});
