"use client";

/**
 * RE1–RE5's data layer.
 *
 *   lib/backend/{company,admin}.ts -> THIS -> unchanged Company screens
 *
 * Demo Mode is inert throughout: every hook here passes `enabled: !DEMO_MODE`,
 * so the Showcase makes no Company request at all and keeps rendering its own
 * seed arrays. Real mode has no fixture fallback on any path.
 *
 * `useMutation` is the shared write primitive. It exists so that no screen can
 * "succeed" locally on an operation the Backend rejected: the optimistic UI
 * change happens only after the request resolves, and a rejection surfaces the
 * real Arabic message instead.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import {
  backendCompany,
  type CompanyActivityItemDto,
  type CompanyOverviewDto,
  type CompanyProjectSummaryDto,
  type ListProjectsQuery,
  type ListWorkspaceUnitsQuery,
  type ProjectDto,
  type WorkspaceDto,
} from "@/lib/backend/company";
import {
  backendAdmin,
  type HomeownerProfileDto,
  type HomeownerRecordDto,
  type ListHomeownersQuery,
  type ListTechniciansQuery,
  type TechnicianDto,
  type TechnicianProfileDto,
} from "@/lib/backend/admin";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

/* ------------------------------------------------------------- mutations */

export interface Mutation {
  /** True while a write is in flight, so a control can disable itself honestly. */
  pending: boolean;
  /** Approved Arabic copy for the last failure, or `null`. */
  error: string | null;
  /** Resolves `true` only when the Backend ACCEPTED the write. */
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  reset: () => void;
}

export function useMutation(): Mutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (DEMO_MODE) return true;
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      // The screen must NOT advance. A rejected write is a rejected write.
      setError(arabicMessageFor(err));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, run, reset: () => setError(null) };
}

const idle = { status: "idle" as AsyncStatus, errorMessage: null, reload: () => {} };

/* --------------------------------------------------------------- RE1 */

export interface CompanyDashboardResult {
  status: AsyncStatus;
  overview: CompanyOverviewDto | null;
  projects: CompanyProjectSummaryDto[];
  activity: CompanyActivityItemDto[];
  errorMessage: string | null;
  reload: () => void;
}

export function useCompanyDashboard(): CompanyDashboardResult {
  const overview = useAsyncResource((s) => backendCompany.overview({ signal: s }), [], { enabled: !DEMO_MODE });
  const summary = useAsyncResource((s) => backendCompany.projectsSummary({ signal: s }), [], { enabled: !DEMO_MODE });
  const activity = useAsyncResource((s) => backendCompany.activity(20, { signal: s }), [], { enabled: !DEMO_MODE });

  if (DEMO_MODE) return { ...idle, overview: null, projects: [], activity: [] };

  return {
    status: overview.status,
    overview: overview.data,
    projects: summary.data?.items ?? [],
    activity: activity.data?.items ?? [],
    errorMessage: overview.errorMessage ?? summary.errorMessage ?? activity.errorMessage,
    reload: () => {
      overview.reload();
      summary.reload();
      activity.reload();
    },
  };
}

/**
 * `GET /api/company/projects-summary`, reduced to the `{id,name,manager,city}`
 * shape the Company screens use to LABEL a project they already hold an id for
 * (a technician's `projectId`, a project card's manager column).
 *
 * It exists so those labels come from the company's own real projects instead
 * of a fixture lookup that answered `PROJECTS[0]` for every id it did not know.
 * `managerName`/`primaryContractorName` are already on this endpoint — the
 * Company dashboard renders both — so no new Backend contract is needed.
 */
export interface CompanyProjectRefsResult {
  status: AsyncStatus;
  projects: {
    id: string;
    name: string;
    manager: string;
    contractor: string;
    city: string;
    /** The SERVER-computed health level, never a client guess. */
    health: string;
  }[];
  errorMessage: string | null;
  reload: () => void;
}

