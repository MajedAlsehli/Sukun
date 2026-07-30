/**
 * Canonical reports: Backend DTO -> the view model H9 (`MyReportsScreen`) and
 * H8 (`ReportJourneyScreen`) already render.
 *
 *   ReportSummaryDto / ReportDetailDto   (lib/backend/reports.ts)
 *     -> ReportViewModel                 (this file)
 *     -> unchanged MyReportsScreen
 *
 * The frozen H9 screen models a report as a `stage: 0..7` index into its own
 * eight-step `MASTER` timeline, plus `warranty: "in" | "out"` and an Arabic
 * priority string. The Backend models five statuses, a repair sub-state, a
 * five-value warranty verdict and three priority enums. The whole translation
 * lives here.
 *
 * Rules kept honest:
 *   * **Permissions are the server's.** `canApprove`/`canReopen` come straight
 *     off `ReportPermissionsDto` — the client never decides who may act.
 *   * **The AI block is nullable and stays nullable.** A manually-filed report
 *     has `ai: null`; it is never back-filled with a plausible confidence.
 *   * **The warranty verdict is a snapshot.** It was computed once at creation
 *     and is displayed, never recomputed against today's rules.
 */

import type {
  ReportCategoryDto,
  ReportDetailDto,
  ReportPriorityDto,
  ReportStatusDto,
  ReportStatusGroupDto,
  ReportSummaryDto,
  ReportTimelineEventDto,
  ReportWarrantyVerdictDto,
} from "@/lib/backend/reports";

/* --------------------------------------------------------------- vocabulary */

/** The nine Arabic category labels H8's own editor offers, joined to the enum. */
export const CATEGORY_LABELS: Record<ReportCategoryDto, string> = {
  PLUMBING: "سباكة",
  ELECTRICAL: "كهرباء",
  CRACKS: "تشققات",
  PAINT: "دهانات",
  DOORS: "أبواب",
  WINDOWS: "نوافذ",
  FLOORING: "أرضيات",
  CEILINGS: "أسقف",
  OTHER: "أخرى",
};

export const CATEGORY_VALUES: Record<string, ReportCategoryDto> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([k, v]) => [v, k as ReportCategoryDto]),
) as Record<string, ReportCategoryDto>;

/**
 * The three Arabic priority strings the frozen screens render. The fourth
 * severity H8's editor offers ("حرجة") has NO backend enum value — the
 * canonical report domain models three levels on purpose — so it is never
 * produced from real data and never sent.
 */
export const PRIORITY_LABELS: Record<ReportPriorityDto, string> = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
};

export const PRIORITY_VALUES: Record<string, ReportPriorityDto> = {
  منخفضة: "LOW",
  متوسطة: "MEDIUM",
  عالية: "HIGH",
  // H8's fourth severity has no canonical equivalent; it maps to the highest
  // real level rather than inventing a `CRITICAL` the Backend cannot store.
  حرجة: "HIGH",
};

/** H9's four filter keys, joined to the Backend's own status groups. */
export const FILTER_KEY_BY_STATUS_GROUP: Record<ReportStatusGroupDto, string> = {
  OPEN: "open",
  IN_PROGRESS: "inprogress",
  AWAITING_APPROVAL: "waiting",
  CLOSED: "closed",
};

export const STATUSES_BY_FILTER_KEY: Record<string, ReportStatusDto[]> = {
  open: ["ROUTING_PENDING", "ROUTED"],
  inprogress: ["IN_PROGRESS"],
  waiting: ["AWAITING_OWNER_APPROVAL"],
  closed: ["CLOSED"],
};

/**
 * The eight-step timeline the frozen detail screen renders, and the index each
 * real status lands on. `stage` is a DISPLAY projection of the server's status
 * and repair sub-state — it is never stored, sent, or used to decide an action.
 *
 *   0 تم إرسال البلاغ            ROUTING_PENDING
 *   1 تم استلام البلاغ            ROUTING_PENDING (routed attempt made)
 *   2 تم تعيين المقاول            ROUTED
 *   3 بدأ المقاول أعمال الإصلاح   IN_PROGRESS, repair just started
 *   4 جارٍ الإصلاح                IN_PROGRESS
 *   5 تم رفع صور بعد الإصلاح      repair SUBMITTED
 *   6 بانتظار اعتمادك             AWAITING_OWNER_APPROVAL
 *   7 تم الإغلاق                  CLOSED
 */
