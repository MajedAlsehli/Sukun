import { ReportStatus, UserRole } from '@prisma/client';
import { pmService, resolvePmScope, type Principal } from '../pm.service';
import { pmRepository } from '../pm.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { reportService } from '../../reports/report.service';
import type {
  PmCopilotProvider,
  PmInsightProvider,
  PmCopilotSnapshot,
} from '../providers/pm-copilot.provider';

jest.mock('../pm.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../reports/report.service', () => ({
  ...jest.requireActual('../../reports/report.service'),
  reportService: { list: jest.fn() },
}));

const repo = pmRepository as jest.Mocked<typeof pmRepository>;
const managers = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const reports = reportService as jest.Mocked<typeof reportService>;

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222';

const pmPrincipal: Principal = { id: 'pm-user', role: UserRole.PROJECT_MANAGER, companyId: null };

function project(id = PROJECT_ID) {
  return {
    id,
    name: 'تلال الرياض',
    code: 'PRJ-001',
    city: 'الرياض',
    district: 'النرجس',
    status: 'ACTIVE',
    isActive: true,
    companyId: 'company-1',
  };
}

function technician(over: Record<string, unknown> = {}) {
  return {
    id: 'tech-1',
    projectId: PROJECT_ID,
    specialty: 'سباكة',
    status: 'ACTIVATED',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    user: { id: 'tech-user-1', name: 'سعد القرني', phone: '0500000000', status: 'ACTIVE' },
    ...over,
  };
}

/** Everything empty by default, so each test states only what it is about. */
function stubEmptyProject() {
  managers.findByUserId.mockResolvedValue({ projectId: PROJECT_ID } as never);
  repo.findManagedProject.mockResolvedValue(project() as never);
  repo.statusCounts.mockResolvedValue([] as never);
  repo.countClosedInPeriod.mockResolvedValue(0 as never);
  repo.closedResolutionTimestamps.mockResolvedValue([] as never);
  repo.slaEvaluableReports.mockResolvedValue([] as never);
  repo.alertCandidates.mockResolvedValue([] as never);
  repo.rosterTechnicians.mockResolvedValue([] as never);
  repo.historicalTechnicians.mockResolvedValue([] as never);
  repo.openReportCounts.mockResolvedValue(new Map() as never);
  repo.completedRepairStats.mockResolvedValue(new Map() as never);
  repo.reviewStats.mockResolvedValue(new Map() as never);
  repo.technicianIdsWithActiveRepair.mockResolvedValue(new Set() as never);
  repo.timelineEvents.mockResolvedValue([] as never);
  repo.technicianAuditEvents.mockResolvedValue([] as never);
  repo.recentReportsForTechnician.mockResolvedValue([] as never);
  repo.reviewsForTechnician.mockResolvedValue([] as never);
  repo.slaEvaluableReportsForTechnician.mockResolvedValue([] as never);
  repo.dailyCounts.mockResolvedValue({ created: 0, closed: 0, reopened: 0 } as never);
  reports.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubEmptyProject();
});

// ---------------------------------------------------------------------------
// decisions.md J2/J3 - scoping and read-only-ness
// ---------------------------------------------------------------------------

