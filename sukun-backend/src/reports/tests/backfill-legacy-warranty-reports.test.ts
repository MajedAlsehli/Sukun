import { ReportCategory, ReportPriority, ReportStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  backfillLegacyWarrantyReports,
  mapLegacyCategory,
  mapLegacyPriority,
  mapLegacyStatus,
} from '../../scripts/backfill-legacy-warranty-reports';

jest.mock('../../config/prisma', () => {
  const client: Record<string, unknown> = {
    warrantyReport: { findMany: jest.fn() },
    ownership: { findFirst: jest.fn() },
    report: { create: jest.fn() },
    reportTimelineEvent: { create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(client)),
  };
  return { prisma: client };
});

const db = prisma as unknown as {
  warrantyReport: { findMany: jest.Mock };
  ownership: { findFirst: jest.Mock };
  report: { create: jest.Mock };
  reportTimelineEvent: { create: jest.Mock };
  $transaction: jest.Mock;
};

const CREATED = new Date('2026-03-01T00:00:00.000Z');
const UPDATED = new Date('2026-03-05T00:00:00.000Z');

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wr-1',
    warrantyId: 'warranty-1',
    unitId: 'unit-1',
    homeownerId: 'owner-1',
    referenceNumber: 'WR-AB12CD34',
    status: 'ASSIGNED',
    priority: 'HIGH',
    category: 'سباكة',
    location: 'المطبخ',
    notes: 'تسريب قديم',
    createdAt: CREATED,
    updatedAt: UPDATED,
    unit: { id: 'unit-1', buildingId: 'building-1', building: { id: 'building-1', projectId: 'project-1' } },
    ...overrides,
  };
}

beforeEach(() => {
  db.warrantyReport.findMany.mockResolvedValue([]);
  db.ownership.findFirst.mockResolvedValue({ id: 'ownership-1' });
  db.report.create.mockResolvedValue({ id: 'report-1' });
  db.reportTimelineEvent.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
});

describe('legacy WarrantyReport field mapping (decisions.md I3)', () => {
  it('maps a legacy free-text category only on an exact canonical match', () => {
    expect(mapLegacyCategory('PLUMBING')).toBe(ReportCategory.PLUMBING);
    expect(mapLegacyCategory('plumbing')).toBe(ReportCategory.PLUMBING);
    expect(mapLegacyCategory('  ELECTRICAL ')).toBe(ReportCategory.ELECTRICAL);
  });

  it('falls back to OTHER rather than guessing at an unrecognised category', () => {
    // Legacy rows hold arbitrary free text - guessing "سباكة" means PLUMBING
    // would be an unverifiable reinterpretation of historical data.
    expect(mapLegacyCategory('سباكة')).toBe(ReportCategory.OTHER);
    expect(mapLegacyCategory('anything else')).toBe(ReportCategory.OTHER);
    expect(mapLegacyCategory(null)).toBe(ReportCategory.OTHER);
    expect(mapLegacyCategory('')).toBe(ReportCategory.OTHER);
  });

  it('folds the legacy 4-value priority scale into the canonical 3-value one', () => {
    expect(mapLegacyPriority('LOW')).toBe(ReportPriority.LOW);
    expect(mapLegacyPriority('MEDIUM')).toBe(ReportPriority.MEDIUM);
    expect(mapLegacyPriority('HIGH')).toBe(ReportPriority.HIGH);
    expect(mapLegacyPriority('CRITICAL')).toBe(ReportPriority.HIGH);
    expect(mapLegacyPriority(null)).toBe(ReportPriority.MEDIUM);
  });

  it('maps every legacy WarrantyReportStatus onto a canonical status', () => {
    expect(mapLegacyStatus('AI_ANALYSIS')).toBe(ReportStatus.ROUTING_PENDING);
    expect(mapLegacyStatus('WAITING_MANUAL_REVIEW')).toBe(ReportStatus.ROUTING_PENDING);
    expect(mapLegacyStatus('ASSIGNED')).toBe(ReportStatus.ROUTED);
    expect(mapLegacyStatus('REPAIR_IN_PROGRESS')).toBe(ReportStatus.IN_PROGRESS);
    expect(mapLegacyStatus('WAITING_HOMEOWNER')).toBe(ReportStatus.AWAITING_OWNER_APPROVAL);
    expect(mapLegacyStatus('REJECTED')).toBe(ReportStatus.CLOSED);
    expect(mapLegacyStatus('CLOSED')).toBe(ReportStatus.CLOSED);
    // An unknown status is parked at ROUTING_PENDING, never silently closed.
    expect(mapLegacyStatus('SOMETHING_NEW')).toBe(ReportStatus.ROUTING_PENDING);
  });
});

