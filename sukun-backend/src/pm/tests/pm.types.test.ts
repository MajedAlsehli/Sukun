import { ReportPriority, ReportStatus } from '@prisma/client';
import {
  AlertEvaluableReport,
  averageMinutes,
  computeSlaCompliance,
  currentMonthRange,
  foldStatusCounts,
  generateAlerts,
  PM_OPEN_STATUSES,
  resolveTechnicianLoad,
  SlaEvaluableReport,
} from '../pm.types';

// ---------------------------------------------------------------------------
// Task 9 (decisions.md J4/J5/J6/J9). Pure rules - no database, no clock: every
// case below passes an explicit `now`.
// ---------------------------------------------------------------------------

describe('PM KPI status folding (decisions.md J4)', () => {
  it('folds groupBy rows into the three DISJOINT live buckets plus closed', () => {
    const counts = foldStatusCounts([
      { status: ReportStatus.ROUTING_PENDING, count: 2 },
      { status: ReportStatus.ROUTED, count: 3 },
      { status: ReportStatus.IN_PROGRESS, count: 4 },
      { status: ReportStatus.AWAITING_OWNER_APPROVAL, count: 1 },
      { status: ReportStatus.CLOSED, count: 9 },
    ]);

    // ROUTING_PENDING + ROUTED read as "open": in both, nobody has started.
    expect(counts.openReports).toBe(5);
    expect(counts.inProgress).toBe(4);
    expect(counts.awaitingOwnerApproval).toBe(1);
    expect(counts.closed).toBe(9);

    // The invariant that makes the strip trustworthy: no report is counted twice.
    expect(counts.openReports + counts.inProgress + counts.awaitingOwnerApproval).toBe(10);
  });

  it('returns honest zeros for a project with no reports at all', () => {
    expect(foldStatusCounts([])).toEqual({
      openReports: 0,
      inProgress: 0,
      awaitingOwnerApproval: 0,
      closed: 0,
    });
  });

  it('treats exactly ROUTING_PENDING and ROUTED as open', () => {
    expect(PM_OPEN_STATUSES).toEqual([ReportStatus.ROUTING_PENDING, ReportStatus.ROUTED]);
  });
});

