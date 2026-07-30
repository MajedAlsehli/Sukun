import {
  ReportCategory,
  ReportPriority,
  ReportRepairStatus,
  ReportStatus,
  ReportWarrantyVerdict,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { reportService, ActiveRepairExistsError, resolveViewer } from '../report.service';
import { reportRepository } from '../report.repository';
import { technicianRepository } from '../../technicians/technician.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { warrantyRepository } from '../../warranty/warranty.repository';
import { reportMediaStorage } from '../report-media-storage';
import { reportAnalysisProvider } from '../providers/report-analysis.provider';
import { objectDetectionProvider } from '../providers/object-detection.provider';
import { routeReport, reportRoutingService } from '../report.routing';
import { env } from '../../config/env';
import { UserRole } from '../../shared/roles';

jest.mock('../../config/prisma', () => {
  const client: Record<string, unknown> = {
    user: { findUnique: jest.fn() },
    ownership: { findFirst: jest.fn() },
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    reportAnalysis: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    technician: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    // Every service mutation runs inside one transaction (invariant 14) - the
    // mock hands the same client to the callback so the assertions below see
    // exactly the writes the real transaction would perform.
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(client)),
  };
  return { prisma: client };
});

jest.mock('../report.repository');
jest.mock('../../technicians/technician.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../warranty/warranty.repository');
jest.mock('../report-media-storage', () => {
  const actual = jest.requireActual('../report-media-storage');
  return {
    ...actual,
    reportMediaStorage: {
      driver: 'test',
      isConfigured: jest.fn().mockReturnValue(true),
      upload: jest.fn(),
      getDataUri: jest.fn(),
      // The adapter owns URL construction - the service must never rebuild it.
      publicUrl: jest.fn((key: string) => `http://localhost:4000/files/report-media/${key}`),
    },
  };
});
jest.mock('../providers/report-analysis.provider', () => ({
  reportAnalysisProvider: { name: 'openai', isConfigured: jest.fn(), analyze: jest.fn() },
}));
jest.mock('../providers/object-detection.provider', () => ({
  objectDetectionProvider: { name: 'yolov11', isConfigured: jest.fn(), detect: jest.fn() },
}));
jest.mock('../report.routing', () => ({
  routeReport: jest.fn(),
  reportRoutingService: { scheduleRetry: jest.fn(), retryPending: jest.fn() },
  notifyRoutingPending: jest.fn(),
}));
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  ownership: { findFirst: jest.Mock };
  report: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    groupBy: jest.Mock;
    count: jest.Mock;
  };
  reportAnalysis: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  technician: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockedRepo = reportRepository as jest.Mocked<typeof reportRepository>;
const mockedTechnicians = technicianRepository as jest.Mocked<typeof technicianRepository>;
const mockedPMs = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const mockedWarranty = warrantyRepository as jest.Mocked<typeof warrantyRepository>;
const mockedStorage = reportMediaStorage as unknown as {
  upload: jest.Mock;
  getDataUri: jest.Mock;
  isConfigured: jest.Mock;
  publicUrl: jest.Mock;
};
const mockedAnalysis = reportAnalysisProvider as unknown as {
  isConfigured: jest.Mock;
  analyze: jest.Mock;
};
const mockedDetection = objectDetectionProvider as unknown as {
  detect: jest.Mock;
  isConfigured: jest.Mock;
};
const mockedRouteReport = routeReport as jest.MockedFunction<typeof routeReport>;

const HOMEOWNER = { id: 'owner-user-1', role: UserRole.HOMEOWNER, companyId: null };
const TECHNICIAN = { id: 'tech-user-1', role: UserRole.TECHNICIAN, companyId: null };
const PM = { id: 'pm-user-1', role: UserRole.PROJECT_MANAGER, companyId: null };
const COMPANY = { id: 'company-user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const HOME_SEEKER = { id: 'seeker-1', role: UserRole.HOME_SEEKER, companyId: null };

const CTX = { ipAddress: null };
const STAGED_KEY = 'reports/staging/owner-user-1/photo-1.jpg';

const ownership = {
  id: 'ownership-1',
  unitId: 'unit-1',
  userId: 'owner-user-1',
  status: 'ACTIVE',
  unit: { id: 'unit-1', buildingId: 'building-1', building: { id: 'building-1', projectId: 'project-1' } },
};

function fullReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    reportNumber: 1042,
    homeownerId: 'owner-user-1',
    projectId: 'project-1',
    status: ReportStatus.ROUTED,
    assignedTechnicianId: 'tech-1',
    reopenCount: 0,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    closedAt: null,
    slaStartDueAt: null,
    slaRulesVersion: '2026-07-28.1',
    priority: ReportPriority.MEDIUM,
    prioritySource: 'AI',
    category: ReportCategory.PLUMBING,
    categoryConfirmedByUser: true,
    problemText: 'تسريب',
    homeownerNote: null,
    warrantyVerdict: ReportWarrantyVerdict.COVERED,
    warrantyReasonCode: 'COVERED',
    warrantyCategoryKey: 'PLUMBING',
    warrantyRulesVersion: '2026-07-28.1',
    warrantyEvaluatedAt: new Date('2026-07-01T00:00:00.000Z'),
    warrantyPeriodStart: null,
    warrantyPeriodEnd: null,
    routingState: 'ROUTED',
    routingReasonCode: 'SPECIALTY_MATCH',
    routingAttemptCount: 1,
    lastRoutingAttemptAt: null,
    aiProvider: null,
    aiModel: null,
    aiConfidence: null,
    aiSuggestedCategory: null,
    aiProblemText: null,
    aiExplanation: null,
    homeowner: { id: 'owner-user-1', name: 'مالك', email: 'o@e.com', phone: '05', status: 'ACTIVE' },
    unit: { id: 'unit-1', number: 'A-1', floor: 1, type: 'Apartment' },
    building: { id: 'building-1', name: 'A', number: 'A' },
    project: { id: 'project-1', name: 'P', city: 'Riyadh', district: null, companyId: 'company-1' },
    assignedTechnician: {
      id: 'tech-1',
      specialty: 'سباكة',
      user: { id: 'tech-user-1', name: 'فني', email: 't@e.com', phone: '05', status: 'ACTIVE' },
    },
    media: [],
    repair: null,
    review: null,
    ...overrides,
  };
}

