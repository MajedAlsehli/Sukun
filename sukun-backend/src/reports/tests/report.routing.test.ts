import { ReportCategory } from '@prisma/client';
import {
  compareCandidates,
  RoutingCandidate,
  ROUTABLE_TECHNICIAN_STATUSES,
  routeReport,
  selectTechnician,
} from '../report.routing';

// Task 10: routeReport writes a timeline event through the repository, which
// is a separate module - stub it so these stay pure unit tests of the routing
// decision and its concurrency guard.
jest.mock('../report.repository', () => ({
  reportRepository: { appendTimelineEvent: jest.fn() },
}));

function candidate(overrides: Partial<RoutingCandidate> & { id: string }): RoutingCandidate {
  return {
    specialty: null,
    lastAssignedAt: null,
    hasActiveRepair: false,
    openReportCount: 0,
    ...overrides,
  };
}

describe('selectTechnician - deterministic automatic routing (decisions.md I8)', () => {
  it('records NO_ELIGIBLE_TECHNICIAN and assigns nobody when the pool is empty', () => {
    expect(selectTechnician([], ReportCategory.PLUMBING)).toEqual({
      technicianId: null,
      reasonCode: 'NO_ELIGIBLE_TECHNICIAN',
    });
  });

  it('prefers a specialty match over anything else', () => {
    const decision = selectTechnician(
      [
        candidate({ id: 'a', specialty: 'صيانة عامة' }),
        candidate({ id: 'b', specialty: 'سباكة' }),
        candidate({ id: 'c', specialty: 'كهرباء' }),
      ],
      ReportCategory.PLUMBING,
    );
    expect(decision).toEqual({ technicianId: 'b', reasonCode: 'SPECIALTY_MATCH' });
  });

  it('falls back to a general-maintenance technician when no specialty matches', () => {
    const decision = selectTechnician(
      [candidate({ id: 'a', specialty: 'كهرباء' }), candidate({ id: 'b', specialty: 'صيانة عامة' })],
      ReportCategory.PLUMBING,
    );
    expect(decision).toEqual({ technicianId: 'b', reasonCode: 'GENERAL_MAINTENANCE_FALLBACK' });
  });

  it('falls back to any eligible technician rather than leaving a valid report unrouted', () => {
    const decision = selectTechnician(
      [candidate({ id: 'a', specialty: 'كهرباء' }), candidate({ id: 'b', specialty: null })],
      ReportCategory.PLUMBING,
    );
    expect(decision.reasonCode).toBe('ANY_ELIGIBLE_FALLBACK');
    expect(decision.technicianId).toBeTruthy();
  });

  it('treats a technician with no recorded specialty as tier 3, never as a match', () => {
    const decision = selectTechnician(
      [candidate({ id: 'a', specialty: null }), candidate({ id: 'b', specialty: 'سباكة' })],
      ReportCategory.PLUMBING,
    );
    expect(decision).toEqual({ technicianId: 'b', reasonCode: 'SPECIALTY_MATCH' });
  });

  describe('within a tier, the ordering is total and deterministic', () => {
    it('(a) prefers a technician with no active repair', () => {
      const decision = selectTechnician(
        [
          candidate({ id: 'a', specialty: 'سباكة', hasActiveRepair: true, openReportCount: 0 }),
          candidate({ id: 'b', specialty: 'سباكة', hasActiveRepair: false, openReportCount: 5 }),
        ],
        ReportCategory.PLUMBING,
      );
      expect(decision.technicianId).toBe('b');
    });

    it('(b) then prefers the lowest open workload', () => {
      const decision = selectTechnician(
        [
          candidate({ id: 'a', specialty: 'سباكة', openReportCount: 4 }),
          candidate({ id: 'b', specialty: 'سباكة', openReportCount: 1 }),
          candidate({ id: 'c', specialty: 'سباكة', openReportCount: 9 }),
        ],
        ReportCategory.PLUMBING,
      );
      expect(decision.technicianId).toBe('b');
    });

    it('(c) then prefers the least-recently assigned, with never-assigned first', () => {
      const decision = selectTechnician(
        [
          candidate({ id: 'a', specialty: 'سباكة', lastAssignedAt: new Date('2026-01-01') }),
          candidate({ id: 'b', specialty: 'سباكة', lastAssignedAt: null }),
          candidate({ id: 'c', specialty: 'سباكة', lastAssignedAt: new Date('2025-01-01') }),
        ],
        ReportCategory.PLUMBING,
      );
      expect(decision.technicianId).toBe('b');
    });

    it('(d) breaks a perfect tie by id, so the same state always routes identically', () => {
      const pool = [
        candidate({ id: 'zzz', specialty: 'سباكة' }),
        candidate({ id: 'aaa', specialty: 'سباكة' }),
        candidate({ id: 'mmm', specialty: 'سباكة' }),
      ];
      expect(selectTechnician(pool, ReportCategory.PLUMBING).technicianId).toBe('aaa');
      // Order of the input array must not change the outcome.
      expect(selectTechnician([...pool].reverse(), ReportCategory.PLUMBING).technicianId).toBe('aaa');
    });

    it('leaves no residual ties - comparing any two distinct candidates is never 0', () => {
      const a = candidate({ id: 'a', specialty: 'سباكة' });
      const b = candidate({ id: 'b', specialty: 'سباكة' });
      expect(compareCandidates(a, b)).toBeLessThan(0);
      expect(compareCandidates(b, a)).toBeGreaterThan(0);
      expect(compareCandidates(a, a)).toBe(0);
    });
  });

  it('never mutates the caller\'s candidate array while sorting', () => {
    const pool = [candidate({ id: 'z', specialty: 'سباكة' }), candidate({ id: 'a', specialty: 'سباكة' })];
    const before = pool.map((c) => c.id);
    selectTechnician(pool, ReportCategory.PLUMBING);
    expect(pool.map((c) => c.id)).toEqual(before);
  });

  it('is a pure function - repeated calls with the same input give the same answer', () => {
    const pool = [
      candidate({ id: 'a', specialty: 'صيانة عامة', openReportCount: 2 }),
      candidate({ id: 'b', specialty: 'صيانة عامة', openReportCount: 2 }),
    ];
    const results = Array.from({ length: 20 }, () => selectTechnician(pool, ReportCategory.CEILINGS));
    expect(new Set(results.map((r) => r.technicianId)).size).toBe(1);
  });
});

