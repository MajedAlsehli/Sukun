import { projectService } from '../project.service';
import { projectRepository } from '../project.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { contractorRepository } from '../../contractors/contractor.repository';
import { ProjectStatus } from '../project.types';
import { UserRole } from '../../shared/roles';

jest.mock('../project.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../contractors/contractor.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../project-health', () => ({
  computeProjectHealth: jest.fn().mockResolvedValue({ status: 'EXCELLENT', label: 'ممتاز', openReportsCount: 0 }),
}));

const mockedRepo = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedManagerRepo = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const mockedContractorRepo = contractorRepository as jest.Mocked<typeof contractorRepository>;

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
    status: ProjectStatus.DRAFT,
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
    _count: { buildings: 0 },
    projectManager: null,
    ...overrides,
  };
}

const eligibleManager = {
  id: 'manager-1',
  projectId: null as string | null,
  userId: 'pm-user-1',
  status: 'ACTIVATED',
  user: { id: 'pm-user-1', companyId: 'company-1' as string | null, name: 'مدير المشروع', email: 'pm@example.com' },
};

const eligibleContractor = {
  id: 'contractor-1',
  companyId: 'company-1',
  name: 'مقاولات الشرق',
  phone: '0500000000',
  email: 'contractor@example.com',
  isActive: true,
};

const validCreateDto = {
  name: 'مشروع سدرة',
  city: 'الرياض',
  managerId: 'manager-1',
  primaryContractorId: 'contractor-1',
  buildings: [
    {
      name: 'مبنى A',
      floors: 5,
      units: { perFloor: 8, area: 140, beds: 3, baths: 2, parking: 1 },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedRepo.countUnits.mockResolvedValue(0);
});

describe('projectService.create', () => {
  it('rejects a company-role user with no linked company (data integrity gap)', async () => {
    await expect(
      projectService.create(validCreateDto, { id: 'user-3', role: UserRole.COMPANY, companyId: null }, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a non-Company role (COM-001)', async () => {
    await expect(
      projectService.create(validCreateDto, homeSeekerRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a manager already assigned to a project (not eligible)', async () => {
    mockedManagerRepo.findById.mockResolvedValue({ ...eligibleManager, projectId: 'other-project' } as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);

    await expect(
      projectService.create(validCreateDto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'MANAGER_NOT_ELIGIBLE' });
  });

  it('rejects a manager belonging to a different company', async () => {
    mockedManagerRepo.findById.mockResolvedValue({
      ...eligibleManager,
      user: { ...eligibleManager.user, companyId: 'other-company' },
    } as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);

    await expect(
      projectService.create(validCreateDto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects an inactive contractor organization (not eligible)', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue({ ...eligibleContractor, isActive: false } as never);

    await expect(
      projectService.create(validCreateDto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'CONTRACTOR_NOT_ELIGIBLE' });
  });

  it('rejects a contractor belonging to a different company', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue({ ...eligibleContractor, companyId: 'other-company' } as never);

    await expect(
      projectService.create(validCreateDto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects duplicate explicit building numbers within one request', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);

    await expect(
      projectService.create(
        {
          ...validCreateDto,
          buildings: [
            { name: 'مبنى A', number: '01', floors: 2, units: { perFloor: 2, area: 100, beds: 2, baths: 1, parking: 1 } },
            { name: 'مبنى B', number: '01', floors: 2, units: { perFloor: 2, area: 100, beds: 2, baths: 1, parking: 1 } },
          ],
        },
        companyRequester,
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'DUPLICATE_BUILDING_NUMBER' });
  });

  it('rejects a generation request exceeding the total-unit limit', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);

    await expect(
      projectService.create(
        {
          ...validCreateDto,
          buildings: [{ name: 'مبنى ضخم', floors: 200, units: { perFloor: 60, area: 100, beds: 2, baths: 1, parking: 1 } }],
        },
        companyRequester,
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_UNIT_GENERATION_LIMIT_EXCEEDED' });
  });

  it('creates transactionally: generates deterministic unit numbers, assigns manager/contractor, one repository call', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);
    mockedRepo.findByCode.mockResolvedValue(null);
    mockedRepo.createWithBuildings.mockResolvedValue('project-1');
    mockedRepo.findById.mockResolvedValue(baseProject({ primaryContractorId: 'contractor-1' }) as never);

    const result = await projectService.create(validCreateDto, companyRequester, { ipAddress: null });

    expect(mockedRepo.createWithBuildings).toHaveBeenCalledTimes(1);
    const call = mockedRepo.createWithBuildings.mock.calls[0][0];
    expect(call.companyId).toBe('company-1');
    expect(call.managerId).toBe('manager-1');
    expect(call.primaryContractorId).toBe('contractor-1');
    expect(call.buildings).toHaveLength(1);
    expect(call.buildings[0].units).toHaveLength(40); // 5 floors x 8/floor
    expect(call.buildings[0].units[0].number).toBe('101'); // floor 1, unit 1
    expect(call.buildings[0].units[7].number).toBe('108'); // floor 1, unit 8
    expect(call.buildings[0].units[8].number).toBe('201'); // floor 2, unit 1
    expect(call.totalUnitsCount).toBe(40);
    expect(result.status).toBe('DRAFT');
  });

  it('rolls back entirely if the repository transaction throws (no partial project left queryable)', async () => {
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);
    mockedRepo.createWithBuildings.mockRejectedValue(new Error('simulated transaction failure'));

    await expect(
      projectService.create(validCreateDto, companyRequester, { ipAddress: null }),
    ).rejects.toThrow('simulated transaction failure');
    expect(mockedRepo.findById).not.toHaveBeenCalled();
  });
});

describe('projectService.getById', () => {
  it('hides a Draft project from a non-owner as 404, not 403', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ companyId: 'other-company' }) as never);

    await expect(projectService.getById('project-1', homeSeekerRequester)).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_FOUND',
    });
  });

  it('allows the owning company to see its own Draft project', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject() as never);

    const result = await projectService.getById('project-1', companyRequester);
    expect(result.status).toBe('DRAFT');
  });
});