beforeEach(() => {
  db.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
  db.ownership.findFirst.mockResolvedValue(ownership);
  db.report.create.mockResolvedValue({ id: 'report-1' });
  db.report.findFirst.mockResolvedValue({ id: 'report-1' });
  db.report.update.mockResolvedValue({});
  db.report.groupBy.mockResolvedValue([]);
  db.technician.findUnique.mockResolvedValue({ userId: 'tech-user-1' });
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  mockedWarranty.findByUnitId.mockResolvedValue({
    startDate: new Date('2026-01-01T00:00:00.000Z'),
  } as never);
  mockedRepo.findById.mockResolvedValue(fullReport() as never);
  mockedRepo.createMedia.mockResolvedValue({ count: 1 } as never);
  mockedRepo.appendTimelineEvent.mockResolvedValue({} as never);
  mockedRepo.findActiveRepairByTechnician.mockResolvedValue(null as never);
  mockedRepo.createRepair.mockResolvedValue({ id: 'repair-1' } as never);
  mockedRepo.updateRepair.mockResolvedValue({} as never);
  mockedRepo.createReview.mockResolvedValue({} as never);
  mockedRepo.maxMediaSortOrder.mockResolvedValue({ _max: { sortOrder: null } } as never);
  mockedRepo.list.mockResolvedValue({ items: [], total: 0 } as never);
  mockedRepo.buildWhere.mockImplementation(
    jest.requireActual('../report.repository').reportRepository.buildWhere,
  );
  mockedTechnicians.findByUserId.mockResolvedValue({ id: 'tech-1', projectId: 'project-1' } as never);
  mockedPMs.findByUserId.mockResolvedValue({ id: 'pm-1', projectId: 'project-1' } as never);
  mockedRouteReport.mockResolvedValue({
    assigned: true,
    technicianId: 'tech-1',
    reasonCode: 'SPECIALTY_MATCH',
  });
  mockedStorage.upload.mockResolvedValue({ key: 'k', url: '/files/report-media/k' });
  mockedStorage.getDataUri.mockResolvedValue('data:image/jpeg;base64,AAAA');
  mockedStorage.isConfigured.mockReturnValue(true);
  mockedStorage.publicUrl.mockImplementation(
    (key: string) => `http://localhost:4000/files/report-media/${key}`,
  );
  mockedAnalysis.isConfigured.mockReturnValue(true);
  mockedDetection.detect.mockResolvedValue(null);
  // YOLO is genuinely unconfigured in this environment (decisions.md I7).
  mockedDetection.isConfigured.mockReturnValue(false);
});

// ---------------------------------------------------------------------------

