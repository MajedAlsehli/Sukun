/**
 * The AI contract — the ONLY thing screens are allowed to know about the
 * assistant. Every type here is written as the future HTTP payload, not as
 * whatever the current mock happens to return, so `client.ts` can swap its
 * body from `mockAnalyzeDefect(...)` to `fetch("/ai/defect-analysis")`
 * without a single component changing.
 *
 * Conventions chosen to match a realistic service:
 * - every call is async and can reject (screens must render an error state)
 * - every result carries `analysisId` + `model` so a report can cite which
 *   inference produced it
 * - `confidence` is 0-100 int, never a float string
 * - free text is Arabic, because that is what the UI renders verbatim
 */

/** Discriminates a real inference from a mocked one — surfaced nowhere in UI, useful in logs. */
export type AiSource = "mock" | "live";

export interface AiEnvelope {
  analysisId: string;
  model: string;
  source: AiSource;
  /** Milliseconds the inference took — drives nothing visually, kept for parity with the real API. */
  latencyMs: number;
}

/* ---------------------------------------------------------------- defects */

export type DefectSeverity = "منخفضة" | "متوسطة" | "عالية" | "حرجة";

/** The 9 categories H8's own editor offers — the model must return one of these. */
export const DEFECT_CATEGORIES = [
  "سباكة",
  "كهرباء",
  "تشققات",
  "دهانات",
  "أبواب",
  "نوافذ",
  "أرضيات",
  "أسقف",
  "أخرى",
] as const;
export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export interface DefectAnalysis extends AiEnvelope {
  /** What the model thinks is wrong, one short Arabic sentence. */
  summary: string;
  category: DefectCategory;
  /** 0-100. Below `LOW_CONFIDENCE_THRESHOLD` the UI must ask the user to confirm manually. */
  confidence: number;
  severity: DefectSeverity;
  /** Where in the unit — e.g. "المطبخ — أسفل حوض الغسيل". */
  location: string;
  /** Why the model believes this happened. */
  probableCause: string;
  /** Normalised 0-1 box over the source image, for the result card's overlay. */
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  /** Short recommended next actions, rendered as a list. */
  recommendedActions: string[];
}

/**
 * Under this, the UI stops presenting the result as fact and routes the user
 * into manual classification instead (the "AI fails" fallback the product
 * brief calls for). Kept here so the threshold is a contract term, not a
 * magic number buried in a component.
 */
export const LOW_CONFIDENCE_THRESHOLD = 62;

export interface AnalyzeDefectInput {
  /** The uploaded photo(s). Real client will multipart these. */
  images: File[];
  /** Optional free-text hint the resident typed. */
  note?: string;
  /** Unit context the backend will eventually resolve server-side from the session. */
  unitId?: string;
}

/* --------------------------------------------------------------- warranty */

export interface WarrantyOpinion extends AiEnvelope {
  covered: boolean;
  /** The plain-Arabic "why", rendered verbatim to the resident. */
  rationale: string;
  coverageType: string;
  coveragePeriod: string;
  /** Bullet caveats — e.g. what would void the coverage. */
  caveats: string[];
}

export interface WarrantyOpinionInput {
  category: DefectCategory | string;
  severity?: DefectSeverity | string;
  /** Whether the unit's warranty window is still open, resolved by the caller. */
  withinWarrantyWindow?: boolean;
}

/* ----------------------------------------------------------- repair check */

export interface RepairComparison extends AiEnvelope {
  /** 0-100 how complete the repair looks. */
  completionPercent: number;
  quality: "ممتازة" | "جيدة" | "مقبولة" | "غير مقبولة";
  /** Empty array means the model found nothing outstanding. */
  remainingIssues: string[];
  verdict: string;
}

export interface RepairComparisonInput {
  beforeImages: string[];
  afterImages: string[];
  category?: DefectCategory | string;
}

/* ---------------------------------------------------------------- advisor */

export interface AdvisorMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AdvisorReply extends AiEnvelope {
  text: string;
  /** Follow-up chips the UI offers after the answer. */
  suggestions: string[];
  /** Project ids the answer refers to, so the UI can surface those cards inline. */
  citedProjectIds: number[];
}

export interface AdvisorReplyInput {
  question: string;
  history: AdvisorMessage[];
  /** Whatever the screen knows about the user, passed straight through. */
  context?: Record<string, unknown>;
}

/* -------------------------------------------------------------- the shape */

/**
 * Implemented today by `mock.ts`; tomorrow by an HTTP client with the same
 * signatures. `client.ts` picks which one — components only ever import
 * from there.
 */
export interface SaknAi {
  analyzeDefect(input: AnalyzeDefectInput): Promise<DefectAnalysis>;
  warrantyOpinion(input: WarrantyOpinionInput): Promise<WarrantyOpinion>;
  compareRepair(input: RepairComparisonInput): Promise<RepairComparison>;
  advisorReply(input: AdvisorReplyInput): Promise<AdvisorReply>;
}