describe('projectService.update', () => {
  it('rejects updating an archived project (COM-010)', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ARCHIVED }) as never);

    await expect(
      projectService.update('project-1', { name: 'New Name' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_ARCHIVED' });
  });

  it('rejects a company updating another company project', async () => {
    mockedRepo.findById.mockResolvedValue(
      baseProject({ companyId: 'other-company', status: ProjectStatus.ACTIVE }) as never,
    );

    await expect(
      projectService.update('project-1', { name: 'New Name' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('projectService.updateStatus (decisions.md E1: isActive toggle, decoupled from status)', () => {
  it('rejects toggling an archived project (read-only, terminal)', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ARCHIVED }) as never);

    await expect(
      projectService.updateStatus('project-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_ARCHIVED' });
  });

  it('rejects toggling a project still in DRAFT (not yet published)', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.DRAFT }) as never);

    await expect(
      projectService.updateStatus('project-1', true, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_NOT_PUBLISHED' });
  });

  it('deactivates an active project without touching its status enum', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE, isActive: true }) as never);
    mockedRepo.updateIsActive.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE, isActive: false }) as never);

    const result = await projectService.updateStatus('project-1', false, companyRequester, { ipAddress: null });

    expect(mockedRepo.updateIsActive).toHaveBeenCalledWith('project-1', false);
    expect(mockedRepo.updateStatus).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
    expect(result.status).toBe('ACTIVE');
  });

  it('reactivates a previously-deactivated active project', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE, isActive: false }) as never);
    mockedRepo.updateIsActive.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE, isActive: true }) as never);

    const result = await projectService.updateStatus('project-1', true, companyRequester, { ipAddress: null });
    expect(result.isActive).toBe(true);
  });
});

describe('projectService.archive (decisions.md E1: the only path to ARCHIVED)', () => {
  it('rejects archiving an already-archived project', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ARCHIVED }) as never);

    await expect(
      projectService.archive('project-1', companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE_TRANSITION' });
  });

  it('archives an active project and forces isActive to false', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE, isActive: true }) as never);
    mockedRepo.archive.mockResolvedValue(
      baseProject({ status: ProjectStatus.ARCHIVED, isActive: false }) as never,
    );

    const result = await projectService.archive('project-1', companyRequester, { ipAddress: null });
    expect(mockedRepo.archive).toHaveBeenCalledWith('project-1');
    expect(result.status).toBe('ARCHIVED');
    expect(result.isActive).toBe(false);
  });

  it('there is no endpoint/method that transitions ARCHIVED back to ACTIVE', () => {
    expect((projectService as Record<string, unknown>).unarchive).toBeUndefined();
    expect((projectService as Record<string, unknown>).reactivateArchived).toBeUndefined();
  });
});

describe('projectService.reassignManager', () => {
  it('returns the outgoing manager to the unassigned pool and assigns the new one', async () => {
    mockedRepo.findById
      .mockResolvedValueOnce(baseProject({ status: ProjectStatus.ACTIVE }) as never)
      .mockResolvedValueOnce(baseProject({ status: ProjectStatus.ACTIVE }) as never);
    mockedManagerRepo.findByProjectId.mockResolvedValue({ id: 'old-manager-1' } as never);
    mockedManagerRepo.findById.mockResolvedValue(eligibleManager as never);

    await projectService.reassignManager('project-1', { managerId: 'manager-1' }, companyRequester, {
      ipAddress: null,
    });

    expect(mockedRepo.reassignManager).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        outgoingManagerId: 'old-manager-1',
        incomingManagerId: 'manager-1',
      }),
    );
  });

  it('rejects reassigning on an archived project', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ARCHIVED }) as never);

    await expect(
      projectService.reassignManager('project-1', { managerId: 'manager-1' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_ARCHIVED' });
  });
});

describe('projectService.reassignContractor', () => {
  it('rejects an ineligible contractor', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE }) as never);
    mockedContractorRepo.findById.mockResolvedValue({ ...eligibleContractor, isActive: false } as never);

    await expect(
      projectService.reassignContractor('project-1', { primaryContractorId: 'contractor-1' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'CONTRACTOR_NOT_ELIGIBLE' });
  });

  it('swaps the primary contractor via a plain field update', async () => {
    mockedRepo.findById.mockResolvedValue(baseProject({ status: ProjectStatus.ACTIVE }) as never);
    mockedContractorRepo.findById.mockResolvedValue(eligibleContractor as never);
    mockedRepo.update.mockResolvedValue(baseProject({ primaryContractorId: 'contractor-1' }) as never);

    const result = await projectService.reassignContractor(
      'project-1',
      { primaryContractorId: 'contractor-1' },
      companyRequester,
      { ipAddress: null },
    );

    expect(mockedRepo.update).toHaveBeenCalledWith('project-1', { primaryContractorId: 'contractor-1' });
    expect(result.primaryContractorId).toBe('contractor-1');
  });
});