describe('resolveViewer - role scoping is built from the principal alone (decisions.md I12)', () => {
  it('scopes a homeowner to their own reports', async () => {
    const { viewer, scope } = await resolveViewer(HOMEOWNER);
    expect(viewer.scope).toBe('HOMEOWNER');
    expect(scope).toEqual({ homeownerId: 'owner-user-1' });
  });

  it('scopes a technician to their assigned reports, via their own Technician row', async () => {
    const { viewer, scope } = await resolveViewer(TECHNICIAN);
    expect(viewer.technicianId).toBe('tech-1');
    expect(scope).toEqual({ assignedTechnicianId: 'tech-1' });
  });

  it('scopes a PM to the one project they manage', async () => {
    const { scope } = await resolveViewer(PM);
    expect(scope).toEqual({ projectId: 'project-1' });
  });

  it('gives an unassigned PM an empty scope rather than an error or a wide one', async () => {
    mockedPMs.findByUserId.mockResolvedValue({ id: 'pm-1', projectId: null } as never);
    const { scope } = await resolveViewer(PM);
    expect(scope).toEqual({ id: '__none__' });
  });

  it('scopes a company to its own company', async () => {
    const { scope } = await resolveViewer(COMPANY);
    expect(scope).toEqual({ project: { companyId: 'company-1' } });
  });

  it('refuses a HOME_SEEKER entirely - the canonical domain is post-ownership', async () => {
    await expect(resolveViewer(HOME_SEEKER)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('refuses a technician with no Technician row and a company user with no company', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(null as never);
    await expect(resolveViewer(TECHNICIAN)).rejects.toMatchObject({ httpStatus: 403 });
    await expect(
      resolveViewer({ id: 'x', role: UserRole.COMPANY, companyId: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('list - client filters can never widen the role scope (decisions.md I12)', () => {
  it('intersects a client projectId with the homeowner scope instead of replacing it', async () => {
    await reportService.list(
      { projectId: 'someone-elses-project', page: 1, pageSize: 20 } as never,
      HOMEOWNER,
    );

    const [scope, filters] = mockedRepo.list.mock.calls[0];
    expect(scope).toEqual({ homeownerId: 'owner-user-1' });
    expect(filters.projectId).toBe('someone-elses-project');

    // The composed WHERE keeps BOTH - so the foreign project simply yields nothing.
    const where = jest
      .requireActual('../report.repository')
      .reportRepository.buildWhere(scope, filters);
    expect(where.AND[0]).toEqual({ homeownerId: 'owner-user-1' });
  });

  it('cannot be made to read another homeowner by passing homeownerId', async () => {
    await reportService.list({ homeownerId: 'other-owner', page: 1, pageSize: 20 } as never, HOMEOWNER);
    const [scope] = mockedRepo.list.mock.calls[0];
    expect(scope).toEqual({ homeownerId: 'owner-user-1' });
  });

  it('supports report-number search with or without a leading #', () => {
    const { reportRepository: real } = jest.requireActual('../report.repository');
    const withHash = real.buildWhere({}, { search: '#1042' });
    const without = real.buildWhere({}, { search: '1042' });
    expect(JSON.stringify(withHash)).toContain('1042');
    expect(JSON.stringify(without)).toContain('1042');

    // A non-numeric query must not produce a bogus reportNumber predicate.
    const text = real.buildWhere({}, { search: 'تسريب' });
    expect(JSON.stringify(text)).not.toContain('reportNumber');
  });
});

describe('create (decisions.md I4/I6/I8)', () => {
  const baseDto = {
    mediaKeys: [STAGED_KEY],
    category: ReportCategory.PLUMBING,
    problemText: 'تسريب أسفل المغسلة',
  };

  it('snapshots the warranty verdict server-side and stores the rules version', async () => {
    await reportService.create(baseDto as never, HOMEOWNER, CTX);

    const data = db.report.create.mock.calls[0][0].data;
    expect(data.warrantyVerdict).toBe(ReportWarrantyVerdict.COVERED);
    expect(data.warrantyReasonCode).toBe('COVERED');
    expect(data.warrantyRulesVersion).toBeTruthy();
    expect(data.warrantyEvaluatedAt).toBeInstanceOf(Date);
  });

  it('resolves unit/building/project from the active ownership, never from the client', async () => {
    await reportService.create(
      { ...baseDto, unitId: 'attacker-unit', projectId: 'attacker-project' } as never,
      HOMEOWNER,
      CTX,
    );

    const data = db.report.create.mock.calls[0][0].data;
    expect(data.unitId).toBe('unit-1');
    expect(data.buildingId).toBe('building-1');
    expect(data.projectId).toBe('project-1');
    expect(data.ownershipId).toBe('ownership-1');
  });

  it('refuses to file a report for an account with no active ownership (invariant 15)', async () => {
    db.ownership.findFirst.mockResolvedValue(null);
    await expect(reportService.create(baseDto as never, HOMEOWNER, CTX)).rejects.toMatchObject({
      errorCode: 'NO_ACTIVE_OWNERSHIP',
    });
  });

  it('rejects a deactivated homeowner before any write (invariant 11)', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    await expect(reportService.create(baseDto as never, HOMEOWNER, CTX)).rejects.toMatchObject({
      errorCode: 'ACCOUNT_DEACTIVATED',
    });
    expect(db.report.create).not.toHaveBeenCalled();
  });

  it('rejects a media key from another homeowner\'s staging namespace', async () => {
    await expect(
      reportService.create(
        { ...baseDto, mediaKeys: ['reports/staging/someone-else/photo.jpg'] } as never,
        HOMEOWNER,
        CTX,
      ),
    ).rejects.toThrow(/Unknown photo reference/);
    expect(db.report.create).not.toHaveBeenCalled();
  });

  it('rejects a traversal attempt in a media key', async () => {
    await expect(
      reportService.create(
        { ...baseDto, mediaKeys: ['reports/staging/owner-user-1/../../etc/passwd'] } as never,
        HOMEOWNER,
        CTX,
      ),
    ).rejects.toThrow(/Unknown photo reference/);
  });

  it('rejects duplicate media references', async () => {
    await expect(
      reportService.create({ ...baseDto, mediaKeys: [STAGED_KEY, STAGED_KEY] } as never, HOMEOWNER, CTX),
    ).rejects.toThrow(/Duplicate photo references/);
  });

  it('defaults to MEDIUM/MANUAL_DEFAULT priority when no analysis is supplied (I6)', async () => {
    await reportService.create(baseDto as never, HOMEOWNER, CTX);

    const data = db.report.create.mock.calls[0][0].data;
    expect(data.priority).toBe(ReportPriority.MEDIUM);
    expect(data.prioritySource).toBe('MANUAL_DEFAULT');
    // No fabricated AI record.
    expect(data.aiProvider).toBeNull();
    expect(data.aiConfidence).toBeNull();
  });

  it('takes the AI fields from the SERVER-STORED analysis, keyed by an opaque id', async () => {
    db.reportAnalysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      userId: 'owner-user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      suggestedCategory: ReportCategory.ELECTRICAL,
      problemText: 'عطل كهربائي',
      priority: ReportPriority.HIGH,
      confidence: 87,
      explanation: 'شرح',
      mediaKeys: [STAGED_KEY],
      consumedByReportId: null,
    });

    await reportService.create(
      { ...baseDto, analysisId: '00000000-0000-0000-0000-000000000001' } as never,
      HOMEOWNER,
      CTX,
    );

    const data = db.report.create.mock.calls[0][0].data;
    expect(data.aiProvider).toBe('openai');
    expect(data.aiConfidence).toBe(87);
    expect(data.aiSuggestedCategory).toBe(ReportCategory.ELECTRICAL);
    expect(data.priority).toBe(ReportPriority.HIGH);
    expect(data.prioritySource).toBe('AI');
    // The user-confirmed category still wins over the AI's suggestion.
    expect(data.category).toBe(ReportCategory.PLUMBING);
    // And the analysis is marked consumed so it cannot be replayed.
    expect(db.reportAnalysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumedByReportId: 'report-1' } }),
    );
  });

  it('refuses an analysis belonging to another user', async () => {
    db.reportAnalysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      userId: 'someone-else',
      mediaKeys: [STAGED_KEY],
      consumedByReportId: null,
    });
    await expect(
      reportService.create(
        { ...baseDto, analysisId: '00000000-0000-0000-0000-000000000001' } as never,
        HOMEOWNER,
        CTX,
      ),
    ).rejects.toMatchObject({ errorCode: 'ANALYSIS_NOT_FOUND' });
  });

  it('refuses an already-consumed analysis', async () => {
    db.reportAnalysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      userId: 'owner-user-1',
      mediaKeys: [STAGED_KEY],
      consumedByReportId: 'report-0',
    });
    await expect(
      reportService.create(
        { ...baseDto, analysisId: '00000000-0000-0000-0000-000000000001' } as never,
        HOMEOWNER,
        CTX,
      ),
    ).rejects.toMatchObject({ errorCode: 'ANALYSIS_ALREADY_USED' });
  });

  it('refuses an analysis computed from different photos than the ones submitted', async () => {
    db.reportAnalysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      userId: 'owner-user-1',
      mediaKeys: ['reports/staging/owner-user-1/other.jpg'],
      consumedByReportId: null,
    });
    await expect(
      reportService.create(
        { ...baseDto, analysisId: '00000000-0000-0000-0000-000000000001' } as never,
        HOMEOWNER,
        CTX,
      ),
    ).rejects.toMatchObject({ errorCode: 'ANALYSIS_MEDIA_MISMATCH' });
  });

  it('asks the STORAGE ADAPTER for each media URL rather than rebuilding one', async () => {
    await reportService.create(baseDto as never, HOMEOWNER, CTX);

    expect(mockedStorage.publicUrl).toHaveBeenCalledWith(STAGED_KEY);
    const media = mockedRepo.createMedia.mock.calls[0][0] as { url: string }[];
    expect(media[0].url).toBe(`http://localhost:4000/files/report-media/${STAGED_KEY}`);
  });

  it('starts at ROUTING_PENDING and routes inside the same transaction', async () => {
    await reportService.create(baseDto as never, HOMEOWNER, CTX);

    expect(db.report.create.mock.calls[0][0].data.status).toBe(ReportStatus.ROUTING_PENDING);
    expect(mockedRouteReport).toHaveBeenCalledWith('report-1', prisma);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('writes the creation, warranty, and AI timeline events transactionally (invariant 14)', async () => {
    await reportService.create(baseDto as never, HOMEOWNER, CTX);

    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('REPORT_CREATED');
    expect(types).toContain('WARRANTY_EVALUATED');
    expect(types).toContain('AI_ANALYSIS_UNAVAILABLE'); // manual-entry path
  });

  it('still creates the report - as ROUTING_PENDING - when nobody is eligible (invariant: never reject a valid report)', async () => {
    mockedRouteReport.mockResolvedValue({
      assigned: false,
      technicianId: null,
      reasonCode: 'NO_ELIGIBLE_TECHNICIAN',
    });
    mockedRepo.findById.mockResolvedValue(
      fullReport({ status: ReportStatus.ROUTING_PENDING, assignedTechnicianId: null, assignedTechnician: null }) as never,
    );

    const result = await reportService.create(baseDto as never, HOMEOWNER, CTX);

    expect(result.status).toBe(ReportStatus.ROUTING_PENDING);
    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('ROUTING_PENDING_RECORDED');
  });

  it('never accepts a technician, status, or warranty verdict from the client', async () => {
    await reportService.create(
      {
        ...baseDto,
        technicianId: 'tech-attacker',
        assignedTechnicianId: 'tech-attacker',
        status: ReportStatus.CLOSED,
        warrantyVerdict: ReportWarrantyVerdict.COVERED,
      } as never,
      HOMEOWNER,
      CTX,
    );

    const data = db.report.create.mock.calls[0][0].data;
    expect(data.assignedTechnicianId).toBeUndefined();
    expect(data.status).toBe(ReportStatus.ROUTING_PENDING);
    // The verdict written is the one the server computed, not the client's.
    expect(data.warrantyVerdict).toBe(ReportWarrantyVerdict.COVERED);
    expect(data.warrantyReasonCode).toBe('COVERED');
  });
});

