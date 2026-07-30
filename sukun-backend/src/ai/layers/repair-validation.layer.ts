import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { visionChatJson } from '../openai.client';

export interface RepairValidationResult {
  isResolved: boolean;
  confidence: number; // 0-100
  notes: string;
}

function toDataUri(storageKey: string, mimeType: string): string {
  const bytes = fs.readFileSync(path.join(env.storage.root, storageKey));
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

// REP-021: AI compares Before/After images. Reads local-disk bytes directly
// (see openai.client.ts#visionChatJson) since files aren't served on a
// publicly reachable URL in this MVP.
export async function runRepairValidationLayer(
  before: { storageKey: string; mimeType: string },
  after: { storageKey: string; mimeType: string },
  context: { defectType?: string; suggestedRepair?: string },
): Promise<RepairValidationResult> {
  const systemPrompt =
    'You compare Before/After photos of a residential repair. Respond with strict JSON: ' +
    '{"isResolved": boolean, "confidence": number (0-100), "notes": string}.';

  const textPrompt = JSON.stringify({
    defectType: context.defectType ?? null,
    suggestedRepair: context.suggestedRepair ?? null,
  });

  return visionChatJson<RepairValidationResult>(systemPrompt, textPrompt, [
    { dataUri: toDataUri(before.storageKey, before.mimeType) },
    { dataUri: toDataUri(after.storageKey, after.mimeType) },
  ]);
}