export function useCompanyProjectsSummary(): CompanyProjectRefsResult {
  const res = useAsyncResource((s) => backendCompany.projectsSummary({ signal: s }), [], {
    enabled: !DEMO_MODE,
  });
  if (DEMO_MODE) return { ...idle, projects: [] };
  return {
    status: res.status,
    projects: (res.data?.items ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      // "—" is this layer's not-available token; an unassigned manager is a
      // real state and must not read as a name.
      manager: p.managerName ?? "—",
      contractor: p.primaryContractorName ?? "—",
      city: p.city,
      health: p.health,
    })),
    errorMessage: res.errorMessage,
    reload: res.reload,
  };
}

/* --------------------------------------------------------------- RE2 */

export interface ProjectsResult {
  status: AsyncStatus;
  projects: ProjectDto[];
  total: number;
  errorMessage: string | null;
  reload: () => void;
}

export function useProjects(query: ListProjectsQuery = {}): ProjectsResult {
  const key = JSON.stringify(query);
  const res = useAsyncResource(
    (s) => backendCompany.listProjects({ pageSize: 100, ...query }, { signal: s }),
    [key],
    { enabled: !DEMO_MODE },
  );
  if (DEMO_MODE) return { ...idle, projects: [], total: 0 };
  return {
    status: res.status,
    projects: res.data?.items ?? [],
    total: res.data?.total ?? 0,
    errorMessage: res.errorMessage,
    reload: res.reload,
  };
}

/* --------------------------------------------------------------- RE3 */

export interface WorkspaceResult {
  status: AsyncStatus;
  workspace: WorkspaceDto | null;
  buildings: import("@/lib/backend/company").BuildingDto[];
  units: import("@/lib/backend/company").WorkspaceUnitDto[];
  homeowners: import("@/lib/backend/company").WorkspaceHomeownerDto[];
  activity: CompanyActivityItemDto[];
  errorMessage: string | null;
  notFound: boolean;
  reload: () => void;
}

function is404(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { httpStatus?: number }).httpStatus === 404;
}

/** Normalizes the two shapes a list endpoint may use (`{items}` or paginated). */
function itemsOf<T>(v: { items?: T[] } | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : (v.items ?? []);
}

export function useProjectWorkspace(
  projectId: string,
  unitQuery: ListWorkspaceUnitsQuery = {},
): WorkspaceResult {
  const enabled = !DEMO_MODE && !!projectId;
  const ws = useAsyncResource((s) => backendCompany.getWorkspace(projectId, { signal: s }), [projectId], { enabled });
  const buildings = useAsyncResource(
    (s) => backendCompany.listBuildings(projectId, { signal: s }),
    [projectId],
    { enabled },
  );
  const unitKey = JSON.stringify(unitQuery);
  const units = useAsyncResource(
    (s) => backendCompany.listWorkspaceUnits(projectId, { pageSize: 100, ...unitQuery }, { signal: s }),
    [projectId, unitKey],
    { enabled },
  );
  const owners = useAsyncResource(
    (s) => backendCompany.listWorkspaceHomeowners(projectId, { signal: s }),
    [projectId],
    { enabled },
  );
  const activity = useAsyncResource(
    (s) => backendCompany.listProjectActivity(projectId, { signal: s }),
    [projectId],
    { enabled },
  );

  if (DEMO_MODE) {
    return { ...idle, workspace: null, buildings: [], units: [], homeowners: [], activity: [], notFound: false };
  }

  return {
    status: ws.status,
    workspace: ws.data,
    buildings: itemsOf(buildings.data),
    units: units.data?.items ?? [],
    homeowners: itemsOf(owners.data),
    activity: itemsOf(activity.data),
    errorMessage: ws.errorMessage,
    notFound: ws.status === "error" && is404(ws.error),
    reload: () => {
      ws.reload();
      buildings.reload();
      units.reload();
      owners.reload();
      activity.reload();
    },
  };
}

/* --------------------------------------------------------------- RE4 */

export interface HomeownersResult {
  status: AsyncStatus;
  homeowners: HomeownerRecordDto[];
  total: number;
  errorMessage: string | null;
  reload: () => void;
}