describe('analyze (decisions.md I6)', () => {
  it('is honestly unavailable when no provider is configured - never a fabricated result', async () => {
    mockedAnalysis.isConfigured.mockReturnValue(false);
    await expect(
      reportService.analyze({ mediaKeys: [STAGED_KEY] } as never, HOMEOWNER),
    ).rejects.toMatchObject({ errorCode: 'AI_ANALYSIS_UNAVAILABLE' });
    expect(db.reportAnalysis.create).not.toHaveBeenCalled();
  });

  it('persists the analysis server-side and returns only an opaque id plus advisory fields', async () => {
    mockedAnalysis.analyze.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      category: ReportCategory.PLUMBING,
      problemText: 'تسريب',
      priority: ReportPriority.HIGH,
      confidence: 90,
      explanation: 'شرح',
    });
    db.reportAnalysis.create.mockResolvedValue({
      id: 'analysis-1',
      suggestedCategory: ReportCategory.PLUMBING,
      problemText: 'تسريب',
      priority: ReportPriority.HIGH,
      confidence: 90,
      explanation: 'شرح',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.analyze({ mediaKeys: [STAGED_KEY] } as never, HOMEOWNER);

    expect(result.analysisId).toBe('analysis-1');
    expect(db.reportAnalysis.create).toHaveBeenCalled();
    // The stored row remembers exactly which photos it was computed from.
    expect(db.reportAnalysis.create.mock.calls[0][0].data.mediaKeys).toEqual([STAGED_KEY]);
  });

  it('refuses to analyze another homeowner\'s staged photos', async () => {
    await expect(
      reportService.analyze({ mediaKeys: ['reports/staging/other/x.jpg'] } as never, HOMEOWNER),
    ).rejects.toThrow(/Unknown photo reference/);
  });

  it('reports YOLO as unavailable and continues on OpenAI alone (I7)', async () => {
    mockedDetection.detect.mockResolvedValue(null);
    mockedAnalysis.analyze.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      category: ReportCategory.OTHER,
      problemText: 'x',
      priority: ReportPriority.LOW,
      confidence: 10,
      explanation: 'y',
    });
    db.reportAnalysis.create.mockResolvedValue({
      id: 'a1',
      suggestedCategory: ReportCategory.OTHER,
      problemText: 'x',
      priority: ReportPriority.LOW,
      confidence: 10,
      explanation: 'y',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const result = await reportService.analyze({ mediaKeys: [STAGED_KEY] } as never, HOMEOWNER);
    expect(result.detectionsAvailable).toBe(false);
  });
});

