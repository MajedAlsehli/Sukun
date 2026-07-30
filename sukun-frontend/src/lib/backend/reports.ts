/**
 * `/api/reports/*`, typed — the CANONICAL post-ownership report domain.
 *
 * Verified against `sakn-backend/src/reports`:
 *   report.routes.ts   — the live routes and their per-role guards
 *   report.dto.ts      — the request schemas
 *   report.mapper.ts   — ReportSummaryDto / ReportDetailDto / timeline
 *   report.service.ts  — media staging, analysis, warranty preview, creation
 *   report.types.ts    — categories, priorities, statuses, SLA
 *
 * **This is the only report model this frontend knows.** `/api/warranty-reports`
 * (legacy `WarrantyReport`) and `/api/repairs` (legacy `Repair`) are the
 * superseded surfaces kept alive for backward compatibility only; nothing in
 * Task 2 calls them, and there is exactly one report-detail implementation.
 *
 * What is deliberately ABSENT from every request type below, because the
 * Backend's schemas make it inexpressible (decisions.md I4/I6/I8/I12):
 *   * no `technicianId`   — routing is automatic
 *   * no `warrantyVerdict`— the server computes and snapshots it at creation
 *   * no `status`         — there is no arbitrary status PATCH
 *   * no `unitId`/`projectId` on create — resolved from the active ownership
 *   * no AI fields on create — only an opaque `analysisId`
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";
import type { RequestScope } from "./discovery";

/* ------------------------------------------------------------------ enums */

export type ReportCategoryDto =
  | "PLUMBING"
  | "ELECTRICAL"
  | "CRACKS"
  | "PAINT"
  | "DOORS"
  | "WINDOWS"
  | "FLOORING"
  | "CEILINGS"
  | "OTHER";

/** Three levels only — the fourth (`CRITICAL`) belongs to the legacy inspection domain. */
export type ReportPriorityDto = "LOW" | "MEDIUM" | "HIGH";
export type ReportPrioritySourceDto = "AI" | "MANUAL_DEFAULT";

export type ReportStatusDto =
  | "ROUTING_PENDING"
  | "ROUTED"
  | "IN_PROGRESS"
  | "AWAITING_OWNER_APPROVAL"
  | "CLOSED";

/** H9's four filter chips map 1:1 onto these. */
export type ReportStatusGroupDto = "OPEN" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "CLOSED";

export type ReportWarrantyVerdictDto =
  | "COVERED"
  | "NOT_COVERED"
  | "NOT_CONFIGURED"
  | "NO_WARRANTY"
  | "NOT_EVALUATED_LEGACY";

export type ReportSlaStateDto = "NOT_CONFIGURED" | "ON_TIME" | "AT_RISK" | "BREACHED" | "MET";
export type ReportMediaStageDto = "HOMEOWNER" | "BEFORE" | "AFTER";
export type ReportRepairStatusDto = "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REOPENED";

/** `report.types.ts#REPORT_CATEGORIES`, in the Backend's own order. */
export const REPORT_CATEGORIES: readonly ReportCategoryDto[] = [
  "PLUMBING",
  "ELECTRICAL",
  "CRACKS",
  "PAINT",
  "DOORS",
  "WINDOWS",
  "FLOORING",
  "CEILINGS",
  "OTHER",
];

/* -------------------------------------------------------------------- DTOs */

