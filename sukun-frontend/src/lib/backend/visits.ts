/**
 * `/api/visits/*`, typed — the real H5 visit lifecycle.
 *
 * Verified against `sakn-backend/src/visits`:
 *   visit.routes.ts   — the ten live routes
 *   visit.dto.ts      — create / reschedule / note / issue / feedback schemas
 *   visit.mapper.ts   — VisitDto / VisitListItemDto / VisitDetailDto
 *   visit.types.ts    — the status machine and its eligibility rules
 *
 * Two rules this module exists to keep honest:
 *
 *  1. **Visit notes and issues are not reports.** They are visit- and
 *     user-scoped rows that are structurally incapable of becoming a canonical
 *     `Report` (decisions.md A9/G10). Nothing here ever crosses into
 *     `lib/backend/reports.ts`.
 *  2. **Status is the server's.** `assertReschedulable` / `assertInProgress` /
 *     `assertFeedbackEligible` live on the Backend; this client never predicts
 *     a transition, it reads the one the server returns.
 *
 * Photos on a note/issue are sent as base64 in the JSON body (the Backend's own
 * `photoSchema`), stored in the PRIVATE Supabase bucket, and handed back as a
 * short-lived signed URL the server minted only after authorizing the caller.
 */

import { apiClient } from "./client";
import type { RequestScope } from "./discovery";

/** Prisma `VisitStatus` — `visit.types.ts`. */
export type VisitStatusDto =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "COMPLETED"
  | "CANCELLED";

/** `visit.mapper.ts#VisitDto` */
export interface VisitDto {
  id: string;
  userId: string;
  projectId: string;
  unitId: string;
  searchJourneyId: string;
  date: string;
  time: string;
  status: VisitStatusDto;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  rescheduleCount: number;
  lastRescheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `visit.mapper.ts#VisitListItemDto` — denormalized display names, joined once. */
export interface VisitListItemDto extends VisitDto {
  projectName: string;
  unitNumber: string;
}

export interface VisitNoteDto {
  id: string;
  text: string | null;
  /** Signed URL for a private object, or `null`. Never a raw storage key. */
  photoUrl: string | null;
  createdAt: string;
}

export interface VisitIssueDto {
  id: string;
  category: string;
  description: string | null;
  photoUrl: string | null;
  createdAt: string;
}

export interface VisitFeedbackDto {
  id: string;
  rating: number;
  comment: string | null;
  suitability: string | null;
  createdAt: string;
}

/** `visit.mapper.ts#VisitDetailDto` */
export interface VisitDetailDto extends VisitDto {
  projectName: string;
  projectCity: string;
  unitNumber: string;
  notes: VisitNoteDto[];
  issues: VisitIssueDto[];
  feedback: VisitFeedbackDto | null;
}

export type VisitIssueCategory = "FINISHING" | "ELECTRICAL" | "PLUMBING" | "PLAN_MISMATCH" | "OTHER";
export type VisitSuitability = "YES" | "SOMEWHAT" | "NO";

/** `visit.dto.ts#photoSchema` — the three mime types the Backend accepts. */
export type VisitPhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface VisitPhotoUpload {
  fileName: string;
  mimeType: VisitPhotoMimeType;
  /** Base64 WITHOUT a `data:` prefix — the Backend decodes the raw payload. */
  contentBase64: string;
}

export interface CreateVisitRequest {
  projectId: string;
  unitId: string;
  /** `YYYY-MM-DD`; the Backend refuses any date before the start of today. */
  date: string;
  time: string;
}

export interface RescheduleVisitRequest {
  date: string;
  time: string;
}

export interface CreateVisitNoteRequest {
  text?: string;
  photo?: VisitPhotoUpload;
}

export interface CreateVisitIssueRequest {
  category: VisitIssueCategory;
  description?: string;
  photo?: VisitPhotoUpload;
}

export interface CreateVisitFeedbackRequest {
  rating: number;
  comment?: string;
  suitability?: VisitSuitability;
}

function path(visitId: string, suffix = ""): string {
  return `/visits/${encodeURIComponent(visitId)}${suffix}`;
}

export const backendVisits = {
  /** `GET /api/visits` — the caller's own visits only; the scope is the principal's. */
  list(scope: RequestScope = {}): Promise<VisitListItemDto[]> {
    return apiClient.get<VisitListItemDto[]>("/visits", { signal: scope.signal });
  },

  /** `GET /api/visits/{id}` — a foreign visit 404s; existence is hidden, not 403'd. */
  getById(visitId: string, scope: RequestScope = {}): Promise<VisitDetailDto> {
    return apiClient.get<VisitDetailDto>(path(visitId), { signal: scope.signal });
  },

  /** `POST /api/visits` — 201. Requires a currently-discoverable project. */
  create(body: CreateVisitRequest, scope: RequestScope = {}): Promise<VisitDto> {
    return apiClient.post<VisitDto>("/visits", body, { signal: scope.signal });
  },

  /** `PATCH /api/visits/{id}` — reschedule only (date/time). Never a status write. */
  reschedule(visitId: string, body: RescheduleVisitRequest, scope: RequestScope = {}): Promise<VisitDto> {
    return apiClient.patch<VisitDto>(path(visitId), body, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/checkin` */
  checkIn(visitId: string, scope: RequestScope = {}): Promise<VisitDto> {
    return apiClient.post<VisitDto>(path(visitId, "/checkin"), undefined, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/checkout` — lands on `CHECKED_OUT`, the reachable terminal state. */
  checkOut(visitId: string, scope: RequestScope = {}): Promise<VisitDto> {
    return apiClient.post<VisitDto>(path(visitId, "/checkout"), undefined, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/cancel` */
  cancel(visitId: string, scope: RequestScope = {}): Promise<VisitDto> {
    return apiClient.post<VisitDto>(path(visitId, "/cancel"), undefined, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/notes` — 201. Text and/or photo; at least one is required. */
  addNote(visitId: string, body: CreateVisitNoteRequest, scope: RequestScope = {}): Promise<VisitNoteDto> {
    return apiClient.post<VisitNoteDto>(path(visitId, "/notes"), body, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/issues` — 201. Only while the visit is CHECKED_IN. */
  addIssue(visitId: string, body: CreateVisitIssueRequest, scope: RequestScope = {}): Promise<VisitIssueDto> {
    return apiClient.post<VisitIssueDto>(path(visitId, "/issues"), body, { signal: scope.signal });
  },

  /** `POST /api/visits/{id}/feedback` — 201. One row per visit, enforced by a unique index. */
  submitFeedback(
    visitId: string,
    body: CreateVisitFeedbackRequest,
    scope: RequestScope = {},
  ): Promise<VisitFeedbackDto> {
    return apiClient.post<VisitFeedbackDto>(path(visitId, "/feedback"), body, { signal: scope.signal });
  },
};
