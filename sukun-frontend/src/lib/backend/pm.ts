/**
 * `/api/pm/*` — the Project Manager surface (PM1/PM3 + Copilot), typed.
 *
 * Verified against `sakn-backend/src/pm/{pm.routes,pm.mapper,pm.service}.ts`.
 * The PM is resolved from the PRINCIPAL; `projectId` only narrows an already
 * PM-scoped query and can never widen it.
 *
 * Three honest states this module preserves rather than smoothing over, because
 * each is a deliberate Backend contract (decisions.md J4/J5a/J6/E3):
 *
 *  - `assigned: false` — a manager in the unassigned pool. Not an error.
 *  - `slaCompliancePercent` / `averageResolutionTimeMinutes` are `number | null`.
 *    **Null means "no report has a determined outcome yet", never 0 and never
 *    100.** Rendering 0 % compliance for an empty denominator would be a lie.
 *  - `rules` reports each alert threshold as configured or not. An UNCONFIGURED
 *    rule means that alert type was not generated at all — which is different
 *    from "checked and found clean", and the UI must be able to say so.
 *
 * There is NO PM mutation endpoint anywhere in this module, and that is
 * correct: routing is automatic and the canonical API admits no PM write on a
 * report (decisions.md I12). PM2 is read-only by construction, not by the UI
 * choosing to hide controls.
 */

import { apiClient } from "./client";
import type { Paginated } from "./envelope";
import type { RequestScope } from "./discovery";
import type { ReportPriorityDto, ReportStatusDto, ReportSummaryDto } from "./reports";

export interface PmProjectDto {
  id: string;
  name: string;
  code: string;
  city: string;
  district: string | null;
  status: string;
  isActive: boolean;
}

export interface PmKpisDto {
  /** Filed, nobody has started: ROUTING_PENDING + ROUTED. */
  openReports: number;
  inProgress: number;
  awaitingOwnerApproval: number;
  closedThisMonth: number;
  /** Null — never 0, never 100 — when no report has a determined SLA outcome. */
  slaCompliancePercent: number | null;
  /** Filing → closure. Null when nothing has closed. NOT repair duration. */
  averageResolutionTimeMinutes: number | null;
}

export interface PmOverviewDto {
  assigned: boolean;
  project: PmProjectDto | null;
  kpis: PmKpisDto;
  period: { start: string; end: string };
  sla: {
    eligibleCount: number;
    metCount: number;
    breachedCount: number;
    rulesVersion: string;
    atRiskPolicy: { configured: boolean; fraction: number | null; version: string };
  };
  totalActiveReports: number;
  generatedAt: string;
}

export interface PmAlertDto {
  id: string;
  type: string;
  severity: string;
  reportId: string;
  reportNumber: number;
  problemText: string;
  priority: ReportPriorityDto;
  status: ReportStatusDto;
  reasonCode: string | null;
  ageHours: number | null;
  technicianId: string | null;
  technicianName: string | null;
  occurredAt: string;
  target: { type: "report"; id: string };
}

export interface PmAlertRulesDto {
  /** `null` = the rule is NOT configured, so its alert type was not generated. */
  awaitingApprovalHours: number | null;
  stalledHours: number | null;
  [key: string]: number | null | undefined;
}

export interface PmAlertsDto {
  assigned: boolean;
  items: PmAlertDto[];
  total: number;
  rules: PmAlertRulesDto;
  generatedAt: string;
}

export interface PmActivityItemDto {
  id: string;
  type: string;
  source: "REPORT_TIMELINE" | "TECHNICIAN_AUDIT";
  actorType: string;
  actorName: string | null;
  occurredAt: string;
  target: { type: "report" | "technician"; id: string; label: string } | null;
}

export interface PmActivityDto {
  assigned: boolean;
  items: PmActivityItemDto[];
  generatedAt: string;
}

export type PmTechnicianLoadDto = "BUSY" | "AVAILABLE" | "UNAVAILABLE";

export interface PmContractorItemDto {
  technicianId: string;
  name: string;
  specialty: string | null;
  load: PmTechnicianLoadDto;
  membership: "CURRENT" | "HISTORICAL";
  openReportsCount: number;
  /** Honest `null` when this technician has no reviews. */
  averageRating: number | null;
  reviewsCount: number;
}

