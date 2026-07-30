import { z } from 'zod';
import { ReportCategory, ReportPriority } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { BusinessError } from '../../shared/errors';
import { clampConfidence } from '../../ai/ai-gateway.types';
import { visionChatJson, MODEL } from '../../ai/openai.client';
import { REPORT_CATEGORIES, REPORT_PRIORITIES } from '../report.types';
import { ReportDetection } from './object-detection.provider';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I6): the AI boundary for the canonical
// report domain.
//
// AI ADVISES; IT NEVER DECIDES. That is enforced structurally, not by
// convention: this file imports no repository, no Prisma client, and no
// service. A provider returns a plain value object and physically cannot
// mutate a report's status, warranty verdict, priority, or assignment.
//
// Everything the model returns is validated against the server's own enums
// before it is persisted, and the persisted analysis is what
// `POST /api/reports` consumes by id - the client never gets to author the
// classification (I6's "why the analysis is persisted server-side").
// ---------------------------------------------------------------------------

export const MAX_ANALYSIS_IMAGES = 10;
/**
 * Task 3 (Step 8) — lowered from 45s, for the same reason as the detector's.
 * Detection (25s) runs BEFORE this, so 25 + 20 = 45s worst case leaves ~15s
 * inside the 60s function budget for the controlled JSON error response.
 */
const ANALYSIS_TIMEOUT_MS = 20_000;
const MAX_PROBLEM_TEXT_CHARS = 400;
const MAX_EXPLANATION_CHARS = 600;

export interface ReportAnalysisInput {
  images: { dataUri: string }[];
  homeownerNote?: string | null;
  detections?: ReportDetection[];
}

export interface ReportAnalysisOutput {
  provider: string;
  model: string;
  category: ReportCategory;
  problemText: string;
  priority: ReportPriority;
  confidence: number;
  explanation: string;
}

export interface ReportAnalysisProvider {
  readonly name: string;
  isConfigured(): boolean;
  analyze(input: ReportAnalysisInput): Promise<ReportAnalysisOutput>;
}

/**
 * The raw model response is parsed leniently (strings, any casing) and then
 * normalized/validated by `normalizeAnalysis` - a Zod schema that rejected the
 * whole payload on a single unexpected string would make an otherwise-usable
 * classification unusable.
 */
const rawAnalysisSchema = z.object({
  category: z.unknown(),
  problemText: z.unknown(),
  priority: z.unknown(),
  confidence: z.unknown(),
  explanation: z.unknown(),
});

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validation + safe normalization of one raw model response
 * (decisions.md I6). Exported so tests can exercise every branch without an
 * OpenAI call.
 *
 * - `category`: must be one of the nine server enum members. Anything unknown
 *   normalizes to OTHER - the enum's own "unclassified" member, matching H8's
 *   `أخرى` tile. This is a real normalization, not a guess.
 * - `priority`: must be one of the three server enum members. An unknown or
 *   missing value is NOT normalized: there is no neutral priority that would
 *   not be an invention, so the whole analysis is rejected and the UI falls
 *   back to manual entry (which H8's own error screen already offers).
 * - `confidence`: clamped 0-100 via Task 008's existing `clampConfidence`.
 * - text fields: required non-empty, hard-truncated.
 */
export function normalizeAnalysis(raw: unknown, meta: { provider: string; model: string }): ReportAnalysisOutput {
  const parsed = rawAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BusinessError('The analysis service returned an unusable result', 'AI_ANALYSIS_INVALID');
  }

  const priorityRaw = coerceString(parsed.data.priority).toUpperCase();
  const priority = REPORT_PRIORITIES.find((p) => p === priorityRaw);
  if (!priority) {
    throw new BusinessError('The analysis service returned an unusable result', 'AI_ANALYSIS_INVALID');
  }

  const problemText = coerceString(parsed.data.problemText);
  if (!problemText) {
    throw new BusinessError('The analysis service returned an unusable result', 'AI_ANALYSIS_INVALID');
  }

  const categoryRaw = coerceString(parsed.data.category).toUpperCase();
  const category = REPORT_CATEGORIES.find((c) => c === categoryRaw) ?? ReportCategory.OTHER;

  const explanation = coerceString(parsed.data.explanation) || problemText;

  return {
    provider: meta.provider,
    model: meta.model,
    category,
    problemText: problemText.slice(0, MAX_PROBLEM_TEXT_CHARS),
    priority,
    confidence: clampConfidence(parsed.data.confidence),
    explanation: explanation.slice(0, MAX_EXPLANATION_CHARS),
  };
}

const SYSTEM_PROMPT = [
  'You analyze photographs of defects inside a newly handed-over residential unit in Saudi Arabia,',
  'on behalf of the homeowner filing a maintenance/warranty report.',
  'Respond with strict JSON only, with exactly these keys:',
  '{"category": string, "problemText": string, "priority": string, "confidence": number, "explanation": string}.',
  `"category" MUST be exactly one of: ${REPORT_CATEGORIES.join(', ')}.`,
  `"priority" MUST be exactly one of: ${REPORT_PRIORITIES.join(', ')}.`,
  '"confidence" is an integer from 0 to 100 expressing how sure you are of the category.',
  '"problemText" is one short Arabic sentence describing the defect you can actually see.',
  '"explanation" is one short Arabic sentence saying why you chose that category and priority.',
  'Never invent a defect you cannot see in the photographs. If the photographs are unclear,',
  'use category OTHER with a low confidence and say so in the explanation.',
].join(' ');

export class OpenAiReportAnalysisProvider implements ReportAnalysisProvider {
  readonly name = 'openai';

  isConfigured(): boolean {
    return !!env.ai.openAiApiKey;
  }

  async analyze(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
    if (!this.isConfigured()) {
      throw new BusinessError(
        'Automatic photo analysis is not available right now',
        'AI_ANALYSIS_UNAVAILABLE',
      );
    }

    const userPrompt = JSON.stringify({
      homeownerNote: input.homeownerNote?.trim() || null,
      // Only ever the validated detector output (labels + confidence), never a
      // raw third-party payload. Absent whenever YOLO is unconfigured (I7).
      detections:
        input.detections?.map((d) => ({ label: d.label, confidence: d.confidence })) ?? null,
      imageCount: input.images.length,
    });

    let raw: unknown;
    try {
      raw = await withTimeout(
        visionChatJson<unknown>(SYSTEM_PROMPT, userPrompt, input.images.slice(0, MAX_ANALYSIS_IMAGES)),
        ANALYSIS_TIMEOUT_MS,
      );
    } catch (err) {
      // Transport failure, timeout, non-JSON body, rate limit - all the same
      // honest outcome for the caller: unavailable. Never a fabricated result.
      logger.warn('Report analysis provider call failed', {
        provider: this.name,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new BusinessError(
        'Automatic photo analysis is not available right now',
        'AI_ANALYSIS_UNAVAILABLE',
      );
    }

    return normalizeAnalysis(raw, { provider: this.name, model: MODEL });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Report analysis timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const reportAnalysisProvider: ReportAnalysisProvider = new OpenAiReportAnalysisProvider();
