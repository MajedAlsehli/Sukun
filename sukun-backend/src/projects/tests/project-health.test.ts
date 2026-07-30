import { prisma } from '../../config/prisma';
import { computeProjectHealth } from '../project-health';

jest.mock('../../config/prisma', () => ({
  prisma: {
    report: { count: jest.fn() },
    inspectionReport: { count: jest.fn() },
    warrantyReport: { count: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  report: { count: jest.Mock };
  inspectionReport: { count: jest.Mock };
  warrantyReport: { count: jest.Mock };
};

/**
 * Task 8 (decisions.md I14) deliberately redefined what this function counts:
 * `openReportsCount` and the health status are now CANONICAL POST-OWNERSHIP
 * reports, and the pre-ownership InspectionReport / legacy WarrantyReport
 * numbers moved into their own `legacy` fields instead of being summed in.
 *
 * These tests were extended, not relaxed: every original assertion still has an
 * equivalent here (EXCELLENT at zero, NEEDS_ATTENTION with open reports,
 * CRITICAL with a high-priority one), and each case now additionally asserts
 * that the legacy numbers are reported separately and never folded into the
 * canonical count.
 */
describe('computeProjectHealth (decisions.md E8, redefined by Task 8 / I14)', () => {
  function mockCounts(input: {
    openCanonical: number;
    criticalCanonical: number;
    openInspection: number;
    openLegacyWarranty: number;
  }) {
    mockedPrisma.report.count
      .mockResolvedValueOnce(input.openCanonical)
      .mockResolvedValueOnce(input.criticalCanonical);
    mockedPrisma.inspectionReport.count.mockResolvedValueOnce(input.openInspection);
    mockedPrisma.warrantyReport.count.mockResolvedValueOnce(input.openLegacyWarranty);
  }

  it('is EXCELLENT for a project with zero open reports (honest, not fabricated)', async () => {
    mockCounts({ openCanonical: 0, criticalCanonical: 0, openInspection: 0, openLegacyWarranty: 0 });

    const result = await computeProjectHealth('project-1');
    expect(result.status).toBe('EXCELLENT');
    expect(result.label).toBe('ممتاز');
    expect(result.openReportsCount).toBe(0);
    expect(result.criticalReportsCount).toBe(0);
    expect(result.legacy).toEqual({ openInspectionReportsCount: 0, openWarrantyReportsCount: 0 });
  });

  it('is NEEDS_ATTENTION when open canonical reports exist but none are high priority', async () => {
    mockCounts({ openCanonical: 3, criticalCanonical: 0, openInspection: 0, openLegacyWarranty: 0 });

    const result = await computeProjectHealth('project-1');
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.label).toBe('يحتاج متابعة');
    expect(result.openReportsCount).toBe(3);
  });

  it('is CRITICAL when at least one open canonical report is HIGH priority', async () => {
    mockCounts({ openCanonical: 4, criticalCanonical: 1, openInspection: 0, openLegacyWarranty: 0 });

    const result = await computeProjectHealth('project-1');
    expect(result.status).toBe('CRITICAL');
    expect(result.label).toBe('حرج');
    expect(result.criticalReportsCount).toBe(1);
  });

  it('never mixes legacy pre-ownership counts into the canonical number (I14)', async () => {
    mockCounts({ openCanonical: 0, criticalCanonical: 0, openInspection: 7, openLegacyWarranty: 2 });

    const result = await computeProjectHealth('project-1');
    // 9 legacy open rows exist, yet the canonical count - and therefore the
    // health badge - stays honestly zero/EXCELLENT.
    expect(result.openReportsCount).toBe(0);
    expect(result.status).toBe('EXCELLENT');
    expect(result.legacy).toEqual({ openInspectionReportsCount: 7, openWarrantyReportsCount: 2 });
  });

  it('excludes already-mirrored legacy WarrantyReport rows from the legacy count (I3)', async () => {
    mockCounts({ openCanonical: 1, criticalCanonical: 0, openInspection: 0, openLegacyWarranty: 0 });

    await computeProjectHealth('project-1');

    // The legacy WarrantyReport query must filter on `canonicalReport: null`,
    // otherwise a backfilled row would be counted twice (once legacy, once
    // canonical).
    const warrantyWhere = mockedPrisma.warrantyReport.count.mock.calls[0][0].where;
    expect(warrantyWhere.canonicalReport).toEqual({ is: null });
  });
});
