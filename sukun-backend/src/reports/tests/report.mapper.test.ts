import {
  ReportCategory,
  ReportMediaStage,
  ReportOrigin,
  ReportPriority,
  ReportPrioritySource,
  ReportRepairStatus,
  ReportRoutingState,
  ReportStatus,
  ReportWarrantyVerdict,
} from '@prisma/client';
import { ReportWithRelations } from '../report.repository';
import { ReportViewer, statusGroupOf, toReportDetailDto, toReportSummaryDto } from '../report.mapper';

const NOW = new Date('2026-07-01T06:00:00.000Z');
const CREATED = new Date('2026-07-01T00:00:00.000Z');

function report(overrides: Partial<ReportWithRelations> = {}): ReportWithRelations {
  return {
    id: 'report-1',
    reportNumber: 1042,
    homeownerId: 'owner-user-1',
    ownershipId: 'ownership-1',
    unitId: 'unit-1',
    buildingId: 'building-1',
    projectId: 'project-1',
    category: ReportCategory.PLUMBING,
    categoryConfirmedByUser: true,
    problemText: 'تسريب أسفل المغسلة',
    homeownerNote: 'بدأت منذ يومين',
    analysisId: null,
    aiSuggestedCategory: null,
    aiConfidence: null,
    aiProblemText: null,
    aiExplanation: null,
    aiProvider: null,
    aiModel: null,
    priority: ReportPriority.HIGH,
    prioritySource: ReportPrioritySource.AI,
    warrantyVerdict: ReportWarrantyVerdict.COVERED,
    warrantyReasonCode: 'COVERED',
    warrantyCategoryKey: 'PLUMBING',
    warrantyRulesVersion: '2026-07-28.1',
    warrantyEvaluatedAt: CREATED,
    warrantyPeriodStart: CREATED,
    warrantyPeriodEnd: new Date('2028-01-01T00:00:00.000Z'),
    status: ReportStatus.ROUTED,
    routingState: ReportRoutingState.ROUTED,
    routingReasonCode: 'SPECIALTY_MATCH',
    routingAttemptCount: 1,
    lastRoutingAttemptAt: CREATED,
    assignedTechnicianId: 'tech-1',
    originalTechnicianId: 'tech-1',
    assignedAt: CREATED,
    slaStartDueAt: new Date('2026-07-01T04:00:00.000Z'),
    slaRulesVersion: '2026-07-28.1',
    reopenCount: 0,
    origin: ReportOrigin.HOMEOWNER,
    legacyWarrantyReportId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    closedAt: null,
    homeowner: {
      id: 'owner-user-1',
      name: 'محمد العتيبي',
      email: 'owner@example.com',
      phone: '0500000001',
      status: 'ACTIVE',
    },
    unit: { id: 'unit-1', number: 'A-214', floor: 2, type: 'Apartment' },
    building: { id: 'building-1', name: 'مبنى A', number: 'A' },
    project: {
      id: 'project-1',
      name: 'تلال الرياض',
      city: 'الرياض',
      district: 'حي النرجس',
      companyId: 'company-1',
    },
    assignedTechnician: {
      id: 'tech-1',
      projectId: 'project-1',
      userId: 'tech-user-1',
      status: 'AVAILABLE',
      specialty: 'سباكة',
      lastAssignedAt: CREATED,
      createdAt: CREATED,
      updatedAt: CREATED,
      user: {
        id: 'tech-user-1',
        name: 'سعد القرني',
        email: 'tech@example.com',
        phone: '0500000002',
        status: 'ACTIVE',
      },
    },
    media: [],
    repair: null,
    review: null,
    ...overrides,
  } as unknown as ReportWithRelations;
}

const homeownerViewer: ReportViewer = { scope: 'HOMEOWNER', userId: 'owner-user-1' };
const assignedTechViewer: ReportViewer = {
  scope: 'TECHNICIAN',
  userId: 'tech-user-1',
  technicianId: 'tech-1',
};
const otherTechViewer: ReportViewer = {
  scope: 'TECHNICIAN',
  userId: 'tech-user-2',
  technicianId: 'tech-2',
};
const pmViewer: ReportViewer = { scope: 'PM', userId: 'pm-user-1' };
const companyViewer: ReportViewer = { scope: 'COMPANY', userId: 'company-user-1' };