describe('warranty-check is an explicit preview, never authoritative (decisions.md I4)', () => {
  it('marks its result as a preview', async () => {
    const result = await reportService.warrantyCheck(
      { category: ReportCategory.PLUMBING } as never,
      HOMEOWNER,
    );
    expect(result.preview).toBe(true);
    expect(result.verdict).toBe(ReportWarrantyVerdict.COVERED);
  });

  it('reports NOT_CONFIGURED honestly for an unmapped category', async () => {
    const result = await reportService.warrantyCheck(
      { category: ReportCategory.CEILINGS } as never,
      HOMEOWNER,
    );
    expect(result.verdict).toBe(ReportWarrantyVerdict.NOT_CONFIGURED);
    expect(result.reasonCode).toBe('CATEGORY_NOT_CONFIGURED');
    expect(result.periodEnd).toBeNull();
  });
});

describe('start (decisions.md I2/I8)', () => {
  beforeEach(() => {
    db.report.findUnique.mockResolvedValue({ id: 'report-1', status: ReportStatus.ROUTED, repair: null });
  });

  it('404s for a report assigned to a DIFFERENT technician (never 403 - hide existence)', async () => {
    mockedRepo.findById.mockResolvedValue(fullReport({ assignedTechnicianId: 'tech-99' }) as never);
    await expect(reportService.start('report-1', {} as never, TECHNICIAN, CTX)).rejects.toMatchObject({
      httpStatus: 404,
      errorCode: 'REPORT_NOT_FOUND',
    });
  });

  it('rejects a homeowner and a PM outright', async () => {
    await expect(reportService.start('report-1', {} as never, HOMEOWNER, CTX)).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(reportService.start('report-1', {} as never, PM, CTX)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('rejects a deactivated technician before any write', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    await expect(reportService.start('report-1', {} as never, TECHNICIAN, CTX)).rejects.toMatchObject({
      errorCode: 'ACCOUNT_DEACTIVATED',
    });
    expect(mockedRepo.createRepair).not.toHaveBeenCalled();
  });

  it('enforces the single-active-repair rule with a 409 naming the blocking report', async () => {
    mockedRepo.findActiveRepairByTechnician.mockResolvedValue({
      id: 'repair-9',
      reportId: 'report-9',
      report: { id: 'report-9', reportNumber: 1039, problemText: 'x' },
    } as never);

    const error: ActiveRepairExistsError = await reportService
      .start('report-1', {} as never, TECHNICIAN, CTX)
      .then(() => {
        throw new Error('expected start() to reject with ACTIVE_REPAIR_EXISTS');
      })
      .catch((e: ActiveRepairExistsError) => e);

    expect(error).toBeInstanceOf(ActiveRepairExistsError);
    expect(error.errorCode).toBe('ACTIVE_REPAIR_EXISTS');
    expect(error.httpStatus).toBe(409);
    // C1 renders a link to the blocking report, so the reference travels with
    // the error rather than only the code.
    expect(error.details).toEqual({ blockingReportId: 'report-9', blockingReportNumber: 1039 });
  });

  it('allows starting the report that is ALREADY the technician\'s active one (idempotent resume)', async () => {
    mockedRepo.findActiveRepairByTechnician.mockResolvedValue({
      id: 'repair-1',
      reportId: 'report-1',
      report: { id: 'report-1', reportNumber: 1042, problemText: 'x' },
    } as never);
    db.report.findUnique.mockResolvedValue({
      id: 'report-1',
      status: ReportStatus.IN_PROGRESS,
      repair: { id: 'repair-1', status: ReportRepairStatus.REOPENED },
    });
    mockedRepo.findById.mockResolvedValue(
      fullReport({
        status: ReportStatus.IN_PROGRESS,
        repair: { id: 'repair-1', status: ReportRepairStatus.REOPENED, startedAt: new Date() },
      }) as never,
    );

    await expect(reportService.start('report-1', {} as never, TECHNICIAN, CTX)).resolves.toBeDefined();
  });

  it('refuses to start a report that is still ROUTING_PENDING', async () => {
    mockedRepo.findById.mockResolvedValue(
      fullReport({ status: ReportStatus.ROUTING_PENDING }) as never,
    );
    await expect(reportService.start('report-1', {} as never, TECHNICIAN, CTX)).rejects.toMatchObject({
      errorCode: 'INVALID_REPORT_STATUS_TRANSITION',
    });
  });

  it('moves the report to IN_PROGRESS and records a REPAIR_STARTED event', async () => {
    await reportService.start('report-1', {} as never, TECHNICIAN, CTX);

    expect(mockedRepo.createRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report-1',
        technicianId: 'tech-1',
        status: ReportRepairStatus.IN_PROGRESS,
      }),
      prisma,
    );
    expect(db.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ReportStatus.IN_PROGRESS } }),
    );
    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('REPAIR_STARTED');
  });
});

