/**
 * `backend/src/projects` (Task 003, real and running) — RE2's real data
 * source. `08_API_Specification.md` §9 / `capProject/src/projects/project.dto.ts`.
 */
import { authorizedRequest } from "@/lib/api";

export type ProjectStatus = "in_progress" | "completed" | "stopped" | "archived";

export interface PublicProject {
  id: string;
  companyId: string;
  name: string;
  code: string;
  city: string;
  district: string;
  description: string | null;
  status: ProjectStatus;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingInput {
  name: string;
  number: string;
  floors: number;
  units: { perFloor: number; area: number; beds: number; baths: number; parking: number };
}

/**
 * Task 3 correction — matched to `projects/project.dto.ts#createProjectSchema`
 * as it exists today. Both `managerId` and `primaryContractorId` are REQUIRED
 * by the real schema, and there is no `technicianId` on it at all; the wizard's
 * own step 5 collects the contractor, so the field is named for what it is.
 */
export interface CreateProjectInput {
  name: string;
  city: string;
  district?: string;
  description?: string;
  buildings: BuildingInput[];
  managerId: string;
  primaryContractorId: string;
}

export interface UpdateProjectInput {
  name?: string;
  city?: string;
  district?: string;
  description?: string | null;
  managerId?: string | null;
}

export interface BuildingUnitCounts {
  total: number;
  available: number;
  reserved: number;
  delivered: number;
  occupied: number;
}

export interface PublicBuildingSummary {
  id: string;
  name: string;
  number: string;
  floors: number;
  status: "draft" | "active" | "archived";
  units: BuildingUnitCounts;
}

export interface PublicProjectDetail extends PublicProject {
  buildings: PublicBuildingSummary[];
}

export function listProjects(): Promise<PublicProject[]> {
  return authorizedRequest<PublicProject[]>("GET", "/projects");
}

/** `GET /projects/{id}` — full record + buildings summary (RE3's overview/buildings tabs). */
export function getProject(id: string): Promise<PublicProjectDetail> {
  return authorizedRequest<PublicProjectDetail>("GET", `/projects/${id}`);
}

export function createProject(input: CreateProjectInput): Promise<PublicProject> {
  return authorizedRequest<PublicProject>("POST", "/projects", input);
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<PublicProject> {
  return authorizedRequest<PublicProject>("PATCH", `/projects/${id}`, input);
}

/**
 * Task 3 correction — the real `updateProjectStatusSchema` is `{ active: boolean }`.
 * The Backend decides what activating or deactivating MEANS; this only says
 * which one was asked for. Publishing and archiving are their own endpoints.
 */
export function updateProjectStatus(id: string, active: boolean): Promise<PublicProject> {
  return authorizedRequest<PublicProject>("PATCH", `/projects/${id}/status`, { active });
}