export interface PmContractorsDto {
  assigned: boolean;
  items: PmContractorItemDto[];
  generatedAt: string;
}

export interface PmContractorStatsDto {
  openReportsCount: number;
  completedReportsCount: number;
  averageRepairDurationMinutes: number | null;
  averageRating: number | null;
  reviewsCount: number;
  slaCompliancePercent: number | null;
  slaEligibleCount: number;
}

export interface PmContractorPerformanceDto {
  technicianId: string;
  name: string;
  specialty: string | null;
  load: PmTechnicianLoadDto;
  stats: PmContractorStatsDto;
  recentReports?: ReportSummaryDto[];
  generatedAt: string;
}

/** OpenAI-backed. `available: false` is the honest-unavailable contract. */
export interface PmContractorInsightDto {
  available: boolean;
  reason?: string;
  text?: string | null;
  generatedAt?: string;
}

export interface PmCopilotSummaryDto {
  available: boolean;
  reason?: string;
  text?: string | null;
  generatedAt?: string;
}

export interface PmCopilotChatDto {
  available: boolean;
  reason?: string;
  text?: string | null;
  generatedAt?: string;
}

export interface PmReportsQuery {
  status?: ReportStatusDto[];
  priority?: ReportPriorityDto[];
  q?: string;
  page?: number;
  pageSize?: number;
  projectId?: string;
}

const list = (v?: readonly string[]) => (v && v.length ? v.join(",") : undefined);
const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);
const enc = encodeURIComponent;

export const backendPm = {
  overview: (projectId?: string, s: RequestScope = {}) =>
    apiClient.get<PmOverviewDto>("/pm/overview", { query: { projectId }, signal: s.signal }),

  alerts: (projectId?: string, s: RequestScope = {}) =>
    apiClient.get<PmAlertsDto>("/pm/alerts", { query: { projectId }, signal: s.signal }),

  activity: (opts: { projectId?: string; limit?: number } = {}, s: RequestScope = {}) =>
    apiClient.get<PmActivityDto>("/pm/activity", {
      query: { projectId: opts.projectId, limit: opts.limit },
      signal: s.signal,
    }),

  /** The canonical report filter set, PM-scoped by the principal. */
  reports: (q: PmReportsQuery = {}, s: RequestScope = {}) =>
    apiClient.get<Paginated<ReportSummaryDto>>("/pm/reports", {
      query: {
        status: list(q.status),
        priority: list(q.priority),
        q: clean(q.q),
        page: q.page,
        pageSize: q.pageSize,
        projectId: q.projectId,
      },
      signal: s.signal,
    }),

  contractors: (projectId?: string, s: RequestScope = {}) =>
    apiClient.get<PmContractorsDto>("/pm/contractors", { query: { projectId }, signal: s.signal }),

  contractorPerformance: (technicianId: string, projectId?: string, s: RequestScope = {}) =>
    apiClient.get<PmContractorPerformanceDto>(`/pm/contractors/${enc(technicianId)}/performance`, {
      query: { projectId },
      signal: s.signal,
    }),

  contractorInsight: (technicianId: string, projectId?: string, s: RequestScope = {}) =>
    apiClient.get<PmContractorInsightDto>(`/pm/contractors/${enc(technicianId)}/insight`, {
      query: { projectId },
      signal: s.signal,
    }),

  /**
   * The Copilot's two request bodies, read off `pm.dto.ts`:
   * `pmCopilotSummarySchema` = `{ context? }`, `pmCopilotChatSchema` =
   * `{ message, context? }`. There is NO `projectId` and NO `question` on
   * either — the grounding snapshot is built server-side from the
   * authenticated principal precisely so a client cannot widen its scope, and
   * `context` is bounded at 200 chars and folded into the question only.
   *
   * Sending `{ question }` is what a fresh production probe caught: `message`
   * failed `min(1)` and every ask returned 400 VALIDATION_ERROR.
   */
  copilotSummary: (body: { context?: string } = {}, s: RequestScope = {}) =>
    apiClient.post<PmCopilotSummaryDto>("/pm/copilot/summary", body, { signal: s.signal }),

  copilotChat: (body: { message: string; context?: string }, s: RequestScope = {}) =>
    apiClient.post<PmCopilotChatDto>("/pm/copilot/chat", body, { signal: s.signal }),
};
