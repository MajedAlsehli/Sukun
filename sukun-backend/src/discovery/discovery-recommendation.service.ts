import { chatJson } from '../ai/openai.client';
import { AIUnavailableError } from '../ai/ai-gateway.types';
import { logger } from '../shared/logger';
import { DiscoveryProjectEntity } from './discovery.mapper';

// Task 6 (decisions.md G13): a synchronous, on-demand, request/response call
// - deliberately not the fire-and-forget layered pipeline in ai-gateway.service.ts
// (that shape is for background jobs with a 5-attempt retry loop; a user is
// waiting on this one). No retry: one slow/failed attempt just returns the
// honest unavailable state.
const TIMEOUT_MS = 8_000;
const MAX_CANDIDATES = 30;
const MAX_RECOMMENDATIONS = 5;

export type RecommendationReason = 'AI_SERVICE_UNAVAILABLE' | 'NO_DISCOVERABLE_PROJECTS';

export interface RecommendationResult {
  available: boolean;
  reason?: RecommendationReason;
  items: { projectId: string; reason: string }[];
}

interface RawRecommendation {
  recommendations?: { projectId?: unknown; reason?: unknown }[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Recommendation request timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function serializeCandidate(project: DiscoveryProjectEntity) {
  const units = project.buildings.flatMap((b) => b.units);
  const prices = units.map((u) => u.price).filter((p): p is number => p != null);
  return {
    projectId: project.id,
    name: project.name,
    city: project.city,
    district: project.district,
    readiness: project.readiness,
    amenities: project.amenities,
    priceFrom: prices.length ? Math.min(...prices) : null,
    priceTo: prices.length ? Math.max(...prices) : null,
    unitTypes: Array.from(new Set(units.map((u) => u.type))),
  };
}

const SYSTEM_PROMPT = `أنت مساعد يقترح مشاريع سكنية حقيقية لمستخدم يبحث عن منزل في السعودية.
سيتم تزويدك بقائمة مشاريع حقيقية فقط (projectId حقيقي لكل مشروع) - لا تخترع مشروعًا أو معرّفًا غير موجود في القائمة أبدًا.
اختر حتى 5 مشاريع من القائمة المعطاة فقط، ورتّبها من الأنسب، مع سبب قصير بالعربية لكل اختيار يعتمد فقط على الحقول المعطاة (المدينة، نطاق السعر، حالة الجاهزية، المرافق) - لا تخترع حقائق غير موجودة في البيانات المعطاة.
أعد النتيجة بصيغة JSON فقط بالشكل التالي: {"recommendations": [{"projectId": "...", "reason": "..."}]}`;

export const discoveryRecommendationService = {
  async getRecommendations(candidates: DiscoveryProjectEntity[]): Promise<RecommendationResult> {
    if (candidates.length === 0) {
      return { available: false, reason: 'NO_DISCOVERABLE_PROJECTS', items: [] };
    }

    const pool = candidates.slice(0, MAX_CANDIDATES);
    const validIds = new Set(pool.map((p) => p.id));
    const userPrompt = JSON.stringify({ projects: pool.map(serializeCandidate) });

    try {
      const raw = await withTimeout(chatJson<RawRecommendation>(SYSTEM_PROMPT, userPrompt), TIMEOUT_MS);

      const items = (raw.recommendations ?? [])
        .filter(
          (r): r is { projectId: string; reason: string } =>
            typeof r.projectId === 'string' &&
            validIds.has(r.projectId) &&
            typeof r.reason === 'string' &&
            r.reason.trim().length > 0,
        )
        .slice(0, MAX_RECOMMENDATIONS);

      return { available: true, items };
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        return { available: false, reason: 'AI_SERVICE_UNAVAILABLE', items: [] };
      }
      logger.warn('Discovery recommendation request failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { available: false, reason: 'AI_SERVICE_UNAVAILABLE', items: [] };
    }
  },
};
