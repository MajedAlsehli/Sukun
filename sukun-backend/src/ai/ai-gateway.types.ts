export interface DetectionItem {
  label: string;
  confidence: number; // 0-100
  bbox?: [number, number, number, number];
}

export interface DetectionResult {
  detections: DetectionItem[];
  modelVersion: string;
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ClassificationResult {
  defectType: string;
  priority: Priority;
  confidence: number; // 0-100
}

export interface RepairSuggestionResult {
  description: string;
  suggestedRepair: string;
  confidence: number; // 0-100, final QA-reviewed confidence
}

// AI-011: confidence must be 0-100. Nothing upstream enforces this - it's an
// LLM JSON response parsed with a plain JSON.parse/type-cast (openai.client.ts),
// so an out-of-range, non-numeric, or missing value would otherwise flow
// straight into AIResult.confidence (Int, no DB check constraint either).
export function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// Thrown when a layer can't run at all (no API key / no service configured) -
// as opposed to a transient failure, which is retried. Distinguishing the two
// matters: retrying a permanently-unconfigured service just wastes 5 attempts
// for nothing (INS-033..035).
export class AIUnavailableError extends Error {}
