import { chatJson, MODEL } from '../openai.client';
import { ClassificationResult, DetectionItem, RepairSuggestionResult } from '../ai-gateway.types';

// Layer 3 - general LLM. Produces the human-readable description, the
// suggested repair action, and a final reviewed confidence (a QA pass over
// Layers 1+2 combined) - this is what actually gets stored as the AI_Result
// (AI-004: confidence stored permanently).
export async function runRepairSuggestionLayer(
  classification: ClassificationResult,
  detections: DetectionItem[],
  context: { location: string; notes?: string },
): Promise<RepairSuggestionResult> {
  const systemPrompt =
    'You are a residential defect repair advisor reviewing an automated classification. ' +
    'Respond with strict JSON: {"description": string (human-readable defect description), ' +
    '"suggestedRepair": string (recommended repair action), "confidence": number (0-100, ' +
    'your own reviewed confidence in this analysis, not just a copy of the input)}.';

  const userPrompt = JSON.stringify({
    classification,
    detections: detections.map((d) => ({ label: d.label, confidence: d.confidence })),
    location: context.location,
    notes: context.notes ?? null,
  });

  return chatJson<RepairSuggestionResult>(systemPrompt, userPrompt);
}

export { MODEL as REPAIR_SUGGESTION_MODEL };