export function stageOf(dto: ReportSummaryDto): number {
  switch (dto.status) {
    case "ROUTING_PENDING":
      return dto.routing.attemptCount > 0 ? 1 : 0;
    case "ROUTED":
      return 2;
    case "IN_PROGRESS":
      if (dto.repair?.status === "REOPENED") return 3;
      return dto.photoCounts.before > 0 ? 4 : 3;
    case "AWAITING_OWNER_APPROVAL":
      return 6;
    case "CLOSED":
      return 7;
  }
}

/** The status chip's four presentations, exactly as the frozen screen defines them. */
export function statusPresentation(group: ReportStatusGroupDto): {
  text: string;
  key: string;
  color: string;
  bg: string;
  dot: string;
} {
  switch (group) {
    case "OPEN":
      return { text: "تم الاستلام", key: "open", color: "var(--err)", bg: "var(--err-bg)", dot: "var(--err)" };
    case "IN_PROGRESS":
      return {
        text: "قيد التنفيذ",
        key: "inprogress",
        color: "var(--warn-strong)",
        bg: "var(--warn-bg)",
        dot: "var(--warn)",
      };
    case "AWAITING_APPROVAL":
      return { text: "بانتظار موافقتك", key: "waiting", color: "var(--g-700)", bg: "var(--ok-bg)", dot: "var(--ok)" };
    case "CLOSED":
      return {
        text: "تم الإغلاق",
        key: "closed",
        color: "var(--t-secondary)",
        bg: "var(--n-surface2)",
        dot: "var(--t-tertiary)",
      };
  }
}

/**
 * The frozen screen renders a binary "داخل الضمان" / "خارج الضمان" chip. The
 * Backend has five verdicts. Only `COVERED` is inside; every other verdict —
 * including the two that mean "we could not evaluate" — reads as outside,
 * which is the truthful projection: the report is not covered.
 * `verdict` is carried through unchanged so the explanation can be specific.
 */
export function warrantyFlagOf(verdict: ReportWarrantyVerdictDto): "in" | "out" {
  return verdict === "COVERED" ? "in" : "out";
}

/**
 * The Arabic name of the warranty CATEGORY the verdict was computed against
 * (`warranty.categoryKey`), which is not the same thing as the report's own
 * category. PM2 used to inherit a fixture's `coverageType`, so a تشققات report
 * displayed "سباكة أساسية" — a plumbing coverage line on a structural defect.
 * `null` means the Backend recorded no category rule for this report.
 */
export const WARRANTY_CATEGORY_LABELS: Record<string, string> = {
  STRUCTURE: "الهيكل الإنشائي",
  PLUMBING: "السباكة",
  ELECTRICAL: "الكهرباء",
  DOORS_WINDOWS: "الأبواب والنوافذ",
  PAINT_FINISHING: "الدهانات والتشطيبات",
  MISUSE_EXCLUSION: "أضرار سوء الاستخدام (مستثناة)",
};

export function warrantyCategoryLabelOf(categoryKey: string | null): string | null {
  if (!categoryKey) return null;
  return WARRANTY_CATEGORY_LABELS[categoryKey] ?? null;
}

/** The four SLA states, in Arabic. `NOT_CONFIGURED` is stated, never hidden. */
export const SLA_LABELS: Record<string, string> = {
  NOT_CONFIGURED: "لا توجد مدة مستهدفة محددة",
  ON_TIME: "ضمن المدة",
  AT_RISK: "يقترب من تجاوز المدة",
  BREACHED: "تجاوز المدة",
  MET: "أُنجز ضمن المدة",
};

export function slaLabelOf(state: string): string {
  return SLA_LABELS[state] ?? SLA_LABELS.NOT_CONFIGURED;
}