describe('submit-repair (decisions.md I2, C2)', () => {
  const AFTER_PHOTO = {
    fileName: 'after.png',
    mimeType: 'image/png' as const,
    contentBase64: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32),
    ]).toString('base64'),
  };

  beforeEach(() => {
    mockedRepo.findById.mockResolvedValue(
      fullReport({
        status: ReportStatus.IN_PROGRESS,
        repair: { id: 'repair-1', status: ReportRepairStatus.IN_PROGRESS, startedAt: new Date() },
      }) as never,
    );
    db.report.findUnique.mockResolvedValue({
      id: 'report-1',
      status: ReportStatus.IN_PROGRESS,
      repair: { id: 'repair-1', status: ReportRepairStatus.IN_PROGRESS },
    });
  });

  it('requires at least one after-photo (C2\'s hard rule)', async () => {
    await expect(
      reportService.submitRepair('report-1', { afterPhotos: [] } as never, TECHNICIAN, CTX),
    ).rejects.toThrow(/At least one after-repair photo is required/);
  });

  it('rejects a non-image disguised as an after-photo', async () => {
    await expect(
      reportService.submitRepair(
        'report-1',
        {
          afterPhotos: [
            { fileName: 'x.png', mimeType: 'image/png', contentBase64: Buffer.from('MZ...').toString('base64') },
          ],
        } as never,
        TECHNICIAN,
        CTX,
      ),
    ).rejects.toThrow(/not a supported image/);
  });

  it('moves the report to AWAITING_OWNER_APPROVAL and frees the technician', async () => {
    await reportService.submitRepair(
      'report-1',
      { afterPhotos: [AFTER_PHOTO], note: 'تم استبدال السيفون' } as never,
      TECHNICIAN,
      CTX,
    );

    expect(mockedRepo.updateRepair).toHaveBeenCalledWith(
      'repair-1',
      expect.objectContaining({
        status: ReportRepairStatus.SUBMITTED,
        technicianNote: 'تم استبدال السيفون',
      }),
      prisma,
    );
    expect(db.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ReportStatus.AWAITING_OWNER_APPROVAL } }),
    );
    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('REPAIR_MEDIA_ADDED');
    expect(types).toContain('REPAIR_SUBMITTED');
    // Freeing the slot may unblock a pending report in the same project (I9).
    expect(reportRoutingService.scheduleRetry).toHaveBeenCalledWith('project-1');
  });

  it('refuses to submit a repair that was never started', async () => {
    mockedRepo.findById.mockResolvedValue(fullReport({ status: ReportStatus.ROUTED, repair: null }) as never);
    await expect(
      reportService.submitRepair('report-1', { afterPhotos: [AFTER_PHOTO] } as never, TECHNICIAN, CTX),
    ).rejects.toMatchObject({ errorCode: 'INVALID_REPORT_STATUS_TRANSITION' });
  });
});

