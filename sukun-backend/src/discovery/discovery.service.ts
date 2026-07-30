import { discoveryRepository } from './discovery.repository';
import { DiscoveryProjectEntity, toDiscoveryProjectDetailDto, toDiscoveryProjectSummaryDto } from './discovery.mapper';
import { discoveryRecommendationService } from './discovery-recommendation.service';
import { NotFoundError } from '../shared/errors';
import { ListDiscoveryProjectsQueryDto } from './discovery.dto';

async function savedProjectIdSet(userId: string, projectIds: string[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const rows = await discoveryRepository.findSavedProjectIds(userId, projectIds);
  return new Set(rows.map((r) => r.projectId));
}

export const discoveryService = {
  // GET /api/discovery/projects - decisions.md G2 (discoverability rule),
  // G5 (real aggregate filters), G6 (public-safe mapping).
  async list(userId: string, query: ListDiscoveryProjectsQueryDto) {
    const { page, pageSize, saved: savedOnly, ...filters } = query;

    if (savedOnly) {
      const { items, total } = await discoveryRepository.findSavedByUser(userId, page, pageSize);
      return { items: items.map((p) => toDiscoveryProjectSummaryDto(p, true)), page, pageSize, total };
    }

    const { items, total } = await discoveryRepository.findMany(filters, page, pageSize);
    const savedIds = await savedProjectIdSet(userId, items.map((p) => p.id));
    return {
      items: items.map((p) => toDiscoveryProjectSummaryDto(p, savedIds.has(p.id))),
      page,
      pageSize,
      total,
    };
  },

  // GET /api/discovery/projects/{id} - honest 404 (not 403) for any
  // non-discoverable project, same pattern as project.service.ts's
  // Draft-hiding for outsiders.
  async getById(id: string, userId: string) {
    const project = await discoveryRepository.findDiscoverableById(id);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }
    const savedRow = await discoveryRepository.findOneSaved(userId, id);
    return toDiscoveryProjectDetailDto(project, !!savedRow);
  },

  // GET /api/discovery/recommendations - decisions.md G13.
  async getRecommendations(userId: string) {
    const candidates = await discoveryRepository.findRecentDiscoverable(30);
    const result = await discoveryRecommendationService.getRecommendations(candidates);

    if (!result.available) {
      return { available: false as const, reason: result.reason, items: [] };
    }

    const savedIds = await savedProjectIdSet(userId, result.items.map((i) => i.projectId));
    const byId = new Map<string, DiscoveryProjectEntity>(candidates.map((p) => [p.id, p]));

    return {
      available: true as const,
      items: result.items.map((i) => ({
        project: toDiscoveryProjectSummaryDto(byId.get(i.projectId)!, savedIds.has(i.projectId)),
        reason: i.reason,
      })),
    };
  },

  // POST /api/discovery/saved/{projectId} - idempotent (upsert). Archived/
  // inactive/private projects cannot be newly saved (decisions.md G2/G6).
  async save(userId: string, projectId: string) {
    const project = await discoveryRepository.findDiscoverableById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }
    await discoveryRepository.saveProject(userId, projectId);
    return { saved: true };
  },

  // DELETE /api/discovery/saved/{projectId} - idempotent/stable response
  // regardless of whether the project was ever saved (removes only a
  // reversible user preference, not a permanent business entity).
  async unsave(userId: string, projectId: string) {
    await discoveryRepository.unsaveProject(userId, projectId);
    return { saved: false };
  },
};
