import { workspaceService } from '../workspace.service';
import { projectRepository } from '../project.repository';
import { workspaceRepository } from '../workspace.repository';
import { computeProjectHealth } from '../project-health';
import { ProjectStatus } from '../project.types';
import { UserRole } from '../../shared/roles';

jest.mock('../project.repository');
jest.mock('../workspace.repository');
jest.mock('../project-health');

const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedWorkspace = workspaceRepository as jest.Mocked<typeof workspaceRepository>;
const mockedHealth = computeProjectHealth as jest.MockedFunction<typeof computeProjectHealth>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const homeSeekerRequester = { id: 'user-2', role: UserRole.HOME_SEEKER, companyId: null };

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    companyId: 'company-1',
    name: 'Sedra',
    code: 'SED-1',
    city: 'Riyadh',
    district: null,
    description: null,
    status: ProjectStatus.ACTIVE,
    isActive: true,
    coverImageKey: null,
    coverImageUrl: null,
    primaryContractorId: null,
    source: 'MANUAL',
    externalId: null,
    sourceUpdatedAt: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { buildings: 2 },
    projectManager: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedHealth.mockResolvedValue({
    status: 'EXCELLENT',
    label: 'ممتاز',
    openReportsCount: 0,
    criticalReportsCount: 0,
    legacy: { openInspectionReportsCount: 0, openWarrantyReportsCount: 0 },
  });
});

describe('workspaceService.getWorkspace', () => {
  it('rejects a non-Company role', async () => {
    await expect(workspaceService.getWorkspace('project-1', homeSeekerRequester)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('hides another company\'s Draft project as 404', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject({ companyId: 'other-company', status: ProjectStatus.DRAFT }));

    await expect(workspaceService.getWorkspace('project-1', companyRequester)).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_FOUND',
    });
  });

  it('rejects a company reading another company\'s published project as 403 (real ownership, not just visibility)', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject({ companyId: 'other-company', status: ProjectStatus.ACTIVE }));

    await expect(workspaceService.getWorkspace('project-1', companyRequester)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('computes occupied/vacant percentages and warranty coverage from real counts, never fabricated', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedProjects.countUnits.mockResolvedValue(40);
    mockedWorkspace.kpis.mockResolvedValue({
      buildingsCount: 2,
      unitsCount: 40,
      occupiedCount: 10,
      warrantyActiveCount: 5,
    });
    mockedWorkspace.timeline.mockResolvedValue({ firstHandoverAt: null, warrantyActivatedAt: null });

    const result = await workspaceService.getWorkspace('project-1', companyRequester);

    expect(result.kpis.occupiedCount).toBe(10);
    expect(result.kpis.occupiedPercent).toBe(25); // 10/40
    expect(result.kpis.vacantCount).toBe(30);
    expect(result.kpis.warrantyCoveragePercent).toBe(50); // 5/10
    expect(result.kpis.satisfaction).toBeNull();
  });

  it('reports zero/null honestly for a project with no units yet (no division-by-zero fabrication)', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedProjects.countUnits.mockResolvedValue(0);
    mockedWorkspace.kpis.mockResolvedValue({
      buildingsCount: 0,
      unitsCount: 0,
      occupiedCount: 0,
      warrantyActiveCount: 0,
    });
    mockedWorkspace.timeline.mockResolvedValue({ firstHandoverAt: null, warrantyActivatedAt: null });

    const result = await workspaceService.getWorkspace('project-1', companyRequester);

    expect(result.kpis.occupiedPercent).toBe(0);
    expect(result.kpis.warrantyCoveragePercent).toBeNull();
  });
});

describe('workspaceService.listUnits', () => {
  it('normalizes Arabic-Indic digits in the search query before filtering', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.findUnitsByProject.mockResolvedValue({ items: [], total: 0 });

    await workspaceService.listUnits('project-1', companyRequester, {
      q: '١٠١',
      occupancy: 'ALL',
      page: 1,
      pageSize: 24,
    });

    expect(mockedWorkspace.findUnitsByProject).toHaveBeenCalledWith(
      'project-1',
      { buildingId: undefined, number: '101', status: undefined },
      1,
      24,
    );
  });

  it('maps the occupancy filter directly onto UnitStatus', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.findUnitsByProject.mockResolvedValue({ items: [], total: 0 });

    await workspaceService.listUnits('project-1', companyRequester, {
      occupancy: 'OCCUPIED',
      page: 1,
      pageSize: 24,
    });

    expect(mockedWorkspace.findUnitsByProject).toHaveBeenCalledWith(
      'project-1',
      { buildingId: undefined, number: undefined, status: 'OCCUPIED' },
      1,
      24,
    );
  });
});

describe('workspaceService.listHomeowners', () => {
  it('shows an active ownership as ACTIVE and excludes its superseded activation row', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.findHomeownerRows.mockResolvedValue({
      ownerships: [
        {
          unitId: 'unit-1',
          unit: { number: '101', building: { name: 'Tower A' } },
          user: { name: 'سارة', email: 's@example.com', phone: '05' },
        } as never,
      ],
      activations: [
        {
          id: 'act-1',
          unitId: 'unit-1',
          status: 'ACTIVATED',
          unit: { number: '101', building: { name: 'Tower A' } },
          user: { name: 'سارة', email: 's@example.com', phone: '05' },
        } as never,
      ],
    });

    const result = await workspaceService.listHomeowners('project-1', companyRequester);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].invitationState).toBe('ACTIVE');
  });

  it('shows a pending activation with no ownership yet as PENDING', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.findHomeownerRows.mockResolvedValue({
      ownerships: [],
      activations: [
        {
          id: 'act-2',
          unitId: 'unit-2',
          status: 'PENDING',
          unit: { number: '202', building: { name: 'Tower A' } },
          user: { name: 'خالد', email: 'k@example.com', phone: '05' },
        } as never,
      ],
    });

    const result = await workspaceService.listHomeowners('project-1', companyRequester);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].invitationState).toBe('PENDING');
  });

  it('returns an honest empty list for a project with no homeowners yet', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.findHomeownerRows.mockResolvedValue({ ownerships: [], activations: [] });

    const result = await workspaceService.listHomeowners('project-1', companyRequester);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('workspaceService.listActivity', () => {
  it('returns an honest empty feed for a project with no audit events yet', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.buildingIdsByProject.mockResolvedValue([]);
    mockedWorkspace.projectActivity.mockResolvedValue([]);

    const result = await workspaceService.listActivity('project-1', companyRequester);
    expect(result.items).toEqual([]);
  });

  it('maps real audit rows to a display shape with a non-empty Arabic description', async () => {
    mockedProjects.findById.mockResolvedValue(baseProject());
    mockedWorkspace.buildingIdsByProject.mockResolvedValue([{ id: 'b1' }] as never);
    mockedWorkspace.projectActivity.mockResolvedValue([
      {
        id: 'log-1',
        userId: 'user-1',
        action: 'PROJECT_CREATED',
        entity: 'Project',
        entityId: 'project-1',
        ipAddress: null,
        metadata: null,
        timestamp: new Date(),
        user: { name: 'شركة أوج' },
      } as never,
    ]);

    const result = await workspaceService.listActivity('project-1', companyRequester);
    expect(result.items[0].description).toBe('تم إنشاء المشروع');
    expect(result.items[0].actorName).toBe('شركة أوج');
  });
});
