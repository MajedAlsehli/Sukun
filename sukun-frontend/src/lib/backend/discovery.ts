/**
 * `/api/discovery/*`, typed. One function per real endpoint, `AbortSignal` on
 * every call, no fixture fallback anywhere.
 *
 * Verified against `sakn-backend/src`:
 *   discovery/discovery.routes.ts   — the five live routes
 *   discovery/discovery.dto.ts      — the query schema (page/pageSize defaults)
 *   discovery/discovery.mapper.ts   — DiscoveryProjectSummaryDto / DetailDto
 *   discovery/discovery.service.ts  — the `{items,page,pageSize,total}` envelope
 *   discovery/discovery-recommendation.service.ts — the honest-unavailable shape
 *
 * Every route is `authMiddleware + requireRole(HOME_SEEKER, HOMEOWNER)`, so a
 * pm/company/technician session gets `403 ACCESS_DENIED` — which is the
 * Backend's own decision and is never second-guessed here.
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";

/** `discovery.mapper.ts#DiscoveryGalleryImage` */
export interface DiscoveryGalleryImageDto {
  url: string;
  isPlaceholder: boolean;
}

/** `discovery.mapper.ts#DiscoveryAvailableUnit` */
export interface DiscoveryAvailableUnitDto {
  id: string;
  number: string;
  type: string;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
}

/**
 * `discovery.mapper.ts#DiscoveryProjectSummaryDto` — public-safe by
 * construction: it carries no companyId, managerId, primaryContractorId,
 * source or externalId (decisions.md G6).
 */
export interface DiscoveryProjectSummaryDto {
  id: string;
  name: string;
  city: string;
  district: string | null;
  description: string | null;
  readiness: string | null;
  amenities: string[];
  developerName: string;
  coverImageUrl: string | null;
  gallery: DiscoveryGalleryImageDto[];
  priceFrom: number | null;
  priceTo: number | null;
  unitTypes: string[];
  unitsAvailableCount: number;
  isSaved: boolean;
  /** A saved project can stop being discoverable; the favourites view says so. */
  isCurrentlyDiscoverable: boolean;
  createdAt: string;
}

export interface DiscoveryProjectDetailDto extends DiscoveryProjectSummaryDto {
  availableUnits: DiscoveryAvailableUnitDto[];
  /** The fixed, uniform scheduling rule (decisions.md G8) — not per-project availability. */
  visitSlots: string[];
}

export type DiscoveryPriceBand = "UNDER_500K" | "FROM_500K_TO_1M" | "FROM_1M_TO_2M" | "ABOVE_2M";
export type DiscoveryReadiness = "READY" | "UNDER_CONSTRUCTION" | "OFF_PLAN";

export interface ListDiscoveryProjectsQuery {
  q?: string;
  city?: string;
  priceBand?: DiscoveryPriceBand;
  unitType?: string;
  readiness?: DiscoveryReadiness;
  /** `true` restricts the result to the requester's own saved projects. */
  saved?: boolean;
  page?: number;
  pageSize?: number;
}

export type RecommendationReasonCode = "AI_SERVICE_UNAVAILABLE" | "NO_DISCOVERABLE_PROJECTS";

/**
 * The Backend answers ONE of two shapes here, and "unavailable" is a contract,
 * not an error (decisions.md G13) — it is a 200 with `available: false`. It
 * must never be replaced by a fabricated recommendation.
 */
export type DiscoveryRecommendationsDto =
  | { available: false; reason: RecommendationReasonCode; items: [] }
  | { available: true; items: { project: DiscoveryProjectSummaryDto; reason: string }[] };

export interface RequestScope {
  signal?: AbortSignal;
}

/**
 * The zod schema rejects an empty-string filter (`.min(1)`), so a blank UI
 * field must be omitted from the query entirely rather than sent as `""`.
 */
function definedOnly(query: ListDiscoveryProjectsQuery): Record<string, string | number | boolean | undefined> {
  return {
    q: query.q?.trim() || undefined,
    city: query.city?.trim() || undefined,
    priceBand: query.priceBand,
    unitType: query.unitType?.trim() || undefined,
    readiness: query.readiness,
    // The schema is `z.enum(['true','false'])`, so the flag is only ever sent
    // when it is actually on.
    saved: query.saved ? "true" : undefined,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export const backendDiscovery = {
  /** `GET /api/discovery/projects` */
  listProjects(
    query: ListDiscoveryProjectsQuery = {},
    scope: RequestScope = {},
  ): Promise<Paginated<DiscoveryProjectSummaryDto>> {
    return apiClient.get<Paginated<DiscoveryProjectSummaryDto>>("/discovery/projects", {
      query: definedOnly(query),
      signal: scope.signal,
    });
  },

  /** `GET /api/discovery/projects/{id}` — a non-discoverable project 404s (existence is hidden). */
  getProject(projectId: string, scope: RequestScope = {}): Promise<DiscoveryProjectDetailDto> {
    return apiClient.get<DiscoveryProjectDetailDto>(
      `/discovery/projects/${encodeURIComponent(projectId)}`,
      { signal: scope.signal },
    );
  },

  /** `GET /api/discovery/recommendations` — rate-limited; returns the honest-unavailable shape. */
  getRecommendations(scope: RequestScope = {}): Promise<DiscoveryRecommendationsDto> {
    return apiClient.get<DiscoveryRecommendationsDto>("/discovery/recommendations", {
      signal: scope.signal,
    });
  },

  /** `POST /api/discovery/saved/{projectId}` — idempotent upsert, 201. */
  saveProject(projectId: string, scope: RequestScope = {}): Promise<{ saved: boolean }> {
    return apiClient.post<{ saved: boolean }>(
      `/discovery/saved/${encodeURIComponent(projectId)}`,
      undefined,
      { signal: scope.signal },
    );
  },

  /**
   * `DELETE /api/discovery/saved/{projectId}` — the ONLY DELETE route in the
   * whole API, and it removes a reversible user preference, never a business
   * entity (decisions.md A7/D5).
   */
  unsaveProject(projectId: string, scope: RequestScope = {}): Promise<{ saved: boolean }> {
    return apiClient.delete<{ saved: boolean }>(
      `/discovery/saved/${encodeURIComponent(projectId)}`,
      { signal: scope.signal },
    );
  },
};