describe('PM project scoping (decisions.md J2)', () => {
  it('derives the project from the authenticated principal, never from the request', async () => {
    const scope = await resolvePmScope(pmPrincipal);
    expect(managers.findByUserId).toHaveBeenCalledWith('pm-user');
    expect(scope.projectId).toBe(PROJECT_ID);
  });

  it('404s a foreign projectId rather than quietly filtering to empty', async () => {
    await expect(resolvePmScope(pmPrincipal, OTHER_PROJECT_ID)).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_FOUND',
    });
  });

  it('accepts the PM own projectId when it is passed explicitly', async () => {
    const scope = await resolvePmScope(pmPrincipal, PROJECT_ID);
    expect(scope.projectId).toBe(PROJECT_ID);
  });

  it('refuses every non-PM role outright', async () => {
    for (const role of [UserRole.COMPANY, UserRole.HOMEOWNER, UserRole.TECHNICIAN, UserRole.HOME_SEEKER]) {
      await expect(resolvePmScope({ id: 'u', role, companyId: 'c' })).rejects.toThrow();
    }
  });

  it('gives an unassigned manager an honest empty state, not an error', async () => {
    managers.findByUserId.mockResolvedValue({ projectId: null } as never);

    const overview = await pmService.overview(pmPrincipal);
    expect(overview.assigned).toBe(false);
    expect(overview.project).toBeNull();
    expect(overview.kpis.openReports).toBe(0);
    // Honest nulls, not zeros dressed up as measurements.
    expect(overview.kpis.slaCompliancePercent).toBeNull();
    expect(overview.kpis.averageResolutionTimeMinutes).toBeNull();

    expect((await pmService.alerts(pmPrincipal)).assigned).toBe(false);
    expect((await pmService.activity(pmPrincipal)).assigned).toBe(false);
    expect((await pmService.contractors(pmPrincipal)).assigned).toBe(false);

    // It never even queries the project data.
    expect(repo.statusCounts).not.toHaveBeenCalled();
  });

  it('404s a technician from another project (hide existence, not 403)', async () => {
    repo.findTechnicianById.mockResolvedValue(technician({ projectId: OTHER_PROJECT_ID }) as never);
    repo.countReportsForTechnician.mockResolvedValue(0 as never);

    await expect(pmService.contractorPerformance(pmPrincipal, 'tech-1')).rejects.toMatchObject({
      errorCode: 'TECHNICIAN_NOT_FOUND',
    });
  });

  it('404s a technician that does not exist at all', async () => {
    repo.findTechnicianById.mockResolvedValue(null as never);
    await expect(pmService.contractorPerformance(pmPrincipal, 'nope')).rejects.toMatchObject({
      errorCode: 'TECHNICIAN_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// decisions.md J4 - KPIs
// ---------------------------------------------------------------------------

describe('PM overview KPIs (decisions.md J4)', () => {
  it('computes the six KPIs from canonical reports and returns the resolved period', async () => {
    repo.statusCounts.mockResolvedValue([
      { status: ReportStatus.ROUTING_PENDING, count: 1 },
      { status: ReportStatus.ROUTED, count: 2 },
      { status: ReportStatus.IN_PROGRESS, count: 4 },
      { status: ReportStatus.AWAITING_OWNER_APPROVAL, count: 3 },
      { status: ReportStatus.CLOSED, count: 12 },
    ] as never);
    repo.countClosedInPeriod.mockResolvedValue(5 as never);
    repo.closedResolutionTimestamps.mockResolvedValue([
      {
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: new Date('2026-07-01T02:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
        closedAt: new Date('2026-07-02T04:00:00.000Z'),
      },
    ] as never);

    const overview = await pmService.overview(pmPrincipal);

    expect(overview.kpis.openReports).toBe(3);
    expect(overview.kpis.inProgress).toBe(4);
    expect(overview.kpis.awaitingOwnerApproval).toBe(3);
    expect(overview.kpis.closedThisMonth).toBe(5);
    expect(overview.kpis.averageResolutionTimeMinutes).toBe(180); // (120 + 240) / 2
    expect(overview.totalActiveReports).toBe(10);
    expect(overview.period.start).toBeInstanceOf(Date);
    expect(overview.period.end.getTime()).toBeGreaterThan(overview.period.start.getTime());
  });

  it('returns null - never 0 - for both averages when nothing has closed', async () => {
    const overview = await pmService.overview(pmPrincipal);
    expect(overview.kpis.averageResolutionTimeMinutes).toBeNull();
    expect(overview.kpis.slaCompliancePercent).toBeNull();
    expect(overview.sla.eligibleCount).toBe(0);
  });

  it('reports the at-risk policy as unconfigured in this environment', async () => {
    const overview = await pmService.overview(pmPrincipal);
    expect(overview.sla.atRiskPolicy.configured).toBe(false);
    expect(overview.sla.atRiskPolicy.fraction).toBeNull();
    expect(overview.sla.atRiskPolicy.version).toBeTruthy();
  });

  it('exposes the compliance numerator and denominator so the percentage is auditable', async () => {
    repo.slaEvaluableReports.mockResolvedValue([
      {
        id: 'a',
        createdAt: new Date('2026-07-28T00:00:00.000Z'),
        slaStartDueAt: new Date('2026-07-28T04:00:00.000Z'),
        assignedTechnicianId: 'tech-1',
        repair: { startedAt: new Date('2026-07-28T01:00:00.000Z') },
      },
      {
        id: 'b',
        createdAt: new Date('2026-07-28T00:00:00.000Z'),
        slaStartDueAt: new Date('2026-07-28T04:00:00.000Z'),
        assignedTechnicianId: 'tech-1',
        repair: { startedAt: new Date('2026-07-28T09:00:00.000Z') },
      },
    ] as never);

    const overview = await pmService.overview(pmPrincipal);
    expect(overview.kpis.slaCompliancePercent).toBe(50);
    expect(overview.sla.eligibleCount).toBe(2);
    expect(overview.sla.metCount).toBe(1);
    expect(overview.sla.breachedCount).toBe(1);
  });

  it('uses grouped aggregates, not one query per KPI', async () => {
    await pmService.overview(pmPrincipal);
    expect(repo.statusCounts).toHaveBeenCalledTimes(1);
    expect(repo.countClosedInPeriod).toHaveBeenCalledTimes(1);
    expect(repo.slaEvaluableReports).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// decisions.md J6 - alerts
// ---------------------------------------------------------------------------

describe('PM alerts (decisions.md J6)', () => {
  it('reports both threshold rules as unconfigured here, and generates neither', async () => {
    const alerts = await pmService.alerts(pmPrincipal);
    expect(alerts.rules).toEqual({ awaitingApprovalHours: null, stalledHours: null });
    expect(alerts.items).toEqual([]);
  });

  it('builds each alert from a real report row inside the PM scope', async () => {
    repo.alertCandidates.mockResolvedValue([
      {
        id: 'report-1',
        reportNumber: 1042,
        status: ReportStatus.ROUTING_PENDING,
        priority: 'HIGH',
        problemText: 'تسريب',
        createdAt: new Date(Date.now() - 3 * 3_600_000),
        updatedAt: new Date(),
        slaStartDueAt: null,
        reopenCount: 0,
        routingReasonCode: 'NO_ELIGIBLE_TECHNICIAN',
        assignedTechnicianId: null,
        assignedTechnician: null,
        repair: null,
      },
    ] as never);

    const alerts = await pmService.alerts(pmPrincipal);
    expect(alerts.items).toHaveLength(1);
    expect(alerts.items[0].type).toBe('ROUTING_PENDING');
    expect(alerts.items[0].target).toEqual({ type: 'report', id: 'report-1' });
    expect(alerts.items[0].reportNumber).toBe(1042);
    expect(alerts.items[0].reasonCode).toBe('NO_ELIGIBLE_TECHNICIAN');
  });

  it('only ever considers ACTIVE reports - a closed one is not even fetched', async () => {
    await pmService.alerts(pmPrincipal);
    expect(repo.alertCandidates).toHaveBeenCalledWith(PROJECT_ID, expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// decisions.md J7 - activity
// ---------------------------------------------------------------------------

describe('PM activity (decisions.md J7)', () => {
  it('maps real timeline events with their actor and report target', async () => {
    repo.timelineEvents.mockResolvedValue([
      {
        id: 'ev-1',
        type: 'TECHNICIAN_ASSIGNED',
        actorType: 'SYSTEM',
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
        actor: null,
        report: { id: 'report-1', reportNumber: 1042 },
      },
    ] as never);

    const activity = await pmService.activity(pmPrincipal);
    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).toMatchObject({
      type: 'TECHNICIAN_ASSIGNED',
      source: 'REPORT_TIMELINE',
      target: { type: 'report', id: 'report-1', label: '#1042' },
    });
  });

  it('includes technician lifecycle audit rows, merged in timestamp order', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);
    repo.timelineEvents.mockResolvedValue([
      {
        id: 'ev-1',
        type: 'REPORT_CREATED',
        actorType: 'HOMEOWNER',
        createdAt: new Date('2026-07-28T08:00:00.000Z'),
        actor: { id: 'u1', name: 'مالك' },
        report: { id: 'report-1', reportNumber: 1042 },
      },
    ] as never);
    repo.technicianAuditEvents.mockResolvedValue([
      {
        id: 'a-1',
        action: 'TECHNICIAN_TRANSFERRED',
        entityId: 'tech-1',
        timestamp: new Date('2026-07-28T09:00:00.000Z'),
        user: { id: 'u2', name: 'الشركة' },
      },
    ] as never);

    const activity = await pmService.activity(pmPrincipal);
    expect(activity.items.map((i) => i.type)).toEqual(['TECHNICIAN_TRANSFERRED', 'REPORT_CREATED']);
    expect(activity.items[0].target).toEqual({
      type: 'technician',
      id: 'tech-1',
      label: 'سعد القرني',
    });
  });

  it('DROPS an unrecognised audit action rather than rendering it raw', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);
    repo.technicianAuditEvents.mockResolvedValue([
      {
        id: 'a-1',
        action: 'SOME_FUTURE_ACTION_NOBODY_HAS_COPY_FOR',
        entityId: 'tech-1',
        timestamp: new Date(),
        user: null,
      },
    ] as never);

    expect((await pmService.activity(pmPrincipal)).items).toEqual([]);
  });

  it('fabricates nothing for a project with no history', async () => {
    const activity = await pmService.activity(pmPrincipal);
    expect(activity.items).toEqual([]);
    expect(activity.assigned).toBe(true);
  });

  it('bounds the feed', async () => {
    await pmService.activity(pmPrincipal, { limit: 500 });
    expect(repo.timelineEvents).toHaveBeenCalledWith(PROJECT_ID, 50);
  });
});

// ---------------------------------------------------------------------------
// decisions.md J8 - report list
// ---------------------------------------------------------------------------

describe('PM report list (decisions.md J8)', () => {
  it('delegates to the ONE canonical read model with the PM principal', async () => {
    const query = { page: 1, pageSize: 20, status: [ReportStatus.ROUTED] } as never;
    await pmService.reports(pmPrincipal, query);
    expect(reports.list).toHaveBeenCalledWith(query, pmPrincipal);
  });

  it('still 404s a foreign projectId before delegating', async () => {
    await expect(
      pmService.reports(pmPrincipal, { page: 1, pageSize: 20, projectId: OTHER_PROJECT_ID } as never),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_NOT_FOUND' });
    expect(reports.list).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// decisions.md J9/J10 - PM3
// ---------------------------------------------------------------------------

describe('PM3 contractor performance (decisions.md J9)', () => {
  it('computes per-technician figures from canonical project-scoped aggregates', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);
    repo.openReportCounts.mockResolvedValue(new Map([['tech-1', 3]]) as never);
    repo.completedRepairStats.mockResolvedValue(
      new Map([['tech-1', { completed: 7, averageDurationMinutes: 195 }]]) as never,
    );
    repo.reviewStats.mockResolvedValue(
      new Map([['tech-1', { averageRating: 4.8, reviewsCount: 5 }]]) as never,
    );
    repo.technicianIdsWithActiveRepair.mockResolvedValue(new Set(['tech-1']) as never);

    const result = await pmService.contractors(pmPrincipal);
    const card = result.items[0];

    expect(card.membership).toBe('CURRENT');
    expect(card.load).toBe('BUSY');
    expect(card.stats).toMatchObject({
      openReportsCount: 3,
      completedReportsCount: 7,
      averageRepairDurationMinutes: 195,
      averageRating: 4.8,
      reviewsCount: 5,
    });
    expect(result.kpis.totalTechnicians).toBe(1);
    expect(result.kpis.busy).toBe(1);
    expect(result.kpis.available).toBe(0);
  });

  it('returns honest nulls - never 0 - for a technician with no reviews or repairs', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);

    const result = await pmService.contractors(pmPrincipal);
    expect(result.items[0].stats.averageRating).toBeNull();
    expect(result.items[0].stats.averageRepairDurationMinutes).toBeNull();
    expect(result.items[0].stats.slaCompliancePercent).toBeNull();
    expect(result.items[0].stats.reviewsCount).toBe(0);
    expect(result.kpis.averageRating).toBeNull();
    expect(result.kpis.averageRepairDurationMinutes).toBeNull();
  });

  it('includes a transferred-out technician as HISTORICAL, excluded from roster KPIs', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);
    repo.historicalTechnicians.mockResolvedValue([
      technician({ id: 'tech-old', projectId: OTHER_PROJECT_ID, user: { id: 'u9', name: 'خالد', phone: '05', status: 'ACTIVE' } }),
    ] as never);
    repo.openReportCounts.mockResolvedValue(new Map([['tech-old', 0]]) as never);
    repo.completedRepairStats.mockResolvedValue(
      new Map([['tech-old', { completed: 4, averageDurationMinutes: 300 }]]) as never,
    );

    const result = await pmService.contractors(pmPrincipal);

    const historical = result.items.find((i) => i.technicianId === 'tech-old');
    expect(historical?.membership).toBe('HISTORICAL');
    // Their past work here is still theirs, and is NOT rewritten onto anyone else.
    expect(historical?.stats.completedReportsCount).toBe(4);

    // But they are not current capacity.
    expect(result.kpis.totalTechnicians).toBe(1);
    expect(result.kpis.historicalTechnicians).toBe(1);
  });

  it('never issues one query per technician', async () => {
    repo.rosterTechnicians.mockResolvedValue([
      technician({ id: 't1' }),
      technician({ id: 't2' }),
      technician({ id: 't3' }),
    ] as never);

    await pmService.contractors(pmPrincipal);

    // Four grouped aggregates for any number of technicians.
    expect(repo.openReportCounts).toHaveBeenCalledTimes(1);
    expect(repo.completedRepairStats).toHaveBeenCalledTimes(1);
    expect(repo.reviewStats).toHaveBeenCalledTimes(1);
    expect(repo.technicianIdsWithActiveRepair).toHaveBeenCalledTimes(1);
    expect(repo.openReportCounts).toHaveBeenCalledWith(PROJECT_ID, ['t1', 't2', 't3']);
  });

  it('scopes every per-technician aggregate to the PM project', async () => {
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);
    await pmService.contractors(pmPrincipal);
    for (const call of [
      repo.openReportCounts,
      repo.completedRepairStats,
      repo.reviewStats,
    ]) {
      expect(call).toHaveBeenCalledWith(PROJECT_ID, expect.any(Array));
    }
  });
});

describe('PM-safe technician profile (decisions.md J10)', () => {
  beforeEach(() => {
    repo.findTechnicianById.mockResolvedValue(technician() as never);
  });

  it('returns project-scoped performance and marks itself read-only', async () => {
    repo.openReportCounts.mockResolvedValue(new Map([['tech-1', 2]]) as never);

    const profile = await pmService.contractorPerformance(pmPrincipal, 'tech-1');
    expect(profile.readOnly).toBe(true);
    expect(profile.projectId).toBe(PROJECT_ID);
    expect(profile.stats.openReportsCount).toBe(2);
    expect(profile.membership).toBe('CURRENT');
  });

  it('omits every company-only field - no email, invitation, manager, or legacy block', async () => {
    const profile = (await pmService.contractorPerformance(pmPrincipal, 'tech-1')) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      'email',
      'invitation',
      'invitationPreview',
      'managerName',
      'legacy',
      'assignedRepairsCount',
      'createdAt',
    ]) {
      expect(profile).not.toHaveProperty(forbidden);
    }
  });

  it('carries no permission or action affordance at all', async () => {
    const profile = (await pmService.contractorPerformance(pmPrincipal, 'tech-1')) as unknown as Record<
      string,
      unknown
    >;
    expect(profile).not.toHaveProperty('permissions');
    expect(JSON.stringify(profile)).not.toMatch(/canTransfer|canDeactivate|canEdit|canResend/);
  });

  it('reaches a HISTORICAL technician through their real work in this project', async () => {
    repo.findTechnicianById.mockResolvedValue(technician({ projectId: OTHER_PROJECT_ID }) as never);
    repo.countReportsForTechnician.mockResolvedValue(3 as never);

    const profile = await pmService.contractorPerformance(pmPrincipal, 'tech-1');
    expect(profile.membership).toBe('HISTORICAL');
  });
});

// ---------------------------------------------------------------------------
// decisions.md J13 - Copilot behaviour through deterministic providers
// ---------------------------------------------------------------------------

function fakeCopilot(over: Partial<PmCopilotProvider> = {}): PmCopilotProvider {
  return {
    name: 'fake',
    isConfigured: () => true,
    summarize: jest.fn(async () => ({ headline: 'ملخص', highlights: [], references: [] })),
    chat: jest.fn(async () => ({ reply: 'رد', references: [] })),
    ...over,
  } as PmCopilotProvider;
}

function fakeInsight(over: Partial<PmInsightProvider> = {}): PmInsightProvider {
  return {
    name: 'fake',
    isConfigured: () => true,
    explain: jest.fn(async () => ({ insight: 'أداء مستقر' })),
    ...over,
  } as PmInsightProvider;
}

describe('Copilot availability (decisions.md J13)', () => {
  it('returns an honest NOT_CONFIGURED state, with NO reply text, when no provider is configured', async () => {
    const result = (await pmService.copilotSummary(
      pmPrincipal,
      fakeCopilot({ isConfigured: () => false }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('NOT_CONFIGURED');
    // No canned text disguised as AI - the payload has no answer at all.
    expect(result).not.toHaveProperty('headline');
    expect(result).not.toHaveProperty('highlights');
  });

  it('returns PROVIDER_ERROR - not a fabricated answer - when the model call fails', async () => {
    const result = (await pmService.copilotChat(
      pmPrincipal,
      { message: 'ما الوضع؟' },
      fakeCopilot({
        chat: jest.fn(async () => {
          throw new Error('timeout');
        }),
      }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('PROVIDER_ERROR');
    expect(result).not.toHaveProperty('reply');
  });

  it('returns a grounded summary with validated references on success', async () => {
    reports.list.mockResolvedValue({
      items: [
        {
          id: 'report-1',
          reportNumber: 1042,
          status: 'ROUTED',
          priority: 'HIGH',
          category: 'PLUMBING',
          problemText: 'تسريب',
          createdAt: new Date().toISOString(),
          sla: { state: 'ON_TIME' },
          technician: { name: 'سعد' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);
    repo.rosterTechnicians.mockResolvedValue([technician()] as never);

    const provider = fakeCopilot({
      summarize: jest.fn(async () => ({
        headline: 'المشروع مستقر',
        highlights: ['بلاغ واحد عالي الأولوية'],
        references: [
          { type: 'report' as const, id: 'report-1' },
          { type: 'technician' as const, id: 'tech-1' },
        ],
      })),
    });

    const result = (await pmService.copilotSummary(pmPrincipal, provider)) as Record<string, unknown>;
    expect(result.available).toBe(true);
    expect(result.headline).toBe('المشروع مستقر');
    expect(result.references).toEqual([
      { type: 'report', id: 'report-1', navigation: 'REPORT_DETAIL' },
      { type: 'technician', id: 'tech-1', navigation: 'TECHNICIAN_PROFILE' },
    ]);
    expect(result.droppedReferenceCount).toBe(0);
  });

  it('DROPS hallucinated and foreign references from a real answer', async () => {
    const provider = fakeCopilot({
      chat: jest.fn(async () => ({
        reply: 'راجع البلاغات التالية',
        references: [
          { type: 'report' as const, id: 'report-from-another-company' },
          { type: 'technician' as const, id: 'made-up-technician' },
        ],
      })),
    });

    const result = (await pmService.copilotChat(
      pmPrincipal,
      { message: 'ما أهم البلاغات؟' },
      provider,
    )) as Record<string, unknown>;

    expect(result.available).toBe(true);
    expect(result.reply).toBe('راجع البلاغات التالية');
    expect(result.references).toEqual([]);
    expect(result.droppedReferenceCount).toBe(2);
  });

  it('never gives the provider anything the PM was not already authorized to see', async () => {
    const summarize = jest.fn(async (_s: PmCopilotSnapshot) => ({
      headline: 'ملخص',
      highlights: [] as string[],
      references: [],
    }));
    await pmService.copilotSummary(pmPrincipal, fakeCopilot({ summarize }));

    const snapshot = summarize.mock.calls[0][0] as PmCopilotSnapshot;
    // Every read that built it was scoped to the PM's own project.
    expect(repo.statusCounts).toHaveBeenCalledWith(PROJECT_ID);
    expect(reports.list).toHaveBeenCalledWith(expect.any(Object), pmPrincipal);
    // And it carries no comparison data, so no trend can be claimed (J13).
    expect(snapshot.previousPeriodKpis).toBeNull();
  });

  it('strips resident contact data out of the snapshot entirely', async () => {
    reports.list.mockResolvedValue({
      items: [
        {
          id: 'report-1',
          reportNumber: 1042,
          status: 'ROUTED',
          priority: 'HIGH',
          category: 'PLUMBING',
          problemText: 'تسريب',
          createdAt: new Date().toISOString(),
          sla: { state: 'ON_TIME' },
          technician: { name: 'سعد' },
          // Present on the DTO; must NOT reach a prompt.
          homeowner: { id: 'ho-1', name: 'محمد', phone: '0500000000', email: 'a@b.c' },
          location: { unitNumber: 'A-214', buildingName: 'مبنى A' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);

    const summarize = jest.fn(async (_s: PmCopilotSnapshot) => ({
      headline: 'ملخص',
      highlights: [] as string[],
      references: [],
    }));
    await pmService.copilotSummary(pmPrincipal, fakeCopilot({ summarize }));

    const serialized = JSON.stringify(summarize.mock.calls[0][0]);
    expect(serialized).not.toContain('0500000000');
    expect(serialized).not.toContain('a@b.c');
    expect(serialized).not.toContain('ho-1');
    expect(serialized).not.toContain('A-214');
  });

  it('gives an unassigned manager an honest INSUFFICIENT_DATA state and calls no model', async () => {
    managers.findByUserId.mockResolvedValue({ projectId: null } as never);
    const summarize = jest.fn();

    const result = (await pmService.copilotSummary(
      pmPrincipal,
      fakeCopilot({ summarize: summarize as never }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('INSUFFICIENT_DATA');
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe('technician AI insight (decisions.md J13)', () => {
  beforeEach(() => {
    repo.findTechnicianById.mockResolvedValue(technician() as never);
  });

  it('returns INSUFFICIENT_DATA - not a padded sentence - with no completed work and no reviews', async () => {
    const explain = jest.fn();
    const result = (await pmService.contractorInsight(
      pmPrincipal,
      'tech-1',
      fakeInsight({ explain: explain as never }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('INSUFFICIENT_DATA');
    expect(result).not.toHaveProperty('insight');
    expect(explain).not.toHaveBeenCalled();
  });

  it('returns a real insight once there is genuine measured performance', async () => {
    repo.completedRepairStats.mockResolvedValue(
      new Map([['tech-1', { completed: 6, averageDurationMinutes: 180 }]]) as never,
    );
    repo.reviewStats.mockResolvedValue(
      new Map([['tech-1', { averageRating: 4.5, reviewsCount: 4 }]]) as never,
    );

    const explain = jest.fn(async (_s: unknown) => ({ insight: 'أنهى 6 بلاغات بمتوسط تقييم 4.5.' }));
    const result = (await pmService.contractorInsight(
      pmPrincipal,
      'tech-1',
      fakeInsight({ explain: explain as never }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(true);
    expect(result.insight).toBe('أنهى 6 بلاغات بمتوسط تقييم 4.5.');

    // It is handed measurements plus project averages - never free text about
    // the person, and never a time series it could read a trend into.
    const snapshot = explain.mock.calls[0][0] as Record<string, unknown>;
    expect(snapshot).toMatchObject({ completedReportsCount: 6, averageRating: 4.5 });
    expect(snapshot).toHaveProperty('projectAverages');
  });

  it('reports NOT_CONFIGURED honestly when no provider is configured', async () => {
    repo.completedRepairStats.mockResolvedValue(
      new Map([['tech-1', { completed: 2, averageDurationMinutes: 60 }]]) as never,
    );

    const result = (await pmService.contractorInsight(
      pmPrincipal,
      'tech-1',
      fakeInsight({ isConfigured: () => false }),
    )) as Record<string, unknown>;

    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBe('NOT_CONFIGURED');
  });

  it('404s before any AI work for a technician outside the PM scope', async () => {
    repo.findTechnicianById.mockResolvedValue(technician({ projectId: OTHER_PROJECT_ID }) as never);
    repo.countReportsForTechnician.mockResolvedValue(0 as never);

    await expect(pmService.contractorInsight(pmPrincipal, 'tech-1', fakeInsight())).rejects.toMatchObject(
      { errorCode: 'TECHNICIAN_NOT_FOUND' },
    );
  });
});