describe('month boundaries (decisions.md J4)', () => {
  it('produces a half-open [start, end) window in server time', () => {
    const { periodStart, periodEnd } = currentMonthRange(new Date(2026, 6, 28, 13, 45, 12));
    expect(periodStart).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it('rolls over the year at December', () => {
    const { periodStart, periodEnd } = currentMonthRange(new Date(2026, 11, 31, 23, 59, 59));
    expect(periodStart).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
    expect(periodEnd).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });
});

describe('SLA compliance formula (decisions.md J5)', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const base = {
    id: 'r',
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    assignedTechnicianId: 't1',
  };

  const report = (over: Partial<SlaEvaluableReport>): SlaEvaluableReport => ({
    ...base,
    slaStartDueAt: null,
    repairStartedAt: null,
    ...over,
  });

  it('returns null - never 0, never 100 - on an empty denominator', () => {
    expect(computeSlaCompliance([], now, null)).toEqual({
      compliancePercent: null,
      eligibleCount: 0,
      metCount: 0,
      breachedCount: 0,
    });
  });

  it('excludes reports with no configured SLA target entirely (MEDIUM/LOW)', () => {
    // Not a pass and not a fail - they never had a target to meet.
    const result = computeSlaCompliance(
      [report({ slaStartDueAt: null }), report({ slaStartDueAt: null, repairStartedAt: now })],
      now,
      null,
    );
    expect(result.eligibleCount).toBe(0);
    expect(result.compliancePercent).toBeNull();
  });

  it('excludes an OPEN, not-yet-breached report - the outcome is undetermined', () => {
    const result = computeSlaCompliance(
      [report({ slaStartDueAt: new Date('2026-07-28T23:00:00.000Z'), repairStartedAt: null })],
      now,
      null,
    );
    expect(result.eligibleCount).toBe(0);
    expect(result.compliancePercent).toBeNull();
  });

  it('INCLUDES an open breached report as a failure, so a live breach cannot hide', () => {
    const result = computeSlaCompliance(
      [report({ slaStartDueAt: new Date('2026-07-28T04:00:00.000Z'), repairStartedAt: null })],
      now,
      null,
    );
    expect(result.eligibleCount).toBe(1);
    expect(result.breachedCount).toBe(1);
    expect(result.metCount).toBe(0);
    expect(result.compliancePercent).toBe(0);
  });

  it('counts a started-in-time report as met and a started-late one as breached', () => {
    const dueAt = new Date('2026-07-28T04:00:00.000Z');
    const result = computeSlaCompliance(
      [
        report({ id: 'a', slaStartDueAt: dueAt, repairStartedAt: new Date('2026-07-28T03:00:00.000Z') }),
        report({ id: 'b', slaStartDueAt: dueAt, repairStartedAt: new Date('2026-07-28T05:00:00.000Z') }),
      ],
      now,
      null,
    );
    expect(result).toEqual({
      compliancePercent: 50,
      eligibleCount: 2,
      metCount: 1,
      breachedCount: 1,
    });
  });

  it('never lets a reopen re-open a settled outcome - counted once, from the FIRST start', () => {
    // `repairStartedAt` is the first start and is never overwritten, so however
    // many times the homeowner sends the work back, this is one MET report.
    const dueAt = new Date('2026-07-28T04:00:00.000Z');
    const result = computeSlaCompliance(
      [report({ slaStartDueAt: dueAt, repairStartedAt: new Date('2026-07-28T01:00:00.000Z') })],
      new Date('2027-01-01T00:00:00.000Z'),
      null,
    );
    expect(result).toEqual({
      compliancePercent: 100,
      eligibleCount: 1,
      metCount: 1,
      breachedCount: 0,
    });
  });

  it('rounds to a whole percentage', () => {
    const dueAt = new Date('2026-07-28T04:00:00.000Z');
    const met = new Date('2026-07-28T01:00:00.000Z');
    const late = new Date('2026-07-28T09:00:00.000Z');
    const result = computeSlaCompliance(
      [
        report({ id: 'a', slaStartDueAt: dueAt, repairStartedAt: met }),
        report({ id: 'b', slaStartDueAt: dueAt, repairStartedAt: met }),
        report({ id: 'c', slaStartDueAt: dueAt, repairStartedAt: late }),
      ],
      now,
      null,
    );
    expect(result.compliancePercent).toBe(67); // 2/3
  });

  it('is unaffected by the at-risk heuristic - AT_RISK is never an outcome', () => {
    const openInWindow = report({
      slaStartDueAt: new Date('2026-07-28T13:00:00.000Z'),
      createdAt: new Date('2026-07-28T00:00:00.000Z'),
      repairStartedAt: null,
    });
    // Configured (0.75 -> this report reads AT_RISK) and unconfigured both
    // exclude it: at-risk is a warning, not a determined outcome.
    expect(computeSlaCompliance([openInWindow], now, 0.75).eligibleCount).toBe(0);
    expect(computeSlaCompliance([openInWindow], now, null).eligibleCount).toBe(0);
  });
});

describe('averageMinutes', () => {
  it('returns null rather than 0 when there is nothing to average', () => {
    expect(averageMinutes([])).toBeNull();
  });

  it('rounds the mean', () => {
    expect(averageMinutes([10, 20, 31])).toBe(20);
  });
});

describe('alert generation (decisions.md J6)', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const unconfigured = { awaitingApprovalHours: null, stalledHours: null };

  const report = (over: Partial<AlertEvaluableReport>): AlertEvaluableReport => ({
    id: 'r1',
    reportNumber: 1042,
    status: ReportStatus.ROUTED,
    priority: ReportPriority.HIGH,
    problemText: 'تسريب',
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    updatedAt: new Date('2026-07-28T06:00:00.000Z'),
    createdAtDue: null,
    repairStartedAt: null,
    repairSubmittedAt: null,
    reopenCount: 0,
    routingReasonCode: null,
    assignedTechnicianId: null,
    assignedTechnicianName: null,
    ...over,
  });

  it('produces nothing at all for a healthy project - an empty state, not an error', () => {
    expect(generateAlerts([report({})], unconfigured, now, null)).toEqual([]);
  });

  it('alerts on a genuinely breached SLA and points at the real report', () => {
    const alerts = generateAlerts(
      [report({ createdAtDue: new Date('2026-07-28T04:00:00.000Z') })],
      unconfigured,
      now,
      null,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('SLA_BREACHED');
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].reportId).toBe('r1');
    expect(alerts[0].reportNumber).toBe(1042);
    expect(alerts[0].target).toEqual({ type: 'report', id: 'r1' });
    expect(alerts[0].ageHours).toBe(8);
  });

  it('NEVER alerts on a closed report, even one that breached historically', () => {
    // The historical breach stays visible in PM2's history and in the
    // compliance denominator - it is not an active unresolved alert.
    const alerts = generateAlerts(
      [
        report({
          status: ReportStatus.CLOSED,
          createdAtDue: new Date('2026-07-28T04:00:00.000Z'),
          reopenCount: 3,
        }),
      ],
      { awaitingApprovalHours: 1, stalledHours: 1 },
      now,
      null,
    );
    expect(alerts).toEqual([]);
  });

  it('alerts when automatic routing found no eligible technician, carrying the real reason code', () => {
    const alerts = generateAlerts(
      [
        report({
          status: ReportStatus.ROUTING_PENDING,
          routingReasonCode: 'NO_ELIGIBLE_TECHNICIAN',
        }),
      ],
      unconfigured,
      now,
      null,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('ROUTING_PENDING');
    expect(alerts[0].reasonCode).toBe('NO_ELIGIBLE_TECHNICIAN');
  });

  it('alerts on a homeowner reopen - a stored counter, not a threshold', () => {
    const alerts = generateAlerts([report({ reopenCount: 1 })], unconfigured, now, null);
    expect(alerts.map((a) => a.type)).toEqual(['REOPENED_BY_HOMEOWNER']);
    expect(alerts[0].severity).toBe('WARNING');
  });

  it('does NOT invent an aging-approval threshold when none is configured', () => {
    const aging = report({
      status: ReportStatus.AWAITING_OWNER_APPROVAL,
      repairSubmittedAt: new Date('2026-07-01T00:00:00.000Z'), // weeks old
    });
    expect(generateAlerts([aging], unconfigured, now, null)).toEqual([]);
  });

  it('produces the aging-approval alert only once an operator configures the hours', () => {
    const aging = report({
      status: ReportStatus.AWAITING_OWNER_APPROVAL,
      repairSubmittedAt: new Date('2026-07-28T00:00:00.000Z'), // 12h ago
    });
    expect(
      generateAlerts([aging], { awaitingApprovalHours: 24, stalledHours: null }, now, null),
    ).toEqual([]);

    const fired = generateAlerts(
      [aging],
      { awaitingApprovalHours: 6, stalledHours: null },
      now,
      null,
    );
    expect(fired.map((a) => a.type)).toEqual(['AWAITING_APPROVAL_AGING']);
    expect(fired[0].ageHours).toBe(12);
  });

  it('does NOT invent a stalled-hours threshold when none is configured', () => {
    const stalled = report({
      status: ReportStatus.IN_PROGRESS,
      repairStartedAt: new Date('2026-07-01T00:00:00.000Z'),
      repairSubmittedAt: null,
    });
    expect(generateAlerts([stalled], unconfigured, now, null)).toEqual([]);
    expect(
      generateAlerts([stalled], { awaitingApprovalHours: null, stalledHours: 8 }, now, null).map(
        (a) => a.type,
      ),
    ).toEqual(['STALLED_REPAIR']);
  });

  it('does not treat a submitted repair as stalled', () => {
    const submitted = report({
      status: ReportStatus.IN_PROGRESS,
      repairStartedAt: new Date('2026-07-01T00:00:00.000Z'),
      repairSubmittedAt: new Date('2026-07-02T00:00:00.000Z'),
    });
    expect(
      generateAlerts([submitted], { awaitingApprovalHours: null, stalledHours: 8 }, now, null),
    ).toEqual([]);
  });

  it('a resolved condition simply stops being generated - there is no lingering row', () => {
    const breaching = report({ createdAtDue: new Date('2026-07-28T04:00:00.000Z') });
    expect(generateAlerts([breaching], unconfigured, now, null)).toHaveLength(1);

    // The technician started in time after all -> the outcome is MET, and the
    // alert vanishes on the very next read. No dismissal, no stale state.
    const started = report({
      createdAtDue: new Date('2026-07-28T04:00:00.000Z'),
      repairStartedAt: new Date('2026-07-28T03:00:00.000Z'),
      status: ReportStatus.IN_PROGRESS,
    });
    expect(generateAlerts([started], unconfigured, now, null)).toEqual([]);
  });

  it('orders critical alerts before warnings, then oldest condition first', () => {
    const alerts = generateAlerts(
      [
        report({ id: 'a', reopenCount: 1, updatedAt: new Date('2026-07-28T11:00:00.000Z') }),
        report({ id: 'b', createdAtDue: new Date('2026-07-28T04:00:00.000Z') }),
        report({
          id: 'c',
          status: ReportStatus.ROUTING_PENDING,
          createdAt: new Date('2026-07-27T00:00:00.000Z'),
        }),
      ],
      unconfigured,
      now,
      null,
    );
    expect(alerts.map((a) => a.severity)).toEqual(['CRITICAL', 'CRITICAL', 'WARNING']);
    expect(alerts[0].reportId).toBe('c'); // the longest-standing critical
  });

  it('can raise more than one alert for the same report, each with a distinct id', () => {
    const alerts = generateAlerts(
      [
        report({
          status: ReportStatus.ROUTING_PENDING,
          createdAtDue: new Date('2026-07-28T04:00:00.000Z'),
          reopenCount: 2,
        }),
      ],
      unconfigured,
      now,
      null,
    );
    expect(alerts).toHaveLength(3);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(3);
  });
});