describe('approve (decisions.md I2/I13)', () => {
  beforeEach(() => {
    mockedRepo.findById.mockResolvedValue(
      fullReport({
        status: ReportStatus.AWAITING_OWNER_APPROVAL,
        repair: {
          id: 'repair-1',
          technicianId: 'tech-1',
          status: ReportRepairStatus.SUBMITTED,
          startedAt: new Date(Date.now() - 3 * 3_600_000),
        },
      }) as never,
    );
    db.report.findUnique.mockResolvedValue({
      id: 'report-1',
      status: ReportStatus.AWAITING_OWNER_APPROVAL,
      repair: { id: 'repair-1' },
    });
  });

  it('closes the report, records a real duration, and writes exactly one review', async () => {
    await reportService.approve('report-1', { rating: 5, comment: 'ممتاز' } as never, HOMEOWNER, CTX);

    expect(db.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReportStatus.CLOSED }),
      }),
    );
    const repairUpdate = mockedRepo.updateRepair.mock.calls[0][1] as Record<string, unknown>;
    expect(repairUpdate.status).toBe(ReportRepairStatus.APPROVED);
    expect(repairUpdate.durationMinutes).toBeGreaterThanOrEqual(179);

    expect(mockedRepo.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report-1',
        reportRepairId: 'repair-1',
        technicianId: 'tech-1',
        homeownerId: 'owner-user-1',
        rating: 5,
        comment: 'ممتاز',
      }),
      prisma,
    );

    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(expect.arrayContaining(['HOMEOWNER_APPROVED', 'REVIEW_SUBMITTED', 'REPORT_CLOSED']));
  });

  it('404s for another homeowner\'s report', async () => {
    mockedRepo.findById.mockResolvedValue(fullReport({ homeownerId: 'other-owner' }) as never);
    await expect(
      reportService.approve('report-1', { rating: 5 } as never, HOMEOWNER, CTX),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('rejects a technician, PM, and company outright (invariants 12/13)', async () => {
    for (const principal of [TECHNICIAN, PM, COMPANY]) {
      await expect(
        reportService.approve('report-1', { rating: 5 } as never, principal, CTX),
      ).rejects.toMatchObject({ httpStatus: 403 });
    }
  });

  it('refuses to approve a report that is not awaiting approval', async () => {
    mockedRepo.findById.mockResolvedValue(fullReport({ status: ReportStatus.IN_PROGRESS }) as never);
    await expect(
      reportService.approve('report-1', { rating: 5 } as never, HOMEOWNER, CTX),
    ).rejects.toMatchObject({ errorCode: 'INVALID_REPORT_STATUS_TRANSITION' });
  });

  it('rejects a deactivated homeowner', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'ARCHIVED' });
    await expect(
      reportService.approve('report-1', { rating: 5 } as never, HOMEOWNER, CTX),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DEACTIVATED' });
  });
});