describe('statusGroupOf - H9\'s four filter chips (decisions.md I2)', () => {
  it('groups both pre-start statuses as OPEN', () => {
    expect(statusGroupOf(ReportStatus.ROUTING_PENDING)).toBe('OPEN');
    expect(statusGroupOf(ReportStatus.ROUTED)).toBe('OPEN');
  });

  it('maps the remaining statuses one-to-one', () => {
    expect(statusGroupOf(ReportStatus.IN_PROGRESS)).toBe('IN_PROGRESS');
    expect(statusGroupOf(ReportStatus.AWAITING_OWNER_APPROVAL)).toBe('AWAITING_APPROVAL');
    expect(statusGroupOf(ReportStatus.CLOSED)).toBe('CLOSED');
  });
});

describe('contact-data policy per viewer (decisions.md I12)', () => {
  it('gives the homeowner their own contact details', () => {
    const dto = toReportSummaryDto(report(), homeownerViewer, NOW);
    expect(dto.homeowner.phone).toBe('0500000001');
    expect(dto.homeowner.email).toBe('owner@example.com');
  });

  it('gives the ASSIGNED technician the resident\'s name and phone (they must reach them)', () => {
    const dto = toReportSummaryDto(report(), assignedTechViewer, NOW);
    expect(dto.homeowner.name).toBe('محمد العتيبي');
    expect(dto.homeowner.phone).toBe('0500000001');
    // Email is never needed to perform a repair.
    expect(dto.homeowner.email).toBeNull();
  });

  it('gives a NON-assigned technician no resident contact data at all', () => {
    const dto = toReportSummaryDto(report(), otherTechViewer, NOW);
    expect(dto.homeowner.phone).toBeNull();
    expect(dto.homeowner.email).toBeNull();
  });

  it('gives PM and Company the resident\'s NAME only - supervision needs no phone number', () => {
    for (const viewer of [pmViewer, companyViewer]) {
      const dto = toReportSummaryDto(report(), viewer, NOW);
      expect(dto.homeowner.name).toBe('محمد العتيبي');
      expect(dto.homeowner.phone).toBeNull();
      expect(dto.homeowner.email).toBeNull();
    }
  });

  it('never gives the homeowner the technician\'s direct phone number', () => {
    const dto = toReportSummaryDto(report(), homeownerViewer, NOW);
    expect(dto.technician?.name).toBe('سعد القرني');
    expect(dto.technician?.phone).toBeNull();
  });

  it('gives supervisors the technician\'s phone', () => {
    expect(toReportSummaryDto(report(), pmViewer, NOW).technician?.phone).toBe('0500000002');
    expect(toReportSummaryDto(report(), companyViewer, NOW).technician?.phone).toBe('0500000002');
  });

  it('returns a null technician before routing succeeds', () => {
    const dto = toReportSummaryDto(
      report({ assignedTechnician: null, assignedTechnicianId: null }),
      pmViewer,
      NOW,
    );
    expect(dto.technician).toBeNull();
  });
});

