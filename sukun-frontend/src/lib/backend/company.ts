/**
 * `/api/company/*`, `/api/projects/*`, `/api/buildings/*`, `/api/units/*` and
 * the two pickers — the Company (RE1–RE3) surface, typed.
 *
 * Verified against `sakn-backend/src`:
 *   company/company.{routes,service}.ts      — overview / projects summary / activity
 *   projects/project.{routes,mapper}.ts      — the project lifecycle
 *   projects/workspace.{service,dto}.ts      — RE3's single load-bearing endpoint
 *   buildings/building.{routes,mapper}.ts
 *   units/unit.{routes,mapper}.ts
 *   contractors/ · project-managers/         — the two `?q=` pickers
 *
 * Every route here is `companyOnly`. `GET /api/projects` and
 * `GET /api/projects/:id` in particular are Company-only by a deliberate
 * correction (decisions.md G16) — a PM or technician must never be pointed at
 * them, which is why nothing in `pm.ts` or `technician.ts` imports this module.
 *
 * Two figures are `null` BY DESIGN and must be rendered as the screen's own
 * placeholder rather than a number: `overview.satisfaction` and
 * `workspace.kpis.satisfaction`. No rating model exists in the schema
 * (decisions.md E8).
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";
import type { RequestScope } from "./discovery";

/* ------------------------------------------------------------- RE1 overview */

export interface CompanyOverviewDto {
  projectsCount: number;
  buildingsCount: number;
  unitsCount: number;
  occupiedCount: number;
  occupiedPercent: number;
  vacantCount: number;
  homeownersCount: number;
  openReportsCount: number;
  closedReportsCount: number;
  /** Always `null` — there is no rating model. Never render a number here. */
  satisfaction: number | null;
}

export type ProjectHealthDto = "HEALTHY" | "AT_RISK" | "CRITICAL" | string;

export interface CompanyProjectSummaryDto {
  id: string;
  name: string;
  city: string;
  status: string;
  isActive: boolean;
  health: ProjectHealthDto;
  buildingsCount: number;
  unitsCount: number;
  managerName: string | null;
  primaryContractorName: string | null;
  createdAt: string;
}

/**
 * The audit row RE1's and RE3's feeds render. Read against
 * `sakn-backend/src/shared/activity.mapper.ts#ActivityEntryDto` — the Backend
 * already resolves each action code to an Arabic `description` (falling back to
 * the raw code for an unmapped action, so an unknown event is still shown), and
 * that is what the UI must render. `action`/`entity` are the machine codes and
 * belong nowhere on screen.
 */
export interface CompanyActivityItemDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  description: string;
  timestamp: string;
}

/* ------------------------------------------------------------- the project */

