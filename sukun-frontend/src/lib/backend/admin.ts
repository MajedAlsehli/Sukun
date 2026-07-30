/**
 * The Company's people-management surface: `/api/homeowners/*` (RE4) and
 * `/api/technicians/*` (RE5), typed.
 *
 * Verified against `sakn-backend/src/homeowners` and `src/technicians`.
 * Every route below is `companyOnly` except `PATCH /technicians/me/status`,
 * which is `technicianOnly` and is the technician's own availability toggle.
 *
 * Two things this module deliberately does NOT do:
 *
 *  - **It never generates an activation or invitation code.** The approved RE4
 *    wizard has a local `CODE_CHARS` generator for its demo journey; the real
 *    code is issued server-side, hashed at rest, and delivered by the Backend.
 *    A client-generated code would be a fabricated credential.
 *  - **It never re-derives a homeowner's status.** `deriveHomeownerStatus` runs
 *    on the server (ARCHIVED beats everything, then role, then a live PENDING
 *    activation) and arrives as `status` on the DTO.
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";
import type { RequestScope } from "./discovery";

/* --------------------------------------------------------------- homeowners */

export type HomeownerStatusDto = "ACTIVE" | "PENDING" | "NOT_ACTIVATED" | "DEACTIVATED";

export interface HomeownerRecordDto {
  id: string;
  name: string;
  nationalId: string | null;
  email: string;
  phone: string;
  status: HomeownerStatusDto;
  unit: { id: string; number: string; buildingName: string; projectName: string } | null;
  moveInDate: string | null;
  createdAt: string;
}

export interface HomeownerHistoryEntryDto {
  id: string;
  kind: "ACTIVATION" | "OWNERSHIP";
  status: string;
  unitNumber: string;
  buildingName: string;
  endReason?: string | null;
  createdAt: string;
}

