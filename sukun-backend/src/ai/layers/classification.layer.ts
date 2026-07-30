import { chatJson, MODEL } from '../openai.client';
import { ClassificationResult, DetectionItem } from '../ai-gateway.types';

// Layer 2 - text classification. Takes Layer 1's raw detections (plus report
// context) and classifies them into the app's defect taxonomy: a defect type
// label and a priority (INS-011: Low/Medium/High/Critical).
export async function runClassificationLayer(
  detections: DetectionItem[],
  context: { location: string; notes?: string },
): Promise<ClassificationResult> {
  const systemPrompt =
    'You classify residential inspection defects. Given detected defect labels and ' +
    'context, respond with strict JSON: {"defectType": string, "priority": ' +
    '"LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "confidence": number (0-100)}.';

  const userPrompt = JSON.stringify({
    detections: detections.map((d) => ({ label: d.label, confidence: d.confidence })),
    location: context.location,
    notes: context.notes ?? null,
  });

  return chatJson<ClassificationResult>(systemPrompt, userPrompt);
}

export { MODEL as CLASSIFICATION_MODEL };