describe('permissions mirror what the endpoints actually enforce (decisions.md I12)', () => {
  it('lets the assigned technician start a ROUTED report and nobody else', () => {
    const r = report({ status: ReportStatus.ROUTED, repair: null });
    expect(toReportSummaryDto(r, assignedTechViewer, NOW).permissions.canStart).toBe(true);
    expect(toReportSummaryDto(r, otherTechViewer, NOW).permissions.canStart).toBe(false);
    expect(toReportSummaryDto(r, homeownerViewer, NOW).permissions.canStart).toBe(false);
    expect(toReportSummaryDto(r, pmViewer, NOW).permissions.canStart).toBe(false);
    expect(toReportSummaryDto(r, companyViewer, NOW).permissions.canStart).toBe(false);
  });

  it('lets the assigned technician submit only while their repair is genuinely in progress', () => {
    const inProgress = report({
      status: ReportStatus.IN_PROGRESS,
      repair: { id: 'r1', status: ReportRepairStatus.IN_PROGRESS, startedAt: CREATED } as never,
    });
    expect(toReportSummaryDto(inProgress, assignedTechViewer, NOW).permissions.canSubmitRepair).toBe(true);

    const reopened = report({
      status: ReportStatus.IN_PROGRESS,
      repair: { id: 'r1', status: ReportRepairStatus.REOPENED, startedAt: CREATED } as never,
    });
    // A reopened repair must be re-started (re-acquiring the lock) before it
    // can be submitted again.
    expect(toReportSummaryDto(reopened, assignedTechViewer, NOW).permissions.canSubmitRepair).toBe(false);
    expect(toReportSummaryDto(reopened, assignedTechViewer, NOW).permissions.canStart).toBe(true);
  });

  it('lets only the report\'s own homeowner approve or reopen, and only while awaiting approval', () => {
    const awaiting = report({
      status: ReportStatus.AWAITING_OWNER_APPROVAL,
      repair: { id: 'r1', status: ReportRepairStatus.SUBMITTED, startedAt: CREATED } as never,
    });
    const own = toReportSummaryDto(awaiting, homeownerViewer, NOW).permissions;
    expect(own.canApprove).toBe(true);
    expect(own.canReopen).toBe(true);

    const other = toReportSummaryDto(awaiting, { scope: 'HOMEOWNER', userId: 'someone-else' }, NOW)
      .permissions;
    expect(other.canApprove).toBe(false);
    expect(other.canReopen).toBe(false);

    const routed = toReportSummaryDto(report(), homeownerViewer, NOW).permissions;
    expect(routed.canApprove).toBe(false);
  });

  it('gives PM and Company no mutating permission in ANY state (invariants 12/13)', () => {
    const states = [
      ReportStatus.ROUTING_PENDING,
      ReportStatus.ROUTED,
      ReportStatus.IN_PROGRESS,
      ReportStatus.AWAITING_OWNER_APPROVAL,
      ReportStatus.CLOSED,
    ];
    for (const status of states) {
      for (const viewer of [pmViewer, companyViewer]) {
        expect(toReportSummaryDto(report({ status }), viewer, NOW).permissions).toEqual({
          canStart: false,
          canSubmitRepair: false,
          canApprove: false,
          canReopen: false,
        });
      }
    }
  });
});

describe('intervention flag and SLA (PM2, decisions.md I10)', () => {
  it('flags an SLA breach', () => {
    const dto = toReportSummaryDto(report(), pmViewer, NOW); // due 04:00, now 06:00, not started
    expect(dto.sla.state).toBe('BREACHED');
    expect(dto.interventionNeeded).toBe(true);
    expect(dto.interventionReasonCode).toBe('SLA_BREACHED');
  });

  it('flags a reopened report', () => {
    const dto = toReportSummaryDto(
      report({
        status: ReportStatus.IN_PROGRESS,
        reopenCount: 1,
        slaStartDueAt: null,
        repair: { id: 'r1', status: ReportRepairStatus.REOPENED, startedAt: CREATED } as never,
      }),
      pmViewer,
      NOW,
    );
    expect(dto.interventionNeeded).toBe(true);
    expect(dto.interventionReasonCode).toBe('REOPENED_BY_HOMEOWNER');
  });

  it('flags a report nobody could be routed to', () => {
    const dto = toReportSummaryDto(
      report({
        status: ReportStatus.ROUTING_PENDING,
        slaStartDueAt: null,
        assignedTechnician: null,
        assignedTechnicianId: null,
        routingState: ReportRoutingState.PENDING,
        routingReasonCode: 'NO_ELIGIBLE_TECHNICIAN',
      }),
      pmViewer,
      NOW,
    );
    expect(dto.interventionNeeded).toBe(true);
    expect(dto.interventionReasonCode).toBe('ROUTING_PENDING');
    expect(dto.routing.reasonCode).toBe('NO_ELIGIBLE_TECHNICIAN');
  });

  it('never flags a closed report', () => {
    const dto = toReportSummaryDto(
      report({ status: ReportStatus.CLOSED, reopenCount: 2, closedAt: NOW }),
      pmViewer,
      NOW,
    );
    expect(dto.interventionNeeded).toBe(false);
    expect(dto.interventionReasonCode).toBeNull();
  });

  it('renders NOT_CONFIGURED, not a fabricated chip, for a priority with no SLA target', () => {
    const dto = toReportSummaryDto(
      report({ priority: ReportPriority.LOW, slaStartDueAt: null }),
      pmViewer,
      NOW,
    );
    expect(dto.sla.state).toBe('NOT_CONFIGURED');
    expect(dto.sla.dueAt).toBeNull();
  });
});

