/**
 * The LIVE `SaknAi` implementation — the real Storage -> YOLO -> OpenAI path.
 *
 * `contract.ts` was written as the future wire format and `client.ts` says the
 * swap is one line. This is that implementation; no component, prop or state
 * shape changes because of it.
 *
 * ── analyzeDefect: what actually happens ─────────────────────────────────────
 *
 *   File[]  --base64-->  POST /api/reports/media    (one call per photo)
 *                          -> PRIVATE Supabase bucket, server-derived key
 *                          -> { key, url(signed), mimeType, sizeBytes }
 *           --keys---->  POST /api/reports/analyze
 *                          -> Backend authorizes the caller owns those keys
 *                          -> YOLO object detection (advisory context only)
 *                          -> OpenAI analysis, validated + confidence-clamped
 *                          -> persisted ReportAnalysis row
 *                          -> { analysisId, category, problemText, priority,
 *                               confidence, explanation, provider, model,
 *                               detectionsAvailable }
 *
 * Properties this file is responsible for:
 *
 *  * **No image data is ever logged.** There is no `console.*` call in this
 *    module at all, and the base64 payload is passed straight to the client and
 *    then dropped.
 *  * **No service key reaches the browser.** The frontend never talks to
 *    Supabase. It sends bytes to the Backend, which holds the service
 *    credential, and receives back a short-lived SIGNED url.
 *  * **No fabricated AI response, ever.** When the provider is unconfigured the
 *    Backend answers `AI_ANALYSIS_UNAVAILABLE` and this module lets that
 *    rejection propagate, so the frozen screen shows its real error banner and
 *    its manual-entry path. A plausible-looking placeholder is never returned.
 *  * **Honest timeouts.** YOLO runs on a service that cold-starts, so an
 *    analysis can legitimately take 15-60s. Nothing here shortens or fakes
 *    that; the approved "analyzing" screen simply stays up, and a genuine
 *    failure surfaces as a failure.
 */

import type {
  AdvisorReply,
  AdvisorReplyInput,
  AnalyzeDefectInput,
  DefectAnalysis,
  DefectCategory,
  DefectSeverity,
  RepairComparison,
  RepairComparisonInput,
  SaknAi,
  WarrantyOpinion,
  WarrantyOpinionInput,
} from "./contract";
import {
  backendReports,
  type ReportCategoryDto,
  type ReportMediaMimeType,
  type ReportPriorityDto,
} from "@/lib/backend/reports";
import { CATEGORY_LABELS, CATEGORY_VALUES, PRIORITY_VALUES } from "@/lib/adapters/reports";
import { ApiError } from "@/lib/backend/errors";

/** The three mime types `report-media-storage.ts` accepts. */
const ALLOWED_MIME: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** Backend `ReportPriority` -> the Arabic severity H8 renders. */
const SEVERITY_BY_PRIORITY: Record<ReportPriorityDto, DefectSeverity> = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
};

/**
 * Reads a `File` as raw base64 WITHOUT the `data:` prefix — the Backend's
 * `uploadReportMediaSchema` decodes the payload directly.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** A file whose type the Backend cannot store must fail here, not silently upload. */
export function assertUploadableMimeType(type: string): asserts type is ReportMediaMimeType {
  if (!ALLOWED_MIME.includes(type)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "صيغة الصورة غير مدعومة. نقبل صيغ JPG وPNG وWebP.",
      400,
    );
  }
}