/** A specific, honest sentence per real verdict + reason code. */
export function warrantyExplanationOf(
  verdict: ReportWarrantyVerdictDto,
  reasonCode: string,
  categoryLabel: string,
): string {
  switch (verdict) {
    case "COVERED":
      return `هذا البلاغ مشمول بالضمان: عطل «${categoryLabel}» يقع ضمن التغطية السارية لوحدتك وقت رفع البلاغ.`;
    case "NOT_COVERED":
      if (reasonCode === "PERIOD_EXPIRED") {
        return `هذا البلاغ غير مشمول بالضمان: انتهت فترة تغطية «${categoryLabel}» قبل تاريخ رفع البلاغ.`;
      }
      if (reasonCode === "CATEGORY_EXCLUDED") {
        return `هذا البلاغ غير مشمول بالضمان: «${categoryLabel}» مستثنى من التغطية.`;
      }
      return `هذا البلاغ غير مشمول بالضمان: «${categoryLabel}» يقع خارج نطاق التغطية.`;
    case "NOT_CONFIGURED":
      return `لا توجد قاعدة ضمان محدّدة لـ«${categoryLabel}»، لذلك لم يُصنَّف البلاغ داخل الضمان. سيُقيَّم البلاغ على أي حال.`;
    case "NO_WARRANTY":
      return "لا يوجد ضمان مسجّل على هذه الوحدة، لذلك لم يُصنَّف البلاغ داخل الضمان. سيُقيَّم البلاغ على أي حال.";
    case "NOT_EVALUATED_LEGACY":
      return "هذا البلاغ سابق لتطبيق قواعد الضمان الحالية، ولم يُقيَّم بها. سيُراجَع يدوياً.";
  }
}

/* -------------------------------------------------------------- view models */

export interface ReportViewModel {
  id: string;
  /** "#2432" — the display form of the real `reportNumber`. */
  number: string;
  reportNumber: number;
  title: string;
  date: string;
  createdAt: string;
  warranty: "in" | "out";
  warrantyVerdict: ReportWarrantyVerdictDto;
  warrantyReasonCode: string;
  warrantyExplanation: string;
  priority: string;
  priorityIsAiDerived: boolean;
  category: string;
  categoryKey: ReportCategoryDto;
  /** `null` when this report was filed without a validated AI analysis. */
  confidence: number | null;
  aiDescription: string | null;
  aiExplanation: string | null;
  stage: number;
  status: ReportStatusDto;
  statusGroup: ReportStatusGroupDto;
  key: string;
  text: string;
  color: string;
  bg: string;
  dot: string;
  /** The server's own decision about what this viewer may do. */
  canApprove: boolean;
  canReopen: boolean;
  technicianName: string | null;
  /** The technician's real trade, e.g. "كهرباء". `null` when unrecorded. */
  technicianSpecialty: string | null;
  /** The report's own homeowner, for the Company/PM projections that show it. */
  homeownerName: string | null;
  reopenCount: number;
  homeownerNote: string | null;

  /**
   * The report's real location. Every field below comes from
   * `ReportLocationDto`, which the Backend has always sent — PM2 was rendering
   * `"—"` for the building, floor and unit of a report that has all three, and
   * was printing the CATEGORY where the project name belongs.
   */
  projectName: string;
  projectCity: string;
  buildingName: string;
  buildingNumber: string;
  unitNumber: string;
  unitFloor: number | null;

  /** The warranty category the verdict was computed against, in Arabic. */
  warrantyCategoryLabel: string | null;
  warrantyPeriodStart: string | null;
  warrantyPeriodEnd: string | null;

  slaState: string;
  slaLabel: string;
  slaDueAt: string | null;

  /** Repair facts, or `null` when no repair has started. Never invented. */
  repairStartedAt: string | null;
  repairSubmittedAt: string | null;
  repairDurationMinutes: number | null;
  repairNote: string | null;

  /** The homeowner's own review, when one exists. */
  reviewRating: number | null;
  reviewComment: string | null;
  reviewAt: string | null;

  closedAt: string | null;
}