describe('AI record projection (decisions.md I6)', () => {
  it('is null on the manual-entry path - never a plausible-looking fabricated confidence', () => {
    const dto = toReportSummaryDto(
      report({ prioritySource: ReportPrioritySource.MANUAL_DEFAULT }),
      pmViewer,
      NOW,
    );
    expect(dto.ai).toBeNull();
    expect(dto.prioritySource).toBe('MANUAL_DEFAULT');
  });

  it('exposes the recorded classification when an analysis was genuinely used', () => {
    const dto = toReportSummaryDto(
      report({
        aiProvider: 'openai',
        aiModel: 'gpt-4o-mini',
        aiSuggestedCategory: ReportCategory.ELECTRICAL,
        aiConfidence: 87,
        aiProblemText: 'عطل في مفتاح الإنارة',
        aiExplanation: 'يظهر تفحّم حول المفتاح',
      }),
      pmViewer,
      NOW,
    );
    expect(dto.ai).toEqual({
      suggestedCategory: 'ELECTRICAL',
      confidence: 87,
      problemText: 'عطل في مفتاح الإنارة',
      explanation: 'يظهر تفحّم حول المفتاح',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    // The user-confirmed category is what the report is filed under, and it can
    // legitimately differ from the AI's suggestion.
    expect(dto.category).toBe('PLUMBING');
  });
});

describe('warranty snapshot projection (decisions.md I4)', () => {
  it('reports the stored snapshot verbatim, never a re-derived verdict', () => {
    const dto = toReportSummaryDto(report(), homeownerViewer, NOW);
    expect(dto.warranty).toEqual({
      verdict: 'COVERED',
      reasonCode: 'COVERED',
      categoryKey: 'PLUMBING',
      rulesVersion: '2026-07-28.1',
      evaluatedAt: CREATED,
      periodStart: CREATED,
      periodEnd: new Date('2028-01-01T00:00:00.000Z'),
    });
  });
});

describe('media projection', () => {
  it('counts photos per stage and lists them only on the detail DTO', () => {
    const media = [
      { id: 'm1', stage: ReportMediaStage.HOMEOWNER, url: '/a', mimeType: 'image/png', sortOrder: 0, createdAt: CREATED },
      { id: 'm2', stage: ReportMediaStage.HOMEOWNER, url: '/b', mimeType: 'image/png', sortOrder: 1, createdAt: CREATED },
      { id: 'm3', stage: ReportMediaStage.BEFORE, url: '/c', mimeType: 'image/png', sortOrder: 0, createdAt: CREATED },
      { id: 'm4', stage: ReportMediaStage.AFTER, url: '/d', mimeType: 'image/png', sortOrder: 0, createdAt: CREATED },
    ] as never;

    const summary = toReportSummaryDto(report({ media }), homeownerViewer, NOW);
    expect(summary.photoCounts).toEqual({ homeowner: 2, before: 1, after: 1 });
    expect(summary).not.toHaveProperty('media');

    const detail = toReportDetailDto(report({ media }), homeownerViewer, NOW);
    expect(detail.media).toHaveLength(4);
    expect(detail.media[0]).toEqual({
      id: 'm1',
      stage: 'HOMEOWNER',
      url: '/a',
      mimeType: 'image/png',
      sortOrder: 0,
      createdAt: CREATED,
    });
  });

  it('never leaks a storage key - only the resolved URL', () => {
    const media = [
      {
        id: 'm1',
        stage: ReportMediaStage.HOMEOWNER,
        storageKey: 'reports/staging/owner-user-1/secret.png',
        url: '/files/report-media/x.png',
        mimeType: 'image/png',
        sortOrder: 0,
        createdAt: CREATED,
      },
    ] as never;
    const detail = toReportDetailDto(report({ media }), pmViewer, NOW);
    expect(detail.media[0]).not.toHaveProperty('storageKey');
  });
});
