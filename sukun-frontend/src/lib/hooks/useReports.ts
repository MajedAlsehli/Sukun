"use client";

/**
 * H9 (My Reports) and H8 (Report Journey) data layer — the CANONICAL report
 * domain and nothing else.
 *
 *   lib/backend/reports.ts -> lib/adapters/reports.ts -> THIS -> frozen screens
 *
 * There is ONE report-detail implementation. `/api/warranty-reports` and
 * `/api/repairs` (the legacy `WarrantyReport` / `Repair` surfaces) are never
 * called from anywhere in this frontend.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import {
  backendReports,
  type ListReportsQuery,
  type ReportDetailDto,
  type ReportProvidersDto,
  type ReportStatusDto,
} from "@/lib/backend/reports";
import {
  STATUSES_BY_FILTER_KEY,
  toReportDetailViewModel,
  toReportViewModel,
  toStatusCounts,
  toTimelineViewModel,
  type ReportDetailViewModel,
  type ReportTimelineEventViewModel,
  type ReportViewModel,
} from "@/lib/adapters/reports";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

export const REPORTS_PAGE_SIZE = 50;

export interface ReportsListResult {
  status: AsyncStatus;
  reports: ReportViewModel[];
  counts: Record<string, number>;
  total: number;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * `GET /api/reports`.
 *
 * The role scope is the Backend's — a homeowner principal is already restricted
 * to their own reports, and this client sends no `homeownerId` to "help". The
 * status filter is intersected with that scope server-side, never replacing it.
 *
 * The four count tiles are computed from the SAME page the list renders, so a
 * tile can never disagree with the rows beneath it. `filterKey === "all"` sends
 * no `status` at all rather than enumerating every value.
 */
export function useReports(filterKey: string): ReportsListResult {
  const statuses: ReportStatusDto[] | undefined =
    filterKey === "all" ? undefined : STATUSES_BY_FILTER_KEY[filterKey];

  const resource = useAsyncResource(
    (signal) =>
      backendReports.list({ pageSize: REPORTS_PAGE_SIZE, page: 1 } as ListReportsQuery, { signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  if (DEMO_MODE) {
    return { status: "idle", reports: [], counts: {}, total: 0, errorMessage: null, reload: () => {} };
  }

  const all = (resource.data?.items ?? []).map((dto) => toReportViewModel(dto));
  const visible = statuses ? all.filter((r) => statuses.includes(r.status)) : all;

  return {
    status: resource.status,
    reports: visible,
    counts: toStatusCounts(all),
    total: resource.data?.total ?? 0,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}

/**
 * `GET /api/reports?projectId=…` — the reports of ONE project.
 *
 * Deliberately the canonical list endpoint with a filter, not a new route:
 * `report.service.ts#resolveViewer` gives a COMPANY principal the scope
 * `{ project: { companyId } }` and `buildWhere` ALWAYS intersects the requested
 * `projectId` with it, so this cannot read another company's project — asking
 * for a foreign id returns an empty page rather than data. A PM principal is
 * likewise pinned to their own assigned project. No Backend change was needed
 * and no new authorization surface was added.
 */
export function useProjectReports(projectId: string | undefined): ReportsListResult {
  const enabled = !DEMO_MODE && !!projectId;
  const resource = useAsyncResource(
    (signal) =>
      backendReports.list(
        { projectId, pageSize: REPORTS_PAGE_SIZE, page: 1 } as ListReportsQuery,
        { signal },
      ),
    [projectId],
    { enabled },
  );

  if (DEMO_MODE) {
    return { status: "idle", reports: [], counts: {}, total: 0, errorMessage: null, reload: () => {} };
  }

  const all = (resource.data?.items ?? []).map((dto) => toReportViewModel(dto));
  return {
    status: resource.status,
    reports: all,
    counts: toStatusCounts(all),
    total: resource.data?.total ?? 0,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}

export interface ReportDetailResult {
  status: AsyncStatus;
  report: ReportDetailViewModel | null;
  timeline: ReportTimelineEventViewModel[];
  timelineStatus: AsyncStatus;
  errorMessage: string | null;
  notFound: boolean;
  reload: () => void;
  acting: boolean;
  actionError: string | null;
  /** Both are gated by the SERVER's `permissions`, re-checked on the endpoint. */
  approve: (input: { rating: number; comment?: string }) => Promise<boolean>;
  reopen: (input: { reason: string }) => Promise<boolean>;
}

function is404(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { httpStatus?: number }).httpStatus === 404;
}

export function useReportDetail(reportId: string | undefined): ReportDetailResult {
  const enabled = !DEMO_MODE && !!reportId;

  const resource = useAsyncResource<ReportDetailDto>(
    (signal) => backendReports.getById(reportId as string, { signal }),
    [reportId],
    { enabled },
  );

  /**
   * The canonical timeline is its own endpoint and its own scope check. It is
   * loaded alongside the report rather than derived from the status, so what the
   * screen shows is the real event log — including events (a failed routing
   * attempt, a reopen) that a status alone cannot express.
   */
  const timeline = useAsyncResource(
    (signal) => backendReports.getTimeline(reportId as string, { signal }),
    [reportId],
    { enabled },
  );

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<ReportDetailDto>): Promise<boolean> => {
      if (DEMO_MODE) return false;
      setActing(true);
      setActionError(null);
      try {
        const updated = await action();
        resource.setData(updated);
        timeline.reload();
        return true;
      } catch (err) {
        setActionError(arabicMessageFor(err));
        return false;
      } finally {
        setActing(false);
      }
    },
    [resource, timeline],
  );

  return {
    status: DEMO_MODE ? "idle" : resource.status,
    report: resource.data ? toReportDetailViewModel(resource.data) : null,
    timeline: toTimelineViewModel(timeline.data ?? []),
    timelineStatus: DEMO_MODE ? "idle" : timeline.status,
    errorMessage: resource.errorMessage,
    notFound: resource.status === "error" && is404(resource.error),
    reload: () => {
      resource.reload();
      timeline.reload();
    },
    acting,
    actionError,
    approve: (input) => run(() => backendReports.approve(reportId as string, input)),
    reopen: (input) => run(() => backendReports.reopen(reportId as string, input)),
  };
}

export interface ProvidersResult {
  status: AsyncStatus;
  providers: ReportProvidersDto | null;
  /** `false` = the honest "automatic analysis is unavailable" path, not an error. */
  analysisAvailable: boolean;
  mediaAvailable: boolean;
  objectDetectionAvailable: boolean;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * `GET /api/reports/providers`.
 *
 * Read BEFORE the analysis step so the journey can offer manual entry instead
 * of promising an analysis that cannot run. When the probe itself fails, the
 * flags stay `false` — "we could not confirm it works" is treated as
 * unavailable, never optimistically as available.
 */
export function useReportProviders(): ProvidersResult {
  const resource = useAsyncResource(
    (signal) => backendReports.getProviders({ signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  if (DEMO_MODE) {
    return {
      status: "idle",
      providers: null,
      analysisAvailable: true,
      mediaAvailable: true,
      objectDetectionAvailable: true,
      errorMessage: null,
      reload: () => {},
    };
  }

  return {
    status: resource.status,
    providers: resource.data,
    analysisAvailable: resource.data?.analysis.available === true,
    mediaAvailable: resource.data?.media.available === true,
    objectDetectionAvailable: resource.data?.objectDetection.available === true,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}
