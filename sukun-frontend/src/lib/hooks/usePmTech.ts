"use client";

/**
 * PM1/PM2/PM3 and C1/C2/C3 data layers.
 *
 *   lib/backend/{pm,technician,reports}.ts -> THIS -> unchanged screens
 *
 * Inert in Demo Mode throughout. No fixture fallback in real mode.
 *
 * The PM hooks deliberately expose the Backend's honest states as first-class
 * fields rather than flattening them:
 *   `assigned: false`        — an unassigned manager, not an error;
 *   `slaCompliancePercent`   — `null` means no determined outcome, NOT 0 %;
 *   `rules`                  — an unconfigured threshold means that alert type
 *                              was never generated, which the UI may say.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import {
  backendPm,
  type PmActivityItemDto,
  type PmAlertDto,
  type PmAlertRulesDto,
  type PmContractorItemDto,
  type PmContractorPerformanceDto,
  type PmKpisDto,
  type PmOverviewDto,
} from "@/lib/backend/pm";
import {
  backendTechnician,
  type RepairHistoryItemDto,
  type RepairPhotoUpload,
  type TechnicianRepairStatsDto,
  type TechnicianTaskSummaryDto,
} from "@/lib/backend/technician";
import { backendReports, type ReportSummaryDto } from "@/lib/backend/reports";
import {
  toReportDetailViewModel,
  toReportViewModel,
  toTimelineViewModel,
  type ReportDetailViewModel,
  type ReportTimelineEventViewModel,
  type ReportViewModel,
} from "@/lib/adapters/reports";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

const idle = { status: "idle" as AsyncStatus, errorMessage: null, reload: () => {} };

/* ------------------------------------------------------------------- PM1 */

export interface PmOperationsResult {
  status: AsyncStatus;
  /** `false` = this manager has no project assigned. An honest state. */
  assigned: boolean;
  overview: PmOverviewDto | null;
  kpis: PmKpisDto | null;
  alerts: PmAlertDto[];
  alertRules: PmAlertRulesDto | null;
  activity: PmActivityItemDto[];
  reports: ReportViewModel[];
  /** The raw summaries, for anything needing a field the view model drops. */
  reportDtos: ReportSummaryDto[];
  errorMessage: string | null;
  reload: () => void;
}

export function usePmOperations(): PmOperationsResult {
  const enabled = !DEMO_MODE;
  const overview = useAsyncResource((s) => backendPm.overview(undefined, { signal: s }), [], { enabled });
  const alerts = useAsyncResource((s) => backendPm.alerts(undefined, { signal: s }), [], { enabled });
  const activity = useAsyncResource((s) => backendPm.activity({ limit: 20 }, { signal: s }), [], { enabled });
  const reports = useAsyncResource((s) => backendPm.reports({ pageSize: 50 }, { signal: s }), [], { enabled });

  if (DEMO_MODE) {
    return {
      ...idle, assigned: false, overview: null, kpis: null,
      alerts: [], alertRules: null, activity: [], reports: [], reportDtos: [],
    };
  }

  const dtos = reports.data?.items ?? [];
  return {
    status: overview.status,
    assigned: overview.data?.assigned ?? false,
    overview: overview.data,
    kpis: overview.data?.kpis ?? null,
    alerts: alerts.data?.items ?? [],
    alertRules: alerts.data?.rules ?? null,
    activity: activity.data?.items ?? [],
    reports: dtos.map((d) => toReportViewModel(d)),
    reportDtos: dtos,
    errorMessage: overview.errorMessage ?? alerts.errorMessage ?? reports.errorMessage,
    reload: () => {
      overview.reload();
      alerts.reload();
      activity.reload();
      reports.reload();
    },
  };
}

/* ------------------------------------------------------------------- PM3 */

export interface PmContractorsResult {
  status: AsyncStatus;
  assigned: boolean;
  contractors: PmContractorItemDto[];
  errorMessage: string | null;
  reload: () => void;
}

export function usePmContractors(): PmContractorsResult {
  const res = useAsyncResource((s) => backendPm.contractors(undefined, { signal: s }), [], {
    enabled: !DEMO_MODE,
  });
  if (DEMO_MODE) return { ...idle, assigned: false, contractors: [] };
  return {
    status: res.status,
    assigned: res.data?.assigned ?? false,
    contractors: res.data?.items ?? [],
    errorMessage: res.errorMessage,
    reload: res.reload,
  };
}