describe('reopen (decisions.md I2)', () => {
  beforeEach(() => {
    mockedRepo.findById.mockResolvedValue(
      fullReport({
        status: ReportStatus.AWAITING_OWNER_APPROVAL,
        repair: {
          id: 'repair-1',
          technicianId: 'tech-1',
          status: ReportRepairStatus.SUBMITTED,
          startedAt: new Date(),
        },
      }) as never,
    );
    db.report.findUnique.mockResolvedValue({
      id: 'report-1',
      status: ReportStatus.AWAITING_OWNER_APPROVAL,
      repair: { id: 'repair-1' },
    });
  });

  it('returns the report to IN_PROGRESS, increments reopenCount, and stores the reason', async () => {
    await reportService.reopen('report-1', { reason: 'ما زال التسريب موجوداً' } as never, HOMEOWNER, CTX);

    expect(db.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ReportStatus.IN_PROGRESS, reopenCount: { increment: 1 } },
      }),
    );
    const types = mockedRepo.appendTimelineEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('HOMEOWNER_REOPENED');
  });

  it('sets the repair to REOPENED (not IN_PROGRESS) so the technician lock is never violated', async () => {
    await reportService.reopen('report-1', { reason: 'ما زالت' } as never, HOMEOWNER, CTX);

    const update = mockedRepo.updateRepair.mock.calls[0][1] as Record<string, unknown>;
    expect(update.status).toBe(ReportRepairStatus.REOPENED);
    expect(update.homeownerReopenReason).toBe('ما زالت');
    expect(update.submittedAt).toBeNull();
  });

  it('rejects a technician, PM, and company', async () => {
    for (const principal of [TECHNICIAN, PM, COMPANY]) {
      await expect(
        reportService.reopen('report-1', { reason: 'x' } as never, principal, CTX),
      ).rejects.toMatchObject({ httpStatus: 403 });
    }
  });

  it('refuses to reopen a closed report', async () => {
    mockedRepo.findById.mockResolvedValue(fullReport({ status: ReportStatus.CLOSED }) as never);
    await expect(
      reportService.reopen('report-1', { reason: 'x' } as never, HOMEOWNER, CTX),
    ).rejects.toMatchObject({ errorCode: 'INVALID_REPORT_STATUS_TRANSITION' });
  });
});

describe('routing retry endpoint protection (decisions.md I9)', () => {
  const original = env.routing.retrySecret;
  afterEach(() => {
    env.routing.retrySecret = original;
  });

  it('is closed - not open - when no secret is configured', async () => {
    env.routing.retrySecret = '';
    await expect(reportService.retryRouting('anything')).rejects.toMatchObject({
      errorCode: 'ROUTING_RETRY_NOT_CONFIGURED',
    });
    expect(reportRoutingService.retryPending).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret', async () => {
    env.routing.retrySecret = 'super-secret';
    await expect(reportService.retryRouting(undefined)).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
    });
    await expect(reportService.retryRouting('wrong')).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
    });
    await expect(reportService.retryRouting('super-secre')).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
    });
  });

  it('runs the sweep for the correct secret', async () => {
    env.routing.retrySecret = 'super-secret';
    (reportRoutingService.retryPending as jest.Mock).mockResolvedValue({
      scanned: 0,
      assigned: 0,
      stillPending: 0,
    });
    await expect(reportService.retryRouting('super-secret')).resolves.toEqual({
      scanned: 0,
      assigned: 0,
      stillPending: 0,
    });
  });

  // --- Task 10 ---

  it('never returns the secret in the response, on success or on failure', async () => {
    env.routing.retrySecret = 'super-secret-value-abcdefghijklmnop';
    (reportRoutingService.retryPending as jest.Mock).mockResolvedValue({
      scanned: 3,
      assigned: 1,
      stillPending: 2,
    });

    const ok = await reportService.retryRouting('super-secret-value-abcdefghijklmnop');
    expect(JSON.stringify(ok)).not.toContain('super-secret-value');

    await expect(reportService.retryRouting('nope')).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
      // The message must not echo either the presented or the configured value.
      message: expect.not.stringContaining('super-secret-value'),
    });
  });

  it('is a no-op sweep when there is nothing pending - safe to run on a schedule', async () => {
    env.routing.retrySecret = 'super-secret';
    (reportRoutingService.retryPending as jest.Mock).mockResolvedValue({
      scanned: 0,
      assigned: 0,
      stillPending: 0,
    });

    // Vercel Cron calls this every 15 minutes; the overwhelmingly common case
    // is "nothing to do", and that must cost nothing and write nothing.
    const first = await reportService.retryRouting('super-secret');
    const second = await reportService.retryRouting('super-secret');
    expect(first).toEqual(second);
    expect(first.assigned).toBe(0);
  });
});

describe('provider status reporting (decisions.md I7/I11)', () => {
  it('returns booleans only - never a provider key or URL', () => {
    const status = reportService.providerStatus();
    expect(JSON.stringify(status)).not.toContain('sk-');
    expect(typeof status.analysis.available).toBe('boolean');
    expect(typeof status.objectDetection.available).toBe('boolean');
    expect(status.objectDetection.name).toBe('yolov11');
    expect(status.media.durable).toBe(false); // test driver is not durable
  });
});

describe('getTimeline scope', () => {
  it('404s a foreign report\'s timeline before reading a single event', async () => {
    db.report.findFirst.mockResolvedValue(null);
    await expect(reportService.getTimeline('report-1', HOMEOWNER)).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(mockedRepo.listTimeline).not.toHaveBeenCalled();
  });
});