export function useHomeowners(query: ListHomeownersQuery = {}): HomeownersResult {
  const key = JSON.stringify(query);
  const res = useAsyncResource(
    (s) => backendAdmin.listHomeowners({ pageSize: 100, ...query }, { signal: s }),
    [key],
    { enabled: !DEMO_MODE },
  );
  if (DEMO_MODE) return { ...idle, homeowners: [], total: 0 };
  return {
    status: res.status,
    homeowners: res.data?.items ?? [],
    total: res.data?.total ?? 0,
    errorMessage: res.errorMessage,
    reload: res.reload,
  };
}

export interface HomeownerProfileResult {
  status: AsyncStatus;
  profile: HomeownerProfileDto | null;
  errorMessage: string | null;
  notFound: boolean;
  reload: () => void;
}

/**
 * By id, or — for RE4's `#unit` deep link — by unit number through the
 * Backend's own `by-unit` route rather than a local scan of the loaded page.
 */
export function useHomeownerProfile(
  selector: { id?: string | null; unitNumber?: string | null },
): HomeownerProfileResult {
  const id = selector.id ?? null;
  const unitNumber = selector.unitNumber ?? null;
  const enabled = !DEMO_MODE && (!!id || !!unitNumber);
  const res = useAsyncResource(
    (s) =>
      id
        ? backendAdmin.getHomeowner(id, { signal: s })
        : backendAdmin.getHomeownerByUnit(unitNumber as string, { signal: s }),
    [id, unitNumber],
    { enabled },
  );
  if (DEMO_MODE) return { ...idle, profile: null, notFound: false };
  return {
    status: res.status,
    profile: res.data,
    errorMessage: res.errorMessage,
    notFound: res.status === "error" && is404(res.error),
    reload: res.reload,
  };
}

/* --------------------------------------------------------------- RE5 */

export interface TechniciansResult {
  status: AsyncStatus;
  technicians: TechnicianDto[];
  summary: { totalTechnicians: number; availableCount: number; busyCount: number } | null;
  total: number;
  errorMessage: string | null;
  reload: () => void;
}

export function useTechnicians(query: ListTechniciansQuery = {}): TechniciansResult {
  const key = JSON.stringify(query);
  const list = useAsyncResource(
    (s) => backendAdmin.listTechnicians({ pageSize: 100, ...query }, { signal: s }),
    [key],
    { enabled: !DEMO_MODE },
  );
  const summary = useAsyncResource((s) => backendAdmin.technicianSummary({ signal: s }), [], {
    enabled: !DEMO_MODE,
  });
  if (DEMO_MODE) return { ...idle, technicians: [], summary: null, total: 0 };
  return {
    status: list.status,
    technicians: list.data?.items ?? [],
    summary: summary.data,
    total: list.data?.total ?? 0,
    errorMessage: list.errorMessage,
    reload: () => {
      list.reload();
      summary.reload();
    },
  };
}

export interface TechnicianProfileResult {
  status: AsyncStatus;
  profile: TechnicianProfileDto | null;
  reviews: import("@/lib/backend/admin").TechnicianReviewItemDto[];
  errorMessage: string | null;
  notFound: boolean;
  reload: () => void;
}

export function useTechnicianProfile(id: string | null): TechnicianProfileResult {
  const enabled = !DEMO_MODE && !!id;
  const res = useAsyncResource((s) => backendAdmin.getTechnician(id as string, { signal: s }), [id], { enabled });
  const reviews = useAsyncResource(
    (s) => backendAdmin.technicianReviews(id as string, { signal: s }),
    [id],
    { enabled },
  );
  if (DEMO_MODE) return { ...idle, profile: null, reviews: [], notFound: false };
  return {
    status: res.status,
    profile: res.data,
    reviews: itemsOf(reviews.data),
    errorMessage: res.errorMessage,
    notFound: res.status === "error" && is404(res.error),
    reload: () => {
      res.reload();
      reviews.reload();
    },
  };
}

export { itemsOf };
