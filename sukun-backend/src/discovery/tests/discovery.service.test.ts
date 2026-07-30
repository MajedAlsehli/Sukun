import { discoveryService } from '../discovery.service';
import { discoveryRepository } from '../discovery.repository';
import { discoveryRecommendationService } from '../discovery-recommendation.service';
import { DiscoveryProjectEntity } from '../discovery.mapper';

jest.mock('../discovery.repository');
jest.mock('../discovery-recommendation.service');

const mockedRepo = discoveryRepository as jest.Mocked<typeof discoveryRepository>;
const mockedRecommendation = discoveryRecommendationService as jest.Mocked<typeof discoveryRecommendationService>;

function buildProject(overrides: Partial<DiscoveryProjectEntity> = {}): DiscoveryProjectEntity {
  return {
    id: 'project-1',
    companyId: 'company-1',
    name: 'مشروع الواحة',
    code: 'WAHA-0001',
    city: 'الرياض',
    district: 'حي النرجس',
    description: null,
    status: 'ACTIVE',
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    company: { name: 'شركة البناء', status: 'ACTIVE' },
    media: [],
    buildings: [
      {
        id: 'building-1',
        projectId: 'project-1',
        name: 'المبنى أ',
        number: '1',
        status: 'ACTIVE',
        isActive: true,
        floors: 5,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        units: [
          {
            id: 'unit-1',
            buildingId: 'building-1',
            number: '101',
            floor: 1,
            type: 'RESIDENTIAL',
            status: 'AVAILABLE',
            area: 140,
            bedrooms: 3,
            bathrooms: 2,
            parkingSpots: 1,
            price: 750_000,
            source: 'MANUAL',
            externalId: null,
            sourceUpdatedAt: null,
            lastSyncedAt: null,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        ],
      },
    ],
    ...overrides,
  } as DiscoveryProjectEntity;
}

describe('discoveryService.list', () => {
  it('marks projects saved by the requester and returns public-safe fields only', async () => {
    const project = buildProject();
    mockedRepo.findMany.mockResolvedValue({ items: [project], total: 1 });
    mockedRepo.findSavedProjectIds.mockResolvedValue([{ projectId: 'project-1' }] as never);

    const result = await discoveryService.list('user-1', {
      page: 1,
      pageSize: 20,
      saved: false,
    } as never);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].isSaved).toBe(true);
    expect(result.items[0].priceFrom).toBe(750_000);
    expect(result.items[0].unitsAvailableCount).toBe(1);
    expect(result.items[0]).not.toHaveProperty('companyId');
    expect(result.items[0]).not.toHaveProperty('managerId');
    expect(result.items[0]).not.toHaveProperty('source');
  });

  it('returns the saved/favorites view, including a previously-saved project that is no longer discoverable', async () => {
    const unavailable = buildProject({ id: 'project-2', isActive: false });
    mockedRepo.findSavedByUser.mockResolvedValue({ items: [unavailable], total: 1 });

    const result = await discoveryService.list('user-1', { page: 1, pageSize: 20, saved: true } as never);

    expect(result.items[0].isSaved).toBe(true);
    expect(result.items[0].isCurrentlyDiscoverable).toBe(false);
  });
});

describe('discoveryService.getById', () => {
  it('404s honestly for a non-discoverable project (never reveals it exists)', async () => {
    mockedRepo.findDiscoverableById.mockResolvedValue(null);

    await expect(discoveryService.getById('project-1', 'user-1')).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_FOUND',
    });
  });

  it('returns real detail with visit slots and available units', async () => {
    mockedRepo.findDiscoverableById.mockResolvedValue(buildProject());
    mockedRepo.findOneSaved.mockResolvedValue(null);

    const result = await discoveryService.getById('project-1', 'user-1');

    expect(result.visitSlots.length).toBeGreaterThan(0);
    expect(result.availableUnits).toHaveLength(1);
    expect(result.isSaved).toBe(false);
  });
});

describe('discoveryService.save / unsave', () => {
  it('rejects saving a non-discoverable project', async () => {
    mockedRepo.findDiscoverableById.mockResolvedValue(null);

    await expect(discoveryService.save('user-1', 'project-1')).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_FOUND',
    });
    expect(mockedRepo.saveProject).not.toHaveBeenCalled();
  });

  it('saves idempotently (upsert, not a duplicate)', async () => {
    mockedRepo.findDiscoverableById.mockResolvedValue(buildProject());

    await discoveryService.save('user-1', 'project-1');
    await discoveryService.save('user-1', 'project-1');

    expect(mockedRepo.saveProject).toHaveBeenCalledTimes(2);
    expect(mockedRepo.saveProject).toHaveBeenCalledWith('user-1', 'project-1');
  });

  it('unsaving an already-unsaved project returns a stable response, not an error', async () => {
    const result = await discoveryService.unsave('user-1', 'project-1');
    expect(result).toEqual({ saved: false });
    expect(mockedRepo.unsaveProject).toHaveBeenCalledWith('user-1', 'project-1');
  });
});

describe('discoveryService.getRecommendations', () => {
  it('returns an honest unavailable state when the AI provider is unavailable', async () => {
    mockedRepo.findRecentDiscoverable.mockResolvedValue([buildProject()]);
    mockedRecommendation.getRecommendations.mockResolvedValue({
      available: false,
      reason: 'AI_SERVICE_UNAVAILABLE',
      items: [],
    });

    const result = await discoveryService.getRecommendations('user-1');

    expect(result.available).toBe(false);
    expect(result.reason).toBe('AI_SERVICE_UNAVAILABLE');
    expect(result.items).toEqual([]);
  });

  it('joins recommended project ids back to real project data, restricted to actually discoverable projects', async () => {
    const project = buildProject();
    mockedRepo.findRecentDiscoverable.mockResolvedValue([project]);
    mockedRepo.findSavedProjectIds.mockResolvedValue([]);
    mockedRecommendation.getRecommendations.mockResolvedValue({
      available: true,
      items: [{ projectId: 'project-1', reason: 'يناسب ميزانيتك ومدينتك المفضّلة.' }],
    });

    const result = await discoveryService.getRecommendations('user-1');

    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].project.id).toBe('project-1');
    expect(result.items[0].reason).toBe('يناسب ميزانيتك ومدينتك المفضّلة.');
  });
});