describe('backfillLegacyWarrantyReports (decisions.md I3)', () => {
  it('is a no-op when nothing needs mirroring', async () => {
    const result = await backfillLegacyWarrantyReports();
    expect(result).toEqual({
      scanned: 0,
      created: 0,
      skippedAlreadyMirrored: 0,
      skippedNoOwnership: 0,
      dryRun: false,
    });
    expect(db.report.create).not.toHaveBeenCalled();
  });

  it('only ever reads rows that have no canonical mirror yet (the idempotency key)', async () => {
    await backfillLegacyWarrantyReports();
    expect(db.warrantyReport.findMany.mock.calls[0][0].where).toEqual({
      canonicalReport: { is: null },
    });
  });

  it('mirrors a legacy row without inventing a warranty verdict or an SLA', async () => {
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);

    const result = await backfillLegacyWarrantyReports();

    expect(result.created).toBe(1);
    const data = db.report.create.mock.calls[0][0].data;
    expect(data.origin).toBe('LEGACY_WARRANTY_REPORT');
    expect(data.legacyWarrantyReportId).toBe('wr-1');
    expect(data.warrantyVerdict).toBe('NOT_EVALUATED_LEGACY');
    expect(data.warrantyReasonCode).toBe('LEGACY_IMPORT_NOT_EVALUATED');
    expect(data.warrantyPeriodStart).toBeNull();
    expect(data.warrantyPeriodEnd).toBeNull();
    // No SLA is retro-applied to a historical row.
    expect(data.slaStartDueAt).toBeNull();
    // The original creation timestamp is preserved, not stamped as "now".
    expect(data.createdAt).toEqual(CREATED);
    expect(data.status).toBe(ReportStatus.ROUTED);
  });

  it('never assigns a technician to a mirrored row', async () => {
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);
    await backfillLegacyWarrantyReports();
    const data = db.report.create.mock.calls[0][0].data;
    expect(data.assignedTechnicianId).toBeUndefined();
    expect(data.originalTechnicianId).toBeUndefined();
  });

  it('writes exactly one honest LEGACY_IMPORTED event - no fabricated history', async () => {
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);

    await backfillLegacyWarrantyReports();

    expect(db.reportTimelineEvent.create).toHaveBeenCalledTimes(1);
    const event = db.reportTimelineEvent.create.mock.calls[0][0].data;
    expect(event.type).toBe('LEGACY_IMPORTED');
    expect(event.actorType).toBe('SYSTEM');
    expect(event.metadata).toEqual({
      sourceModel: 'WarrantyReport',
      sourceId: 'wr-1',
      sourceReferenceNumber: 'WR-AB12CD34',
      sourceStatus: 'ASSIGNED',
      sourceCategory: 'سباكة',
    });
  });

  it('preserves the closed timestamp only for a genuinely closed legacy row', async () => {
    db.warrantyReport.findMany
      .mockResolvedValueOnce([legacyRow({ id: 'wr-c', status: 'CLOSED' })])
      .mockResolvedValueOnce([]);
    await backfillLegacyWarrantyReports();
    expect(db.report.create.mock.calls[0][0].data.closedAt).toEqual(UPDATED);
  });

  it('skips (and reports) a legacy row with no Ownership rather than inventing one', async () => {
    db.ownership.findFirst.mockResolvedValue(null);
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await backfillLegacyWarrantyReports();

    expect(result.created).toBe(0);
    expect(result.skippedNoOwnership).toBe(1);
    expect(db.report.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never writes to a legacy table - reads only', async () => {
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);
    await backfillLegacyWarrantyReports();
    // The mocked client exposes no update/delete on warrantyReport at all, and
    // the script must never reach for one.
    expect(Object.keys(db.warrantyReport)).toEqual(['findMany']);
  });

  it('performs no writes in dry-run mode but still reports what it would do', async () => {
    db.warrantyReport.findMany.mockResolvedValueOnce([legacyRow()]).mockResolvedValueOnce([]);

    const result = await backfillLegacyWarrantyReports({ dryRun: true });

    expect(result).toMatchObject({ scanned: 1, created: 1, dryRun: true });
    expect(db.report.create).not.toHaveBeenCalled();
    expect(db.reportTimelineEvent.create).not.toHaveBeenCalled();
  });

  it('advances an id cursor so a skipped row can never loop forever', async () => {
    db.ownership.findFirst.mockResolvedValue(null);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    db.warrantyReport.findMany
      .mockResolvedValueOnce([legacyRow({ id: 'wr-a' })])
      .mockResolvedValueOnce([]);

    await backfillLegacyWarrantyReports();

    // Second page must be requested with a cursor past the first page's last id.
    expect(db.warrantyReport.findMany.mock.calls[1][0].cursor).toEqual({ id: 'wr-a' });
    expect(db.warrantyReport.findMany.mock.calls[1][0].skip).toBe(1);
    warn.mockRestore();
  });
});