export interface ReportDetailViewModel extends ReportViewModel {
  media: { id: string; stage: string; url: string; sortOrder: number }[];
  beforePhotos: string[];
  afterPhotos: string[];
  homeownerPhotos: string[];
}

function dateLabel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "قبل يومين";
  if (days < 7) return `قبل ${days} أيام`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "قبل أسبوع";
  if (weeks === 2) return "قبل أسبوعين";
  if (weeks < 5) return `قبل ${weeks} أسابيع`;
  const months = Math.floor(days / 30);
  return months === 1 ? "قبل شهر" : `قبل ${months} أشهر`;
}

export function toReportViewModel(dto: ReportSummaryDto, now: Date = new Date()): ReportViewModel {
  const presentation = statusPresentation(dto.statusGroup);
  const categoryLabel = CATEGORY_LABELS[dto.category] ?? dto.category;
  return {
    id: dto.id,
    number: `#${dto.reportNumber}`,
    reportNumber: dto.reportNumber,
    title: dto.problemText,
    date: dateLabel(dto.createdAt, now),
    createdAt: dto.createdAt,
    warranty: warrantyFlagOf(dto.warranty.verdict),
    warrantyVerdict: dto.warranty.verdict,
    warrantyReasonCode: dto.warranty.reasonCode,
    warrantyExplanation: warrantyExplanationOf(
      dto.warranty.verdict,
      dto.warranty.reasonCode,
      categoryLabel,
    ),
    priority: PRIORITY_LABELS[dto.priority] ?? dto.priority,
    priorityIsAiDerived: dto.prioritySource === "AI",
    category: categoryLabel,
    categoryKey: dto.category,
    confidence: dto.ai?.confidence ?? null,
    aiDescription: dto.ai?.problemText ?? null,
    aiExplanation: dto.ai?.explanation ?? null,
    stage: stageOf(dto),
    status: dto.status,
    statusGroup: dto.statusGroup,
    key: presentation.key,
    text: presentation.text,
    color: presentation.color,
    bg: presentation.bg,
    dot: presentation.dot,
    canApprove: dto.permissions.canApprove,
    canReopen: dto.permissions.canReopen,
    technicianName: dto.technician?.name ?? null,
    technicianSpecialty: dto.technician?.specialty ?? null,
    homeownerName: dto.homeowner?.name ?? null,
    reopenCount: dto.reopenCount,
    homeownerNote: dto.homeownerNote,

    projectName: dto.location.projectName,
    projectCity: dto.location.projectCity,
    buildingName: dto.location.buildingName,
    buildingNumber: dto.location.buildingNumber,
    unitNumber: dto.location.unitNumber,
    unitFloor: dto.location.unitFloor ?? null,

    warrantyCategoryLabel: warrantyCategoryLabelOf(dto.warranty.categoryKey),
    warrantyPeriodStart: dto.warranty.periodStart,
    warrantyPeriodEnd: dto.warranty.periodEnd,

    slaState: dto.sla.state,
    slaLabel: slaLabelOf(dto.sla.state),
    slaDueAt: dto.sla.dueAt,

    repairStartedAt: dto.repair?.startedAt ?? null,
    repairSubmittedAt: dto.repair?.submittedAt ?? null,
    repairDurationMinutes: dto.repair?.durationMinutes ?? null,
    repairNote: dto.repair?.technicianNote ?? null,

    reviewRating: dto.review?.rating ?? null,
    reviewComment: dto.review?.comment ?? null,
    reviewAt: dto.review?.createdAt ?? null,

    closedAt: dto.closedAt,
  };
}

export function toReportDetailViewModel(
  dto: ReportDetailDto,
  now: Date = new Date(),
): ReportDetailViewModel {
  const media = [...dto.media].sort((a, b) => a.sortOrder - b.sortOrder);
  const urlsFor = (stage: string) => media.filter((m) => m.stage === stage).map((m) => m.url);
  return {
    ...toReportViewModel(dto, now),
    media: media.map((m) => ({ id: m.id, stage: m.stage, url: m.url, sortOrder: m.sortOrder })),
    homeownerPhotos: urlsFor("HOMEOWNER"),
    beforePhotos: urlsFor("BEFORE"),
    afterPhotos: urlsFor("AFTER"),
  };
}