export interface ProjectDto {
  id: string;
  companyId: string;
  name: string;
  code: string;
  city: string;
  district: string | null;
  description: string | null;
  status: string;
  isActive: boolean;
  coverImageUrl: string | null;
  coverStorageAvailable: boolean;
  managerId: string | null;
  primaryContractorId: string | null;
  source: string;
  buildingsCount: number;
  unitsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingDto {
  id: string;
  projectId: string;
  name: string;
  number: string;
  status: string;
  isActive: boolean;
  unitsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnitDto {
  id: string;
  buildingId: string;
  number: string;
  floor: number;
  type: string;
  status: string;
  area?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  price?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VacantUnitDto {
  id: string;
  number: string;
  floor: number;
  type: string;
  buildingId: string;
  buildingName: string;
  projectId: string;
  projectName: string;
}

export interface WorkspaceDto {
  project: ProjectDto;
  health: {
    level: string;
    openReportsCount: number;
    criticalReportsCount: number;
    legacy: { openInspectionReportsCount: number; openWarrantyReportsCount: number };
  };
  kpis: {
    buildingsCount: number;
    unitsCount: number;
    occupiedCount: number;
    occupiedPercent: number;
    vacantCount: number;
    openReportsCount: number;
    criticalReportsCount: number;
    /** Legacy surfaces, kept visible and NEVER summed into the canonical count. */
    legacyOpenReportsCount: number;
    /** Always `null` — no rating model exists. */
    satisfaction: number | null;
    warrantyCoveragePercent: number | null;
  };
  timeline?: unknown[];
}

/**
 * `GET /projects/{id}/units` — matched field-for-field to what
 * `units/unit.mapper.ts` actually emits. The first four measurement fields and
 * `occupancyLabel`/`currentOwnerName` were missing from this interface, so RE3
 * read `u.beds`/`u.baths`/`u.parking` (which do not exist) and rendered
 * `undefined` into its unit grid. The Backend's own spelling is authoritative
 * here; the screen adapts, not the DTO.
 */
export interface WorkspaceUnitDto {
  id: string;
  number: string;
  floor: number;
  type: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  /** Prisma `UnitStatus` — UPPERCASE (`AVAILABLE`/`RESERVED`/`OCCUPIED`/...). */
  status: string;
  /** Server-resolved Arabic occupancy label; preferred over re-deriving one. */
  occupancyLabel?: string | null;
  buildingId: string;
  buildingName: string;
  currentOwnerName?: string | null;
  ownerName?: string | null;
  warranty?: { state: "NONE" | "ACTIVE" | "EXPIRED" } | null;
}

/**
 * `GET /projects/{id}/homeowners` — the real response is unit-centric
 * (`ownerName`/`ownerEmail`/`ownerPhone`/`invitationState`), NOT the
 * `{id,name,email,phone,status}` person shape this interface previously
 * declared. Reading the old names yielded `undefined` for every field.
 */
export interface WorkspaceHomeownerDto {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  /** `ACTIVE` | `PENDING` | `NOT_ACTIVATED` (Backend `invitationState`). */
  invitationState: string;
}

export interface PickerItemDto {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

/* ----------------------------------------------------------------- requests */

export interface CreateProjectRequest {
  name: string;
  city: string;
  district?: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  city?: string;
  district?: string;
  description?: string;
}

export interface CreateBuildingRequest {
  name: string;
  number: string;
}

export interface CreateUnitRequest {
  number: string;
  floor: number;
  type: string;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  price?: number;
}

export interface ListProjectsQuery {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ListWorkspaceUnitsQuery {
  buildingId?: string;
  q?: string;
  occupancy?: "ALL" | "OCCUPIED" | "AVAILABLE" | "RESERVED";
  page?: number;
  pageSize?: number;
}

const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);

export const backendCompany = {
  /* RE1 */
  overview: (s: RequestScope = {}) =>
    apiClient.get<CompanyOverviewDto>("/company/overview", { signal: s.signal }),
  projectsSummary: (s: RequestScope = {}) =>
    apiClient.get<{ items: CompanyProjectSummaryDto[] }>("/company/projects/summary", { signal: s.signal }),
  activity: (limit = 20, s: RequestScope = {}) =>
    apiClient.get<{ items: CompanyActivityItemDto[] }>("/company/activity", {
      query: { limit },
      signal: s.signal,
    }),

  /* RE2 — projects */
  listProjects: (q: ListProjectsQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<ProjectDto>>("/projects", {
      query: { q: clean(q.q), status: q.status, page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),
  getProject: (id: string, s: RequestScope = {}) =>
    apiClient.get<ProjectDto>(`/projects/${encodeURIComponent(id)}`, { signal: s.signal }),
  createProject: (body: CreateProjectRequest, s: RequestScope = {}) =>
    apiClient.post<ProjectDto>("/projects", body, { signal: s.signal }),
  updateProject: (id: string, body: UpdateProjectRequest, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}`, body, { signal: s.signal }),
  /** Activate / deactivate. The Backend owns what the transition means. */
  setProjectStatus: (id: string, active: boolean, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}/status`, { active }, { signal: s.signal }),
  publishProject: (id: string, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}/publish`, undefined, { signal: s.signal }),
  archiveProject: (id: string, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}/archive`, undefined, { signal: s.signal }),
  assignManager: (id: string, managerId: string, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}/manager`, { managerId }, { signal: s.signal }),
  /**
   * `reassignContractorSchema` is `{ primaryContractorId }` — NOT
   * `contractorId`, which is what this used to send and what would have made
   * every contractor re-assignment 400. The manager route above really is
   * `{ managerId }`; the two are not symmetric.
   */
  assignContractor: (id: string, contractorId: string, s: RequestScope = {}) =>
    apiClient.patch<ProjectDto>(`/projects/${encodeURIComponent(id)}/contractor`, { primaryContractorId: contractorId }, { signal: s.signal }),

  /* RE3 — workspace */
  getWorkspace: (id: string, s: RequestScope = {}) =>
    apiClient.get<WorkspaceDto>(`/projects/${encodeURIComponent(id)}/workspace`, { signal: s.signal }),
  listWorkspaceUnits: (id: string, q: ListWorkspaceUnitsQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<WorkspaceUnitDto>>(`/projects/${encodeURIComponent(id)}/units`, {
      query: { buildingId: q.buildingId, q: clean(q.q), occupancy: q.occupancy, page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),
  listWorkspaceHomeowners: (id: string, s: RequestScope = {}) =>
    apiClient.get<{ items: WorkspaceHomeownerDto[] }>(`/projects/${encodeURIComponent(id)}/homeowners`, {
      signal: s.signal,
    }),
  listProjectActivity: (id: string, s: RequestScope = {}) =>
    apiClient.get<{ items: CompanyActivityItemDto[] }>(`/projects/${encodeURIComponent(id)}/activity`, {
      signal: s.signal,
    }),

  /* buildings + units */
  listBuildings: (projectId: string, s: RequestScope = {}) =>
    apiClient.get<Paginated<BuildingDto> | { items: BuildingDto[] }>(
      `/projects/${encodeURIComponent(projectId)}/buildings`,
      { signal: s.signal },
    ),
  createBuilding: (projectId: string, body: CreateBuildingRequest, s: RequestScope = {}) =>
    apiClient.post<BuildingDto>(`/projects/${encodeURIComponent(projectId)}/buildings`, body, { signal: s.signal }),
  updateBuilding: (id: string, body: Partial<CreateBuildingRequest>, s: RequestScope = {}) =>
    apiClient.patch<BuildingDto>(`/buildings/${encodeURIComponent(id)}`, body, { signal: s.signal }),
  createUnit: (buildingId: string, body: CreateUnitRequest, s: RequestScope = {}) =>
    apiClient.post<UnitDto>(`/buildings/${encodeURIComponent(buildingId)}/units`, body, { signal: s.signal }),
  listVacantUnits: (s: RequestScope = {}) =>
    apiClient.get<{ items: VacantUnitDto[] } | Paginated<VacantUnitDto>>("/units/vacant", { signal: s.signal }),

  /* the two pickers */
  searchManagers: (q: string, s: RequestScope = {}) =>
    apiClient.get<{ items: PickerItemDto[] } | PickerItemDto[]>("/managers", {
      query: { q: clean(q) },
      signal: s.signal,
    }),
  searchContractors: (q: string, s: RequestScope = {}) =>
    apiClient.get<{ items: PickerItemDto[] } | PickerItemDto[]>("/contractors", {
      query: { q: clean(q) },
      signal: s.signal,
    }),
};