export interface HomeownerReportRowDto {
  id: string;
  reportNumber: number;
  status: string;
  statusGroup: string;
  category: string;
  priority: string;
  problemText: string;
  warrantyVerdict: string;
  technicianName: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface HomeownerProfileDto extends HomeownerRecordDto {
  invitationHistory: HomeownerHistoryEntryDto[];
  ownershipHistory: HomeownerHistoryEntryDto[];
  warranty: { coverage: string; startDate: string; endDate: string } | null;
  openReportsCount: number;
  reports: HomeownerReportRowDto[];
}

export interface CreateHomeownerRequest {
  name: string;
  /**
   * Optional, and omitted entirely by every journey in this app — the Backend's
   * `createHomeownerSchema` rejects a blank string, so "absent" must be an
   * absent key rather than `""`. Kept on the type (rather than deleted) because
   * the Backend still accepts and uniquely indexes a real value.
   */
  nationalId?: string;
  email: string;
  phone: string;
  unitId: string;
}

export interface UpdateHomeownerRequest {
  email?: string;
  phone?: string;
}

export interface ListHomeownersQuery {
  q?: string;
  status?: HomeownerStatusDto;
  page?: number;
  pageSize?: number;
}

/* -------------------------------------------------------------- technicians */

export interface TechnicianDto {
  id: string;
  projectId: string;
  name: string;
  email: string;
  phone: string;
  specialty: string | null;
  status: string;
  assignedRepairsCount: number;
  createdAt: string;
  invitation?: {
    expiresAt: string;
    recipientEmail: string;
    deliveryStatus: string;
    /** Non-production only. Never rendered as a usable credential. */
    invitationPreview?: string;
  };
}

export interface TechnicianSummaryDto {
  totalTechnicians: number;
  availableCount: number;
  busyCount: number;
}

export interface TechnicianStatsDto {
  openRepairsCount: number;
  completedRepairsCount: number;
  /** Honest `null` — never 0 — when this technician has no reviews. */
  averageRating: number | null;
  reviewsCount: number;
  averageRepairDurationMinutes: number | null;
  averageRepairDurationDays: number | null;
  legacy: {
    openRepairsCount: number;
    completedRepairsCount: number;
    averageRepairDurationDays: number | null;
  };
}

export interface TechnicianProfileDto extends TechnicianDto {
  stats?: TechnicianStatsDto;
}

export interface TechnicianReviewItemDto {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  homeownerName: string;
  reportId: string;
}

export interface CreateTechnicianRequest {
  name: string;
  email: string;
  phone: string;
  specialty: string;
  projectId: string;
}

export interface ListTechniciansQuery {
  q?: string;
  projectId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);
const enc = encodeURIComponent;

export const backendAdmin = {
  /* ------------------------------------------------------------ RE4 */
  listHomeowners: (q: ListHomeownersQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<HomeownerRecordDto>>("/homeowners", {
      query: { q: clean(q.q), status: q.status, page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),
  getHomeowner: (id: string, s: RequestScope = {}) =>
    apiClient.get<HomeownerProfileDto>(`/homeowners/${enc(id)}`, { signal: s.signal }),
  /** RE4's `#unit` deep link resolves through the Backend, not a local scan. */
  getHomeownerByUnit: (unitNumber: string, s: RequestScope = {}) =>
    apiClient.get<HomeownerProfileDto>(`/homeowners/by-unit/${enc(unitNumber)}`, { signal: s.signal }),
  createHomeowner: (body: CreateHomeownerRequest, s: RequestScope = {}) =>
    apiClient.post<HomeownerRecordDto>("/homeowners", body, { signal: s.signal }),
  updateHomeowner: (id: string, body: UpdateHomeownerRequest, s: RequestScope = {}) =>
    apiClient.patch<HomeownerRecordDto>(`/homeowners/${enc(id)}`, body, { signal: s.signal }),
  resendHomeownerInvitation: (id: string, s: RequestScope = {}) =>
    apiClient.post<unknown>(`/homeowners/${enc(id)}/resend-invitation`, undefined, { signal: s.signal }),
  transferHomeowner: (id: string, unitId: string, s: RequestScope = {}) =>
    apiClient.post<HomeownerRecordDto>(`/homeowners/${enc(id)}/transfer`, { unitId }, { signal: s.signal }),
  setHomeownerStatus: (id: string, active: boolean, s: RequestScope = {}) =>
    apiClient.patch<HomeownerRecordDto>(`/homeowners/${enc(id)}/status`, { active }, { signal: s.signal }),
  /** The REAL CSV. Not a JSON envelope, so it goes through `getBlob`. */
  exportHomeowners: (q: { q?: string; status?: HomeownerStatusDto } = {}, s: RequestScope = {}) =>
    apiClient.getBlob("/homeowners/export", {
      query: { q: clean(q.q), status: q.status },
      signal: s.signal,
    }),

  /* ------------------------------------------------------------ RE5 */
  listTechnicians: (q: ListTechniciansQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<TechnicianDto>>("/technicians", {
      query: { q: clean(q.q), projectId: q.projectId, status: q.status, page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),
  technicianSummary: (s: RequestScope = {}) =>
    apiClient.get<TechnicianSummaryDto>("/technicians/summary", { signal: s.signal }),
  getTechnician: (id: string, s: RequestScope = {}) =>
    apiClient.get<TechnicianProfileDto>(`/technicians/${enc(id)}`, { signal: s.signal }),
  technicianReviews: (id: string, s: RequestScope = {}) =>
    apiClient.get<{ items: TechnicianReviewItemDto[] } | TechnicianReviewItemDto[]>(
      `/technicians/${enc(id)}/reviews`,
      { signal: s.signal },
    ),
  createTechnician: (body: CreateTechnicianRequest, s: RequestScope = {}) =>
    apiClient.post<TechnicianDto>("/technicians", body, { signal: s.signal }),
  updateTechnician: (id: string, body: { specialty?: string; phone?: string }, s: RequestScope = {}) =>
    apiClient.patch<TechnicianDto>(`/technicians/${enc(id)}`, body, { signal: s.signal }),
  resendTechnicianInvitation: (id: string, s: RequestScope = {}) =>
    apiClient.post<unknown>(`/technicians/${enc(id)}/resend-invitation`, undefined, { signal: s.signal }),
  transferTechnician: (id: string, projectId: string, s: RequestScope = {}) =>
    apiClient.post<TechnicianDto>(`/technicians/${enc(id)}/transfer`, { projectId }, { signal: s.signal }),
  setTechnicianStatus: (id: string, active: boolean, s: RequestScope = {}) =>
    apiClient.patch<TechnicianDto>(`/technicians/${enc(id)}/status`, { active }, { signal: s.signal }),

  /** The technician's OWN availability toggle — `technicianOnly`, not company. */
  setMyTechnicianStatus: (status: string, s: RequestScope = {}) =>
    apiClient.patch<TechnicianDto>("/technicians/me/status", { status }, { signal: s.signal }),
  getMyTechnician: (s: RequestScope = {}) =>
    apiClient.get<TechnicianDto>("/technicians/me", { signal: s.signal }),
};