export interface PmContractorDetailResult {
  status: AsyncStatus;
  performance: PmContractorPerformanceDto | null;
  /** OpenAI-backed. `available: false` is the honest-unavailable contract. */
  insight: { available: boolean; text: string | null; reason?: string } | null;
  errorMessage: string | null;
  reload: () => void;
}

export function usePmContractorDetail(technicianId: string | null): PmContractorDetailResult {
  const enabled = !DEMO_MODE && !!technicianId;
  const perf = useAsyncResource(
    (s) => backendPm.contractorPerformance(technicianId as string, undefined, { signal: s }),
    [technicianId],
    { enabled },
  );
  const insight = useAsyncResource(
    (s) => backendPm.contractorInsight(technicianId as string, undefined, { signal: s }),
    [technicianId],
    { enabled },
  );
  if (DEMO_MODE) return { ...idle, performance: null, insight: null };
  return {
    status: perf.status,
    performance: perf.data,
    insight: insight.data
      ? { available: insight.data.available, text: insight.data.text ?? null, reason: insight.data.reason }
      // A FAILED insight probe is treated as unavailable, never as available.
      : insight.status === "error"
        ? { available: false, text: null, reason: "AI_SERVICE_UNAVAILABLE" }
        : null,
    errorMessage: perf.errorMessage,
    reload: () => {
      perf.reload();
      insight.reload();
    },
  };
}

/* --------------------------------------------------------- PM Copilot */

export interface CopilotResult {
  asking: boolean;
  /** `null` until asked. `available:false` is the honest-unavailable answer. */
  answer: { available: boolean; text: string | null; reason?: string } | null;
  error: string | null;
  summarize: () => Promise<void>;
  ask: (question: string) => Promise<void>;
}

export function usePmCopilot(): CopilotResult {
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<CopilotResult["answer"]>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (fn: () => Promise<{ available: boolean; text?: string | null; reason?: string }>) => {
    if (DEMO_MODE) return;
    setAsking(true);
    setError(null);
    try {
      const r = await fn();
      setAnswer({ available: r.available, text: r.text ?? null, reason: r.reason });
    } catch (err) {
      // Never a fabricated answer — the console shows the real failure.
      setAnswer(null);
      setError(arabicMessageFor(err));
    } finally {
      setAsking(false);
    }
  }, []);

  return {
    asking,
    answer,
    error,
    summarize: () => call(() => backendPm.copilotSummary({})),
    // The Backend field is `message` (pm.dto.ts#pmCopilotChatSchema).
    ask: (question: string) => call(() => backendPm.copilotChat({ message: question })),
  };
}

/* --------------------------------------------------------------- C1/C3 */

export interface TechnicianTasksResult {
  status: AsyncStatus;
  tasks: ReportViewModel[];
  taskDtos: ReportSummaryDto[];
  summary: TechnicianTaskSummaryDto | null;
  errorMessage: string | null;
  reload: () => void;
  acting: boolean;
  actionError: string | null;
  /** Both are gated by the SERVER's `permissions` and re-enforced on the endpoint. */
  startRepair: (reportId: string, beforePhotos?: RepairPhotoUpload[]) => Promise<boolean>;
  submitRepair: (reportId: string, afterPhotos: RepairPhotoUpload[], note?: string) => Promise<boolean>;
}