export interface ReportWarrantySnapshotDto {
  verdict: ReportWarrantyVerdictDto;
  reasonCode: string;
  categoryKey: string | null;
  rulesVersion: string;
  evaluatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ReportSlaDto {
  dueAt: string | null;
  state: ReportSlaStateDto;
  rulesVersion: string;
}

export interface ReportLocationDto {
  projectId: string;
  projectName: string;
  projectCity: string;
  projectDistrict: string | null;
  buildingId: string;
  buildingName: string;
  buildingNumber: string;
  unitId: string;
  unitNumber: string;
  unitFloor: number;
}

export interface ReportPersonDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ReportTechnicianDto {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
}

export interface ReportRepairDto {
  status: ReportRepairStatusDto;
  startedAt: string;
  submittedAt: string | null;
  homeownerDecisionAt: string | null;
  technicianNote: string | null;
  homeownerReopenReason: string | null;
  durationMinutes: number | null;
  reopenCount: number;
}

/** `null` on the manual-entry path — never back-filled with a plausible confidence. */
export interface ReportAiDto {
  suggestedCategory: ReportCategoryDto | null;
  confidence: number | null;
  problemText: string | null;
  explanation: string | null;
  provider: string | null;
  model: string | null;
}

export interface ReportReviewDto {
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ReportMediaDto {
  id: string;
  stage: ReportMediaStageDto;
  /** A short-lived SIGNED url for a private object. Never a durable public link. */
  url: string;
  mimeType: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * Mirrors exactly what the endpoints enforce, so the UI can render honest
 * affordances. Hiding a control is not authorization — the server decides.
 */
export interface ReportPermissionsDto {
  canStart: boolean;
  canSubmitRepair: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

export interface ReportSummaryDto {
  id: string;
  reportNumber: number;
  status: ReportStatusDto;
  statusGroup: ReportStatusGroupDto;
  category: ReportCategoryDto;
  categoryConfirmedByUser: boolean;
  priority: ReportPriorityDto;
  prioritySource: ReportPrioritySourceDto;
  problemText: string;
  homeownerNote: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  reopenCount: number;
  warranty: ReportWarrantySnapshotDto;
  sla: ReportSlaDto;
  location: ReportLocationDto;
  homeowner: ReportPersonDto;
  technician: ReportTechnicianDto | null;
  repair: ReportRepairDto | null;
  review: ReportReviewDto | null;
  ai: ReportAiDto | null;
  routing: {
    state: "PENDING" | "ROUTED";
    reasonCode: string | null;
    attemptCount: number;
    lastAttemptAt: string | null;
  };
  photoCounts: { homeowner: number; before: number; after: number };
  interventionNeeded: boolean;
  interventionReasonCode: string | null;
  permissions: ReportPermissionsDto;
}

export interface ReportDetailDto extends ReportSummaryDto {
  media: ReportMediaDto[];
}

export interface ReportTimelineEventDto {
  id: string;
  type: string;
  actorType: string;
  actorName: string | null;
  metadata: unknown;
  createdAt: string;
}

/* ---------------------------------------------------------------- providers */

/** `GET /api/reports/providers` — booleans only, never a key (decisions.md I7). */
export interface ReportProvidersDto {
  analysis: { name: string; available: boolean };
  objectDetection: { name: string; available: boolean; note?: string };
  media: { driver: string; durable: boolean; available: boolean };
}

/* ------------------------------------------------------------------ media */

/** `report-media-storage.ts#ALLOWED_REPORT_MEDIA_MIME_TYPES` */
export type ReportMediaMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface UploadReportMediaRequest {
  fileName: string;
  mimeType: ReportMediaMimeType;
  /** Base64 WITHOUT a `data:` prefix. ~8 MB decoded ceiling on the Backend. */
  contentBase64: string;
}

/**
 * The staged object. `key` is server-derived — the client's `fileName` never
 * reaches a storage path — and `url` is a signed, expiring link to the PRIVATE
 * bucket. Only `key` is ever sent back to the Backend.
 */
export interface UploadReportMediaResponse {
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/* ---------------------------------------------------------------- analysis */

export interface AnalyzeReportRequest {
  mediaKeys: string[];
  note?: string;
}

export interface AnalyzeReportResponse {
  /** Opaque id. It, not the AI fields, is what `create` accepts (decisions.md I6). */
  analysisId: string;
  category: ReportCategoryDto;
  problemText: string;
  priority: ReportPriorityDto;
  /** Integer 0-100, clamped server-side. */
  confidence: number;
  explanation: string | null;
  provider: string;
  model: string;
  /** Whether the object detector contributed advisory context to this analysis. */
  detectionsAvailable: boolean;
}

/* --------------------------------------------------------- warranty preview */

export interface WarrantyCheckRequest {
  category: ReportCategoryDto;
}

/** Explicitly non-authoritative: creation always recomputes (decisions.md I4). */
export interface WarrantyCheckResponse {
  verdict: ReportWarrantyVerdictDto;
  reasonCode: string;
  categoryKey: string | null;
  rulesVersion: string;
  periodStart: string | null;
  periodEnd: string | null;
  preview: true;
}

/* ------------------------------------------------------------------ create */

export interface CreateReportRequest {
  mediaKeys: string[];
  category: ReportCategoryDto;
  problemText: string;
  note?: string;
  /** A prior `analyze` result. Absent = the documented manual-entry path. */
  analysisId?: string;
  categoryConfirmedByUser?: boolean;
}

export interface ApproveReportRequest {
  rating: number;
  comment?: string;
}

export interface ReopenReportRequest {
  reason: string;
}

/* ------------------------------------------------------------------- list */

export interface ListReportsQuery {
  projectId?: string;
  unitId?: string;
  homeownerId?: string;
  technicianId?: string;
  /** Repeatable or comma-separated. ALWAYS intersected with the role scope, never replacing it. */
  status?: ReportStatusDto[];
  priority?: ReportPriorityDto[];
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The Backend's `listReportsQuerySchema` accepts a comma-separated string for
 * `status`/`priority` and splits it itself. Serializing here (rather than
 * emitting repeated keys) keeps the query canonical and testable.
 */
function serializeList(values: readonly string[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(",");
}

function path(reportId: string, suffix = ""): string {
  return `/reports/${encodeURIComponent(reportId)}${suffix}`;
}

export const backendReports = {
  /** `GET /api/reports/providers` — drives every honest "unavailable" state. */
  getProviders(scope: RequestScope = {}): Promise<ReportProvidersDto> {
    return apiClient.get<ReportProvidersDto>("/reports/providers", { signal: scope.signal });
  },

  /** `POST /api/reports/media` — 201. Stages ONE photo into private storage. */
  uploadMedia(
    body: UploadReportMediaRequest,
    scope: RequestScope = {},
  ): Promise<UploadReportMediaResponse> {
    return apiClient.post<UploadReportMediaResponse>("/reports/media", body, { signal: scope.signal });
  },

  /**
   * `POST /api/reports/analyze` — AI advice only; creates nothing, mutates
   * nothing. Answers `503`/`BusinessError AI_ANALYSIS_UNAVAILABLE` when the
   * provider is not configured, which is a contract, not a bug.
   */
  analyze(body: AnalyzeReportRequest, scope: RequestScope = {}): Promise<AnalyzeReportResponse> {
    return apiClient.post<AnalyzeReportResponse>("/reports/analyze", body, { signal: scope.signal });
  },

  /** `POST /api/reports/warranty-check` — a preview of the verdict creation will recompute. */
  warrantyCheck(body: WarrantyCheckRequest, scope: RequestScope = {}): Promise<WarrantyCheckResponse> {
    return apiClient.post<WarrantyCheckResponse>("/reports/warranty-check", body, {
      signal: scope.signal,
    });
  },

  /** `POST /api/reports` — 201. Snapshots warranty and routes automatically. */
  create(body: CreateReportRequest, scope: RequestScope = {}): Promise<ReportDetailDto> {
    return apiClient.post<ReportDetailDto>("/reports", body, { signal: scope.signal });
  },

  /** `GET /api/reports` — the role scope is built from the principal, never from the filters. */
  list(query: ListReportsQuery = {}, scope: RequestScope = {}): Promise<Paginated<ReportSummaryDto>> {
    return apiClient.get<Paginated<ReportSummaryDto>>("/reports", {
      query: {
        projectId: query.projectId,
        unitId: query.unitId,
        homeownerId: query.homeownerId,
        technicianId: query.technicianId,
        status: serializeList(query.status),
        priority: serializeList(query.priority),
        q: query.q?.trim() || undefined,
        page: query.page,
        pageSize: query.pageSize,
      },
      signal: scope.signal,
    });
  },

  /** `GET /api/reports/{id}` — media arrive as freshly signed URLs. A foreign report 404s. */
  getById(reportId: string, scope: RequestScope = {}): Promise<ReportDetailDto> {
    return apiClient.get<ReportDetailDto>(path(reportId), { signal: scope.signal });
  },

  /** `GET /api/reports/{id}/timeline` — the canonical event log, scope-checked first. */
  getTimeline(reportId: string, scope: RequestScope = {}): Promise<ReportTimelineEventDto[]> {
    return apiClient.get<ReportTimelineEventDto[]>(path(reportId, "/timeline"), {
      signal: scope.signal,
    });
  },

  /** `POST /api/reports/{id}/approve` — homeowner + AWAITING_OWNER_APPROVAL only. Rating is required. */
  approve(
    reportId: string,
    body: ApproveReportRequest,
    scope: RequestScope = {},
  ): Promise<ReportDetailDto> {
    return apiClient.post<ReportDetailDto>(path(reportId, "/approve"), body, { signal: scope.signal });
  },

  /** `POST /api/reports/{id}/reopen` — homeowner + AWAITING_OWNER_APPROVAL only. Reason is required. */
  reopen(reportId: string, body: ReopenReportRequest, scope: RequestScope = {}): Promise<ReportDetailDto> {
    return apiClient.post<ReportDetailDto>(path(reportId, "/reopen"), body, { signal: scope.signal });
  },
};
