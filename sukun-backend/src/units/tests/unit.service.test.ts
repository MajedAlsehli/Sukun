import { unitService } from '../unit.service';
import { unitRepository } from '../unit.repository';
import { buildingRepository } from '../../buildings/building.repository';
import { projectRepository } from '../../projects/project.repository';
import { UnitStatus } from '../unit.types';
import { BuildingStatus } from '../../buildings/building.types';
import { ProjectStatus } from '../../projects/project.types';
import { UserRole } from '../../shared/roles';

jest.mock('../unit.repository');
jest.mock('../../buildings/building.repository');
jest.mock('../../projects/project.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedUnits = unitRepository as jest.Mocked<typeof unitRepository>;
const mockedBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const homeSeekerRequester = { id: 'user-2', role: UserRole.HOME_SEEKER, companyId: null };

const activeBuilding = {
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
};

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

function baseUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'unit-1',
    buildingId: 'building-1',
    number: '101',
    floor: 1,
    type: 'Apartment',
    status: UnitStatus.AVAILABLE,
    area: null,
    bedrooms: null,
    bathrooms: null,
    parkingSpots: null,
    price: null,
    source: 'MANUAL',
    externalId: null,
    sourceUpdatedAt: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('unitService.create', () => {
  it('rejects a non-owning company (PER-004)', async () => {
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findById.mockResolvedValue({ ...activeProject, companyId: 'other-company' });

    await expect(
      unitService.create('building-1', { number: '101', floor: 1, type: 'Apartment' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a duplicate unit number within the same building (COM-008)', async () => {
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedUnits.findByBuildingAndNumber.mockResolvedValue({ id: 'existing' } as never);

    await expect(
      unitService.create('building-1', { number: '101', floor: 1, type: 'Apartment' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'UNIT_NUMBER_ALREADY_EXISTS' });
  });

  it('rejects creating a unit under an archived building', async () => {
    mockedBuildings.findById.mockResolvedValue({ ...activeBuilding, status: BuildingStatus.ARCHIVED });
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(
      unitService.create('building-1', { number: '101', floor: 1, type: 'Apartment' }, companyRequester, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'BUILDING_ARCHIVED' });
  });

  it('creates a unit scoped to the building, starting AVAILABLE', async () => {
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findById.mockResolvedValue(activeProject);
    mockedUnits.findByBuildingAndNumber.mockResolvedValue(null);
    mockedUnits.create.mockResolvedValue(baseUnit());

    const result = await unitService.create(
      'building-1',
      { number: '101', floor: 1, type: 'Apartment' },
      companyRequester,
      { ipAddress: null },
    );

    expect(result.status).toBe('AVAILABLE');
    expect(result.owner).toBeNull();
    expect(result.inspectionHistory).toEqual([]);
  });
});

describe('unitService.listVacant', () => {
  it('rejects a non-Company role', async () => {
    await expect(unitService.listVacant(homeSeekerRequester, {})).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('scopes the query to the requester company and maps flattened project/building context', async () => {
    mockedUnits.findVacant.mockResolvedValue([
      {
        ...baseUnit(),
        building: { id: 'building-1', name: 'Tower A', project: { id: 'project-1', name: 'Sedra' } },
      } as never,
    ]);

    const result = await unitService.listVacant(companyRequester, { projectId: 'project-1' });

    expect(mockedUnits.findVacant).toHaveBeenCalledWith('company-1', { projectId: 'project-1' });
    expect(result).toEqual([
      {
        id: 'unit-1',
        number: '101',
        floor: 1,
        type: 'Apartment',
        buildingId: 'building-1',
        buildingName: 'Tower A',
        projectId: 'project-1',
        projectName: 'Sedra',
      },
    ]);
  });

  it('returns an honest empty list when no vacant units exist - never a mock fallback', async () => {
    mockedUnits.findVacant.mockResolvedValue([]);
    const result = await unitService.listVacant(companyRequester, {});
    expect(result).toEqual([]);
  });
});

describe('unitService.getById', () => {
  it('hides a unit whose parent building is a Draft to non-owners', async () => {
    mockedUnits.findById.mockResolvedValue(baseUnit());
    mockedBuildings.findById.mockResolvedValue({ ...activeBuilding, status: BuildingStatus.DRAFT });
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(unitService.getById('unit-1', homeSeekerRequester)).rejects.toMatchObject({
      errorCode: 'BUILDING_NOT_FOUND',
    });
  });
});

describe('unitService.update', () => {
  it('rejects updating a unit that is no longer AVAILABLE (data-integrity lock)', async () => {
    mockedUnits.findById.mockResolvedValue(baseUnit({ status: UnitStatus.RESERVED }));
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findById.mockResolvedValue(activeProject);

    await expect(
      unitService.update('unit-1', { floor: 2 }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'UNIT_LOCKED' });
  });

  it('rejects a company updating a unit it does not own', async () => {
    mockedUnits.findById.mockResolvedValue(baseUnit());
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findById.mockResolvedValue({ ...activeProject, companyId: 'other-company' });

    await expect(
      unitService.update('unit-1', { floor: 2 }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});
