import { buildingService } from '../building.service';
import { buildingRepository } from '../building.repository';
import { projectRepository } from '../../projects/project.repository';
import { BuildingStatus } from '../building.types';
import { ProjectStatus } from '../../projects/project.types';
import { UserRole } from '../../shared/roles';

jest.mock('../building.repository');
jest.mock('../../projects/project.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const homeSeekerRequester = { id: 'user-2', role: UserRole.HOME_SEEKER, companyId: null };

const activeProject = {
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
  readiness: null,
  amenities: [],
  source: 'MANUAL',
  externalId: null,
  sourceUpdatedAt: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { buildings: 0 },
  projectManager: null,
};

function baseBuilding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'building-1',
    projectId: 'project-1',
    name: 'Tower A',
    number: '1',
    status: BuildingStatus.ACTIVE,
    isActive: true,
    floors: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { units: 0 },
    ...overrides,
  };
}

describe('buildingService.create', () => {
  it('rejects a non-owning company (PER-004)', async () => {
    mockedProjects.findById.mockResolvedValue({ ...activeProject, companyId: 'other-company' });

    await expect(
      buildingService.create('project-1', { name: 'Tower A', number: '1' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a duplicate building number within the same project (COM-007)', async () => {
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedBuildings.findByProjectAndNumber.mockResolvedValue({ id: 'existing' } as never);

    await expect(
      buildingService.create('project-1', { name: 'Tower A', number: '1' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'BUILDING_NUMBER_ALREADY_EXISTS' });
  });

  it('rejects creating a building under an archived project', async () => {
    mockedProjects.findById.mockResolvedValue({ ...activeProject, status: ProjectStatus.ARCHIVED });

    await expect(
      buildingService.create('project-1', { name: 'Tower A', number: '1' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'PROJECT_ARCHIVED' });
  });

  it('creates a building scoped to the project, starting in DRAFT', async () => {
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedBuildings.findByProjectAndNumber.mockResolvedValue(null);
    mockedBuildings.create.mockResolvedValue(baseBuilding({ status: BuildingStatus.DRAFT }));

    const result = await buildingService.create(
      'project-1',
      { name: 'Tower A', number: '1' },
      companyRequester,
      { ipAddress: null },
    );

    expect(result.status).toBe('DRAFT');
  });
});

describe('buildingService.list', () => {
  it('hides Draft buildings from public viewers but shows them to the owner', async () => {
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedBuildings.findAllByProject.mockResolvedValue([
      baseBuilding({ id: 'b1', number: '1', status: BuildingStatus.DRAFT }),
      baseBuilding({ id: 'b2', number: '2', status: BuildingStatus.ACTIVE }),
    ]);

    const publicView = await buildingService.list('project-1', homeSeekerRequester);
    expect(publicView).toHaveLength(1);
    expect(publicView[0].status).toBe('ACTIVE');

    const ownerView = await buildingService.list('project-1', companyRequester);
    expect(ownerView).toHaveLength(2);
  });
});

describe('buildingService.updateStatus (decisions.md E1: isActive toggle, decoupled from status)', () => {
  it('rejects toggling a building owned by another company', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding());
    mockedProjects.findById.mockResolvedValue({ ...activeProject, companyId: 'other-company' });

    await expect(
      buildingService.updateStatus('building-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects toggling an archived building (read-only, terminal)', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding({ status: BuildingStatus.ARCHIVED }));
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(
      buildingService.updateStatus('building-1', true, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'BUILDING_ARCHIVED' });
  });

  it('rejects toggling a building still in DRAFT (not yet published)', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding({ status: BuildingStatus.DRAFT }));
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(
      buildingService.updateStatus('building-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'BUILDING_NOT_PUBLISHED' });
  });

  it('deactivates an active building without touching its status enum', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding({ isActive: true }));
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedBuildings.updateIsActive.mockResolvedValue(baseBuilding({ isActive: false }));

    const result = await buildingService.updateStatus('building-1', false, companyRequester, {
      ipAddress: null,
    });

    expect(mockedBuildings.updateIsActive).toHaveBeenCalledWith('building-1', false);
    expect(mockedBuildings.updateStatus).not.toHaveBeenCalled();
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(false);
  });
});

describe('buildingService.archive (decisions.md E1: the only path to ARCHIVED)', () => {
  it('rejects archiving an already-archived building', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding({ status: BuildingStatus.ARCHIVED }));
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(
      buildingService.archive('building-1', companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE_TRANSITION' });
  });

  it('archives an active building and forces isActive to false', async () => {
    mockedBuildings.findById.mockResolvedValue(baseBuilding({ status: BuildingStatus.ACTIVE, isActive: true }));
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedBuildings.archive.mockResolvedValue(baseBuilding({ status: BuildingStatus.ARCHIVED, isActive: false }));

    const result = await buildingService.archive('building-1', companyRequester, { ipAddress: null });
    expect(result.status).toBe('ARCHIVED');
    expect(result.isActive).toBe(false);
  });
});