/* ------------------------------------------------------------------ counts */

export function toStatusCounts(reports: ReportViewModel[]): Record<string, number> {
  const counts: Record<string, number> = { open: 0, inprogress: 0, waiting: 0, closed: 0 };
  for (const r of reports) counts[r.key] = (counts[r.key] ?? 0) + 1;
  return counts;
}

/* ---------------------------------------------------------------- timeline */

export interface ReportTimelineEventViewModel {
  id: string;
  type: string;
  label: string;
  actorName: string | null;
  createdAt: string;
}

/**
 * Every value of the Backend's `ReportTimelineEventType` enum, in Arabic.
 *
 * This map is COMPLETE against `prisma/schema.prisma#ReportTimelineEventType`
 * as deployed. It previously covered nine names, four of which the Backend
 * does not emit at all (`ROUTING_ATTEMPTED`, `ROUTED`, `ROUTING_FAILED`,
 * `REPORT_APPROVED`, `REPORT_REOPENED`), while five names it DOES emit were
 * missing — so a real Arabic timeline printed `TECHNICIAN_ASSIGNED`,
 * `AI_ANALYSIS_RECORDED`, `WARRANTY_EVALUATED`, `HOMEOWNER_APPROVED` and
 * `REVIEW_SUBMITTED` at the user. The obsolete names are kept as aliases so an
 * older stored event still reads correctly rather than falling through.
 */
export const TIMELINE_LABELS: Record<string, string> = {
  REPORT_CREATED: "تم إرسال البلاغ",
  AI_ANALYSIS_RECORDED: "تم تحليل الصور آلياً",
  AI_ANALYSIS_UNAVAILABLE: "تعذّر التحليل الآلي",
  WARRANTY_EVALUATED: "تم التحقق من الضمان",
  ROUTING_PENDING_RECORDED: "تم استلام البلاغ",
  TECHNICIAN_ASSIGNED: "تم تعيين المقاول",
  ROUTING_RETRIED: "إعادة محاولة تعيين مقاول",
  REPAIR_STARTED: "بدأ المقاول أعمال الإصلاح",
  REPAIR_MEDIA_ADDED: "تم رفع صور الإصلاح",
  REPAIR_SUBMITTED: "تم رفع صور بعد الإصلاح",
  HOMEOWNER_APPROVED: "اعتمد المالك الإصلاح",
  HOMEOWNER_REOPENED: "أعاد المالك فتح البلاغ",
  REPORT_CLOSED: "تم الإغلاق",
  REVIEW_SUBMITTED: "تم تسجيل تقييم المالك",
  LEGACY_IMPORTED: "تم استيراد البلاغ من سجل سابق",

  // Superseded names, kept so historical rows still render in Arabic.
  ROUTING_ATTEMPTED: "تم استلام البلاغ",
  ROUTED: "تم تعيين المقاول",
  ROUTING_FAILED: "تعذّر تعيين مقاول",
  REPORT_APPROVED: "تم اعتماد الإصلاح",
  REPORT_REOPENED: "تمت إعادة فتح البلاغ",
};

/**
 * The safe fallback. A machine enum is never rendered to an Arabic reader: a
 * future event type the frontend has not learned yet is still a real event and
 * is still shown, but it is described in Arabic rather than as
 * `SOME_NEW_EVENT_TYPE`.
 */
export const TIMELINE_FALLBACK_LABEL = "تحديث على البلاغ";

/** Arabic for any canonical report event type. Never returns a raw enum. */
export function timelineLabelFor(type: string): string {
  return TIMELINE_LABELS[type] ?? TIMELINE_FALLBACK_LABEL;
}

export function toTimelineViewModel(
  events: ReportTimelineEventDto[],
): ReportTimelineEventViewModel[] {
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    label: timelineLabelFor(e.type),
    actorName: e.actorName,
    createdAt: e.createdAt,
  }));
}
