import { companyService } from '../company.service';
import { companyRepository } from '../company.repository';
import { projectRepository } from '../../projects/project.repository';
import { computeProjectHealth } from '../../projects/project-health';
import { UserRole } from '../../shared/roles';

jest.mock('../company.repository');
jest.mock('../../projects/project.repository');
jest.mock('../../projects/project-health');

const mockedCompany = companyRepository as jest.Mocked<typeof companyRepository>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedHealth = computeProjectHealth as jest.MockedFunction<typeof computeProjectHealth>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const pmRequester = { id: 'user-2', role: UserRole.PROJECT_MANAGER, companyId: null };

describe('companyService.overview', () => {
  it('rejects a non-Company role', async () => {
    await expect(companyService.overview(pmRequester)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('computes occupied percent/vacant count from real KPI counts and reports honest null satisfaction', async () => {
    mockedCompany.kpis.mockResolvedValue({
      projectsCount: 3,
      buildingsCount: 6,
      unitsCount: 100,
      occupiedCount: 40,
      homeownersCount: 40,
      openReportsCount: 5,
      closedReportsCount: 20,
      // Task 8 (decisions.md I14): legacy pre-ownership numbers are reported
      // separately now, never summed into the canonical ones above.
      legacyOpenReportsCount: 4,
      legacyClosedReportsCount: 9,
    });

    const result = await companyService.overview(companyRequester);

    expect(result.occupiedPercent).toBe(40);
    expect(result.vacantCount).toBe(60);
    expect(result.satisfaction).toBeNull();
    expect(result.homeownersCount).toBe(40);
  });

  it('reports zero occupancy honestly for a company with no units yet (no fabricated percentage)', async () => {
    mockedCompany.kpis.mockResolvedValue({
      projectsCount: 0,
      buildingsCount: 0,
      unitsCount: 0,
      occupiedCount: 0,
      homeownersCount: 0,
      openReportsCount: 0,
      closedReportsCount: 0,
      legacyOpenReportsCount: 0,
      legacyClosedReportsCount: 0,
    });

    const result = await companyService.overview(companyRequester);
    expect(result.occupiedPercent).toBe(0);
  });
});

describe('companyService.projectsSummary', () => {
  it('attaches server-computed health per project, sourced from real data', async () => {
    mockedCompany.projectsSummary.mockResolvedValue([
      {
        id: 'p1',
        name: 'سدرة',
        city: 'الرياض',
        status: 'ACTIVE',
        isActive: true,
        createdAt: new Date(),
        _count: { buildings: 2 },
        projectManager: { user: { name: 'مدير أحمد' } },
        primaryContractor: { name: 'مقاولات الشرق' },
      } as never,
    ]);
    mockedProjects.countUnits.mockResolvedValue(40);
    mockedHealth.mockResolvedValue({
      status: 'NEEDS_ATTENTION',
      label: 'يحتاج متابعة',
      openReportsCount: 3,
      criticalReportsCount: 0,
      legacy: { openInspectionReportsCount: 0, openWarrantyReportsCount: 0 },
    });

    const result = await companyService.projectsSummary(companyRequester);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].health.label).toBe('يحتاج متابعة');
    expect(result.items[0].managerName).toBe('مدير أحمد');
    expect(result.items[0].primaryContractorName).toBe('مقاولات الشرق');
    expect(result.items[0].unitsCount).toBe(40);
  });

  it('returns an honest empty list for a company with no projects yet - no mock fallback', async () => {
    mockedCompany.projectsSummary.mockResolvedValue([]);

    const result = await companyService.projectsSummary(companyRequester);
    expect(result.items).toEqual([]);
  });
});

describe('companyService.activity', () => {
  it('returns an honest empty feed when no audit events exist yet', async () => {
    mockedCompany.activity.mockResolvedValue([]);

    const result = await companyService.activity(companyRequester);
    expect(result.items).toEqual([]);
  });
});
