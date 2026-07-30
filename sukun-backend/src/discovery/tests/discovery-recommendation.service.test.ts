import { discoveryRecommendationService } from '../discovery-recommendation.service';
import { chatJson } from '../../ai/openai.client';
import { AIUnavailableError } from '../../ai/ai-gateway.types';
import { DiscoveryProjectEntity } from '../discovery.mapper';

jest.mock('../../ai/openai.client');

const mockedChatJson = chatJson as jest.MockedFunction<typeof chatJson>;

function buildProject(id: string, overrides: Partial<DiscoveryProjectEntity> = {}): DiscoveryProjectEntity {
  return {
    id,
    companyId: 'company-1',
    name: `مشروع ${id}`,
    code: id.toUpperCase(),
    city: 'الرياض',
    district: null,
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
    buildings: [],
    ...overrides,
  } as DiscoveryProjectEntity;
}

describe('discoveryRecommendationService.getRecommendations', () => {
  it('returns an honest NO_DISCOVERABLE_PROJECTS state without calling the model when there are no candidates', async () => {
    const result = await discoveryRecommendationService.getRecommendations([]);

    expect(result).toEqual({ available: false, reason: 'NO_DISCOVERABLE_PROJECTS', items: [] });
    expect(mockedChatJson).not.toHaveBeenCalled();
  });

  it('returns an honest AI_SERVICE_UNAVAILABLE state when no provider key is configured', async () => {
    mockedChatJson.mockRejectedValue(new AIUnavailableError('OPENAI_API_KEY is not configured'));

    const result = await discoveryRecommendationService.getRecommendations([buildProject('project-1')]);

    expect(result).toEqual({ available: false, reason: 'AI_SERVICE_UNAVAILABLE', items: [] });
  });

  it('returns an honest unavailable state (not a 500) on any other model failure, e.g. a timeout', async () => {
    mockedChatJson.mockRejectedValue(new Error('Recommendation request timed out'));

    const result = await discoveryRecommendationService.getRecommendations([buildProject('project-1')]);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('AI_SERVICE_UNAVAILABLE');
  });

  it('never allows the model to invent a project id - silently drops any id outside the given candidate set', async () => {
    mockedChatJson.mockResolvedValue({
      recommendations: [
        { projectId: 'project-1', reason: 'سبب حقيقي مبني على البيانات المعطاة.' },
        { projectId: 'hallucinated-project-id', reason: 'مشروع غير موجود في القائمة.' },
      ],
    } as never);

    const result = await discoveryRecommendationService.getRecommendations([buildProject('project-1')]);

    expect(result.available).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].projectId).toBe('project-1');
  });

  it('drops a recommendation with an empty/missing reason', async () => {
    mockedChatJson.mockResolvedValue({
      recommendations: [{ projectId: 'project-1', reason: '' }],
    } as never);

    const result = await discoveryRecommendationService.getRecommendations([buildProject('project-1')]);

    expect(result.items).toHaveLength(0);
  });
});