export interface StagedMedia {
  key: string;
  /** Short-lived SIGNED url for the private object. Not a durable link. */
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Stages every photo, sequentially.
 *
 * Sequential on purpose: each upload carries a multi-megabyte base64 body, and
 * the Backend caps the JSON body at 25 MB. Firing ten in parallel from a phone
 * is how you get a partial failure with no way to say which photo did not make
 * it — the resident's evidence is not something to be casual with.
 */
export async function stageMedia(files: File[]): Promise<StagedMedia[]> {
  const staged: StagedMedia[] = [];
  for (const file of files) {
    assertUploadableMimeType(file.type);
    const contentBase64 = await fileToBase64(file);
    const result = await backendReports.uploadMedia({
      fileName: file.name,
      mimeType: file.type as ReportMediaMimeType,
      contentBase64,
    });
    staged.push(result);
  }
  return staged;
}

/**
 * The staging keys produced by the most recent `analyzeDefect` call.
 *
 * `POST /api/reports` needs the same `mediaKeys` the analysis was run over —
 * the Backend rejects a mismatch with `ANALYSIS_MEDIA_MISMATCH` — but the frozen
 * `DefectAnalysis` contract has no field for them. Rather than change the shape
 * every component reads, they are held here and read back by
 * `lib/hooks/useReportJourney.ts` at submit time.
 */
const stagedKeysByAnalysis = new Map<string, string[]>();

export function stagedKeysFor(analysisId: string): string[] | undefined {
  return stagedKeysByAnalysis.get(analysisId);
}

export function rememberStagedKeys(analysisId: string, keys: string[]): void {
  stagedKeysByAnalysis.set(analysisId, keys);
}

export function forgetStagedKeys(analysisId: string): void {
  stagedKeysByAnalysis.delete(analysisId);
}

function toDefectCategory(category: ReportCategoryDto): DefectCategory {
  return (CATEGORY_LABELS[category] ?? "أخرى") as DefectCategory;
}

export const liveAi: SaknAi = {
  async analyzeDefect(input: AnalyzeDefectInput): Promise<DefectAnalysis> {
    const startedAt = Date.now();
    const staged = await stageMedia(input.images);
    const mediaKeys = staged.map((s) => s.key);

    // Propagates AI_ANALYSIS_UNAVAILABLE / REPORT_MEDIA_STORAGE_NOT_CONFIGURED
    // untouched — the screen's real error path, not a substituted result.
    const result = await backendReports.analyze({
      mediaKeys,
      note: input.note?.trim() || undefined,
    });

    rememberStagedKeys(result.analysisId, mediaKeys);

    return {
      analysisId: result.analysisId,
      model: result.model,
      source: "live",
      latencyMs: Date.now() - startedAt,
      summary: result.problemText,
      category: toDefectCategory(result.category),
      confidence: result.confidence,
      severity: SEVERITY_BY_PRIORITY[result.priority] ?? "متوسطة",
      // The canonical report domain models no per-report location field, so
      // nothing is invented here. The resident may type one in the edit step;
      // `useReportJourney` carries it into the report's own note rather than
      // dropping it.
      location: "",
      probableCause: result.explanation ?? "",
      // The analyze response reports only WHETHER detection contributed
      // (`detectionsAvailable`), never the boxes, so there is no overlay to
      // draw. `null` is the contract's own "no box" value.
      boundingBox: null,
      // The Backend returns no action list; an empty array renders nothing,
      // which is honest. Inventing advice the model never gave is not.
      recommendedActions: [],
    };
  },

  async warrantyOpinion(input: WarrantyOpinionInput): Promise<WarrantyOpinion> {
    const startedAt = Date.now();
    const category = (CATEGORY_VALUES[String(input.category)] ?? "OTHER") as ReportCategoryDto;
    const result = await backendReports.warrantyCheck({ category });

    const label = CATEGORY_LABELS[category] ?? String(input.category);
    const covered = result.verdict === "COVERED";

    return {
      analysisId: `${result.rulesVersion}:${category}`,
      model: `warranty-rules@${result.rulesVersion}`,
      source: "live",
      latencyMs: Date.now() - startedAt,
      covered,
      rationale: rationaleFor(result.verdict, result.reasonCode, label),
      coverageType: label,
      coveragePeriod: periodLabel(result.periodStart, result.periodEnd),
      // The rules engine returns a verdict and a reason code, not a caveat
      // list. An empty array renders nothing rather than inventing conditions.
      caveats: [],
    };
  },

  /**
   * No canonical endpoint compares before/after photos. The Backend's own
   * before/after media exist, but nothing scores them — Task 8 deliberately
   * shipped no such provider. Rejecting is the honest answer; a fabricated
   * "94% complete" is exactly the kind of fake AI result this integration must
   * never produce.
   */
  async compareRepair(_input: RepairComparisonInput): Promise<RepairComparison> {
    throw new ApiError(
      "AI_ANALYSIS_UNAVAILABLE",
      "مقارنة صور ما قبل وبعد الإصلاح غير متاحة حالياً.",
      503,
    );
  },

  /**
   * The advisor console has no canonical Backend endpoint either. `/api/pm/copilot/*`
   * is the project manager's assistant, scoped to a PM principal, and is a
   * Task 3 surface — pointing a home seeker's console at it would be both a
   * role violation and a different product.
   */
  async advisorReply(_input: AdvisorReplyInput): Promise<AdvisorReply> {
    throw new ApiError(
      "AI_ANALYSIS_UNAVAILABLE",
      "المستشار الذكي غير متاح حالياً.",
      503,
    );
  },
};

function rationaleFor(verdict: string, reasonCode: string, label: string): string {
  switch (verdict) {
    case "COVERED":
      return `«${label}» مشمول بالضمان الساري على وحدتك حالياً.`;
    case "NOT_COVERED":
      if (reasonCode === "PERIOD_EXPIRED") return `انتهت فترة تغطية «${label}» لوحدتك.`;
      if (reasonCode === "CATEGORY_EXCLUDED") return `«${label}» مستثنى من تغطية الضمان.`;
      return `«${label}» يقع خارج نطاق تغطية الضمان.`;
    case "NO_WARRANTY":
      return "لا يوجد ضمان مسجّل على هذه الوحدة. يمكنك رفع البلاغ على أي حال.";
    case "NOT_CONFIGURED":
      return `لا توجد قاعدة ضمان محدّدة لـ«${label}». يمكنك رفع البلاغ على أي حال.`;
    default:
      return "تعذّر تحديد حالة الضمان لهذا النوع. سيُراجَع البلاغ يدوياً.";
  }
}

function periodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "غير محدّدة";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

export { PRIORITY_VALUES };