export function useTechnicianTasks(): TechnicianTasksResult {
  const enabled = !DEMO_MODE;
  const tasks = useAsyncResource((s) => backendTechnician.tasks({ pageSize: 50 }, { signal: s }), [], { enabled });
  const summary = useAsyncResource((s) => backendTechnician.taskSummary({ signal: s }), [], { enabled });

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (DEMO_MODE) return true;
      setActing(true);
      setActionError(null);
      try {
        await fn();
        tasks.reload();
        summary.reload();
        return true;
      } catch (err) {
        // A 409 ACTIVE_REPAIR_EXISTS lands here and is SHOWN, not retried
        // around — one active repair per technician is a real rule.
        setActionError(arabicMessageFor(err));
        return false;
      } finally {
        setActing(false);
      }
    },
    [tasks, summary],
  );

  const dtos = tasks.data?.items ?? [];
  return {
    status: DEMO_MODE ? "idle" : tasks.status,
    tasks: dtos.map((d) => toReportViewModel(d)),
    taskDtos: dtos,
    summary: summary.data,
    errorMessage: tasks.errorMessage,
    reload: () => {
      tasks.reload();
      summary.reload();
    },
    acting,
    actionError,
    startRepair: (id, beforePhotos) =>
      run(() => backendTechnician.startRepair(id, beforePhotos ? { beforePhotos } : {})),
    submitRepair: (id, afterPhotos, note) =>
      run(() => backendTechnician.submitRepair(id, { afterPhotos, note })),
  };
}

export interface RepairHistoryResult {
  status: AsyncStatus;
  history: ReportViewModel[];
  /**
   * The REPAIR rows, each with its report nested on `.report` — the envelope
   * the endpoint actually returns. C3 needs both halves: the duration, note and
   * review belong to the repair, the number/location/media to the report.
   */
  historyDtos: RepairHistoryItemDto[];
  /** Real aggregates from the Backend; `null` fields stay null, never 0. */
  stats: TechnicianRepairStatsDto | null;
  errorMessage: string | null;
  reload: () => void;
}

export function useRepairHistory(): RepairHistoryResult {
  const res = useAsyncResource((s) => backendTechnician.repairHistory({ pageSize: 50 }, { signal: s }), [], {
    enabled: !DEMO_MODE,
  });
  if (DEMO_MODE) return { ...idle, history: [], historyDtos: [], stats: null };
  const dtos = res.data?.items ?? [];
  return {
    status: res.status,
    history: dtos.map((d) => toReportViewModel(d.report)),
    historyDtos: dtos,
    stats: res.data?.stats ?? null,
    errorMessage: res.errorMessage,
    reload: res.reload,
  };
}

/**
 * C3's detail panel renders the report's journey. The frozen screen carries an
 * eight-step checklist drawn ALL-COMPLETE, which is true of the fixture but
 * asserts steps a real report may never have had — an AI analysis that was
 * never recorded, after-photos that were never uploaded. In real mode the
 * canonical event log is the only honest source, so C3 reads it directly.
 */
export function useReportTimeline(reportId: string | undefined): {
  status: AsyncStatus;
  timeline: ReportTimelineEventViewModel[];
} {
  const tl = useAsyncResource((s) => backendReports.getTimeline(reportId as string, { signal: s }), [reportId], {
    enabled: !DEMO_MODE && !!reportId,
  });
  if (DEMO_MODE) return { status: "idle", timeline: [] };
  return { status: tl.status, timeline: toTimelineViewModel(tl.data ?? []) };
}

/* --------------------------------------------------------------- PM2 */

export interface ReportMonitorResult {
  status: AsyncStatus;
  report: ReportDetailViewModel | null;
  timeline: ReportTimelineEventViewModel[];
  errorMessage: string | null;
  notFound: boolean;
  reload: () => void;
}

/**
 * PM2 is READ-ONLY by construction, for both PM and Company viewers: the
 * canonical API admits no supervisory write on a report, so `permissions`
 * returns all-false and there is nothing here to mutate.
 */
export function useReportMonitor(reportId: string | undefined): ReportMonitorResult {
  const enabled = !DEMO_MODE && !!reportId;
  const res = useAsyncResource((s) => backendReports.getById(reportId as string, { signal: s }), [reportId], {
    enabled,
  });
  const tl = useAsyncResource((s) => backendReports.getTimeline(reportId as string, { signal: s }), [reportId], {
    enabled,
  });

  if (DEMO_MODE) return { ...idle, report: null, timeline: [], notFound: false };

  return {
    status: res.status,
    report: res.data ? toReportDetailViewModel(res.data) : null,
    timeline: toTimelineViewModel(tl.data ?? []),
    errorMessage: res.errorMessage,
    notFound:
      res.status === "error" &&
      typeof res.error === "object" &&
      res.error !== null &&
      (res.error as { httpStatus?: number }).httpStatus === 404,
    reload: () => {
      res.reload();
      tl.reload();
    },
  };
}