describe('technician load (decisions.md J9)', () => {
  it('reports BUSY from a real active repair row', () => {
    expect(
      resolveTechnicianLoad({ technicianStatus: 'ACTIVATED', userStatus: 'ACTIVE', hasActiveRepair: true }),
    ).toBe('BUSY');
  });

  it('reports AVAILABLE for an active technician holding no active repair', () => {
    expect(
      resolveTechnicianLoad({ technicianStatus: 'ACTIVATED', userStatus: 'ACTIVE', hasActiveRepair: false }),
    ).toBe('AVAILABLE');
  });

  it('reports UNAVAILABLE for invited, inactive, or deactivated-account technicians', () => {
    expect(
      resolveTechnicianLoad({ technicianStatus: 'INVITED', userStatus: 'ACTIVE', hasActiveRepair: false }),
    ).toBe('UNAVAILABLE');
    expect(
      resolveTechnicianLoad({ technicianStatus: 'INACTIVE', userStatus: 'ACTIVE', hasActiveRepair: false }),
    ).toBe('UNAVAILABLE');
    expect(
      resolveTechnicianLoad({ technicianStatus: 'ACTIVATED', userStatus: 'INACTIVE', hasActiveRepair: false }),
    ).toBe('UNAVAILABLE');
  });

  it('does not trust the unmaintained AVAILABLE/BUSY TechnicianStatus enum members', () => {
    // A row literally marked AVAILABLE while holding an active repair is BUSY:
    // the repair row is the fact, the enum member is not maintained anywhere.
    expect(
      resolveTechnicianLoad({ technicianStatus: 'AVAILABLE', userStatus: 'ACTIVE', hasActiveRepair: true }),
    ).toBe('BUSY');
  });
});
