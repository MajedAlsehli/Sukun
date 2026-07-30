import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { DetectionResult } from '../ai-gateway.types';

// Layer 1 - the user's own trained detection model (wall crack, paint damage,
// etc.), served as its own microservice (YOLO is Python; this backend is
// Node/TS). Not trained/deployed yet at the time of writing - returns null
// (not an error) when unconfigured, which the orchestrator treats as "cannot
// detect" per INS-025, routing straight to manual review rather than
// retrying a service that was never going to answer.
export async function runDetectionLayer(imageUrls: string[]): Promise<DetectionResult | null> {
  if (!env.ai.yoloServiceUrl) {
    logger.info('Detection layer skipped: YOLO_DETECTION_SERVICE_URL not configured');
    return null;
  }

  const response = await fetch(env.ai.yoloServiceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrls }),
    signal: AbortSignal.timeout(60_000), // INS-032: AI processing timeout = 60s
  });

  if (!response.ok) {
    throw new Error(`Detection service responded with ${response.status}`);
  }

  return (await response.json()) as DetectionResult;
}
