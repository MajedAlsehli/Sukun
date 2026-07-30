/**
 * `/api/technician/*` plus the two technician-only report transitions — the
 * C1/C2/C3 surface, typed.
 *
 * Verified against `sakn-backend/src/reports/report.routes.ts`
 * (`technicianTaskRouter`, `technicianOnly` on `/:id/start` and
 * `/:id/submit-repair`).
 *
 * Authorization facts this module relies on and never second-guesses:
 *
 *  - the task scope is built from the PRINCIPAL's own `Technician.id`; a
 *    technician cannot see or touch another's work, and a foreign report 404s
 *    rather than 403s;
 *  - `ReportPermissionsDto.canStart` / `canSubmitRepair` are true only for the
 *    ASSIGNED technician, and the endpoints re-enforce it — hiding a button is
 *    not authorization;
 *  - a technician may hold only ONE active repair at a time. Starting a second
 *    answers `409 ACTIVE_REPAIR_EXISTS` with the blocking report named in
 *    `details`, which is a real state the UI must show rather than swallow.
 *
 * There is no "complete" or arbitrary status endpoint: a repair ends when the
 * technician SUBMITS it and the homeowner then approves or reopens.
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";
import type { RequestScope } from "./discovery";
import type {
  ReportDetailDto,
  ReportMediaMimeType,
  ReportStatusDto,
  ReportSummaryDto,
} from "./reports";

export interface TechnicianTaskSummaryDto {
  total: number;
  byPriority: { HIGH: number; MEDIUM: number; LOW: number };
  byStatus: Record<string, number>;
  /** The one repair this technician currently holds, if any. */
  activeRepair: { reportId: string; reportNumber: number } | null;
}

export interface ListTechnicianTasksQuery {
  status?: ReportStatusDto[];
  page?: number;
  pageSize?: number;
}

export interface ListRepairHistoryQuery {
  page?: number;
  pageSize?: number;
}

/**
 * `GET /api/technician/repairs/history` does NOT return report summaries.
 * Each item is a REPAIR row with its report nested underneath — the repair's
 * own duration/notes/review live at the item root and the report's number,
 * location, warranty and media live on `item.report` (a full DETAIL dto with
 * signed media applied). Read against `report.service.ts:technicianRepairHistory`.
 */
export interface RepairHistoryItemDto {
  repairId: string;
  durationMinutes: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  /** The homeowner's decision moment — this is what "closed" means here. */
  closedAt: string | null;
  technicianNote: string | null;
  review: { rating: number; comment: string | null; createdAt: string } | null;
  report: ReportDetailDto;
}

/**
 * Real aggregates the Backend computes for C3's summary strip. `null` is an
 * honest "no determined value yet" and must never be rendered as `0`.
 */
export interface TechnicianRepairStatsDto {
  openReportsCount: number;
  completedRepairsCount: number;
  averageRepairDurationMinutes: number | null;
  averageRating: number | null;
  reviewsCount: number;
}

export type RepairHistoryPage = Paginated<RepairHistoryItemDto> & {
  stats: TechnicianRepairStatsDto;
};

/** Same base64 contract as report media everywhere else — no `data:` prefix. */
export interface RepairPhotoUpload {
  fileName: string;
  mimeType: ReportMediaMimeType;
  contentBase64: string;
}

export interface StartRepairRequest {
  beforePhotos?: RepairPhotoUpload[];
}

export interface SubmitRepairRequest {
  /** At least one after-repair photo is REQUIRED by the Backend. */
  afterPhotos: RepairPhotoUpload[];
  note?: string;
}

const list = (v?: readonly string[]) => (v && v.length ? v.join(",") : undefined);
const enc = encodeURIComponent;

export const backendTechnician = {
  /** `GET /api/technician/tasks` — this technician's assigned work only. */
  tasks: (q: ListTechnicianTasksQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<ReportSummaryDto>>("/technician/tasks", {
      query: { status: list(q.status), page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),

  /** `GET /api/technician/tasks/summary` — the counters C1 renders. */
  taskSummary: (s: RequestScope = {}) =>
    apiClient.get<TechnicianTaskSummaryDto>("/technician/tasks/summary", { signal: s.signal }),

  /** `GET /api/technician/repairs/history` — C3. */
  repairHistory: (q: ListRepairHistoryQuery = {}, s: RequestScope = {}) =>
    apiClient.get<RepairHistoryPage>("/technician/repairs/history", {
      query: { page: q.page, pageSize: q.pageSize },
      signal: s.signal,
    }),

  /**
   * `POST /api/reports/{id}/start`.
   *
   * A `409 ACTIVE_REPAIR_EXISTS` names the blocking report in `details` — that
   * is the single-active-repair rule, enforced by a partial unique index, not a
   * suggestion. Surface it; never retry around it.
   */
  startRepair: (reportId: string, body: StartRepairRequest = {}, s: RequestScope = {}) =>
    apiClient.post<ReportDetailDto>(`/reports/${enc(reportId)}/start`, body, { signal: s.signal }),

  /** `POST /api/reports/{id}/submit-repair` — at least one after photo. */
  submitRepair: (reportId: string, body: SubmitRepairRequest, s: RequestScope = {}) =>
    apiClient.post<ReportDetailDto>(`/reports/${enc(reportId)}/submit-repair`, body, { signal: s.signal }),
};
