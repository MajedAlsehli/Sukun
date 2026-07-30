import { PmCopilotReference, PmCopilotSnapshot } from './providers/pm-copilot.provider';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md J12): grounding and reference
// validation - the two halves of "the model may describe, it may not decide,
// and it may not name anything it was not shown".
//
// BEFORE the call: build a bounded snapshot from data the PM has ALREADY been
// authorized to see, stripped of anything sensitive.
// AFTER the call: validate every reference against the candidate id set built
// from that same snapshot, and drop anything that is not in it.
// ---------------------------------------------------------------------------

/** decisions.md J12 - hard size caps, so a large project cannot balloon a prompt. */
export const MAX_SNAPSHOT_REPORTS = 20;
export const MAX_SNAPSHOT_TECHNICIANS = 15;
export const MAX_SNAPSHOT_ALERTS = 10;
export const MAX_CHAT_MESSAGE_CHARS = 500;

/**
 * The id sets a model answer is allowed to cite. Built from the snapshot the
 * model was actually given, so a reference to anything else - hallucinated, or
 * belonging to another project or company - cannot survive validation.
 */
export interface CopilotCandidates {
  reportIds: Set<string>;
  technicianIds: Set<string>;
}

export function buildCandidates(snapshot: PmCopilotSnapshot): CopilotCandidates {
  return {
    reportIds: new Set([
      ...snapshot.reports.map((r) => r.id),
      ...snapshot.alerts.map((a) => a.reportId),
    ]),
    technicianIds: new Set(snapshot.technicians.map((t) => t.id)),
  };
}

export interface ValidatedReferences {
  references: Array<{ type: 'report' | 'technician'; id: string; navigation: 'REPORT_DETAIL' | 'TECHNICIAN_PROFILE' }>;
  /** Observable on purpose - tests assert on it, rather than a silent filter. */
  droppedReferenceCount: number;
}

/**
 * decisions.md J12. Drops:
 *   * ids the model invented outright;
 *   * ids belonging to another project or company (they are not in the
 *     snapshot, because the snapshot was built inside the PM's scope);
 *   * duplicates;
 *   * anything beyond the cap.
 *
 * This is the reason a successful prompt injection still cannot make the
 * assistant surface an entity the PM may not see: naming an id is not enough,
 * the id has to have been in the authorized snapshot already.
 */
export function validateReferences(
  raw: PmCopilotReference[],
  candidates: CopilotCandidates,
  max: number,
): ValidatedReferences {
  const seen = new Set<string>();
  const references: ValidatedReferences['references'] = [];
  let dropped = 0;

  for (const ref of raw) {
    const allowed =
      ref.type === 'report' ? candidates.reportIds.has(ref.id) : candidates.technicianIds.has(ref.id);
    if (!allowed) {
      dropped += 1;
      continue;
    }
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    if (references.length >= max) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    references.push({
      type: ref.type,
      id: ref.id,
      navigation: ref.type === 'report' ? 'REPORT_DETAIL' : 'TECHNICIAN_PROFILE',
    });
  }

  return { references, droppedReferenceCount: dropped };
}

/**
 * A UI-supplied context string can never broaden authorization: it is truncated
 * and passed as part of the question only. The snapshot - the ONLY thing that
 * decides what the model can see - is built server-side from the principal.
 */
export function sanitizeChatMessage(message: string, uiContext?: string | null): string {
  const base = message.trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
  const context = (uiContext ?? '').trim().slice(0, 200);
  return context ? `${base}\n\n[سياق الشاشة: ${context}]` : base;
}

export function hoursSince(from: Date, now: Date): number {
  return Math.max(0, Math.round(((now.getTime() - from.getTime()) / 3_600_000) * 10) / 10);
}