describe('technician eligibility (invariant 10)', () => {
  it('never routes to an INVITED or INACTIVE technician', () => {
    expect(ROUTABLE_TECHNICIAN_STATUSES).toEqual(['ACTIVATED', 'AVAILABLE', 'BUSY']);
    expect(ROUTABLE_TECHNICIAN_STATUSES).not.toContain('INVITED');
    expect(ROUTABLE_TECHNICIAN_STATUSES).not.toContain('INACTIVE');
  });
});

// ---------------------------------------------------------------------------
// Task 10 - the routing-retry sweep is what Vercel Cron now calls every 15
// minutes (vercel.json). These pin the two properties that makes that safe.
// ---------------------------------------------------------------------------
describe('routeReport idempotency and concurrency safety (decisions.md I9)', () => {
  function dbStub(overrides: Record<string, unknown> = {}) {
    return {
      report: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      technician: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      reportTimelineEvent: { create: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
  }

  it('does nothing at all for a report that is no longer ROUTING_PENDING', async () => {
    const db = dbStub();
    db.report.findUnique.mockResolvedValue({
      id: 'r1',
      projectId: 'p1',
      category: 'PLUMBING',
      status: 'ROUTED',
      originalTechnicianId: null,
    });

    const result = await routeReport('r1', db as never);

    expect(result.assigned).toBe(false);
    // No assignment, no status write, and above all no duplicate timeline event.
    expect(db.report.updateMany).not.toHaveBeenCalled();
    expect(db.report.update).not.toHaveBeenCalled();
    expect(db.reportTimelineEvent.create).not.toHaveBeenCalled();
  });

  it('re-asserts ROUTING_PENDING inside the write, so a lost race assigns nothing twice', async () => {
    const db = dbStub();
    db.report.findUnique.mockResolvedValue({
      id: 'r1',
      projectId: 'p1',
      category: 'PLUMBING',
      status: 'ROUTING_PENDING',
      originalTechnicianId: null,
    });
    db.technician.findMany.mockResolvedValue([
      {
        id: 't1',
        specialty: 'PLUMBING',
        lastAssignedAt: null,
        _count: { reportRepairs: 0, assignedReports: 0 },
      },
    ]);
    // Another transaction won: the conditional update matched zero rows.
    db.report.updateMany.mockResolvedValue({ count: 0 });

    const result = await routeReport('r1', db as never);

    expect(result.assigned).toBe(false);
    // The condition is the concurrency guard - it must be part of the WHERE.
    expect(db.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'r1', status: 'ROUTING_PENDING' }),
      }),
    );
    // Nothing downstream of a lost race may run.
    expect(db.technician.update).not.toHaveBeenCalled();
    expect(db.reportTimelineEvent.create).not.toHaveBeenCalled();
  });
});
