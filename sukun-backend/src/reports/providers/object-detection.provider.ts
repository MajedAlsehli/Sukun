import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { clampConfidence } from '../../ai/ai-gateway.types';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I7) / Task 10 closeout: the YOLO
// boundary, now wired to a REAL custom-trained defect model.
//
//   * The service is the Sakn Defect Segmentation API. Its `/health` reports a
//     four-class model - `wall_crack`, `dampness`, `water_leak`,
//     `paint_damage` - so this is genuinely a building-defect detector, not the
//     stock COCO weights I7 refused to accept. That caveat is resolved; the
//     rest of I7 stands.
//   * Detections remain ADVISORY. They are passed to the analysis provider as
//     context and are never turned into a category, a priority, or a warranty
//     verdict on their own.
//   * The model stays OUT of the Vercel function process: this is an HTTP
//     client against a separately deployed service with a hard timeout.
//   * Unset `YOLO_INFERENCE_URL` means `isConfigured()` is false,
//     `GET /api/reports/providers` reports the detector unavailable, and the
//     canonical flow runs on OpenAI analysis alone.
//   * Provider keys never leave the server, and no homeowner image - not the
//     data URI, not the bytes, not a client filename - is ever logged. Only
//     counts, statuses and durations are.
//
// THE REAL CONTRACT, verified against the deployed service rather than assumed:
//
//   POST /v1/predict?confidence=<0.01..1>&iou=<0.01..0.99>
//   Content-Type: multipart/form-data, single required field `file`
//   -> 200 {
//        "success": true,
//        "image_width": 256, "image_height": 256, "inference_ms": 15888.7,
//        "detections": [{
//          "class_id": 0,
//          "class_name": "wall_crack",
//          "confidence": 0.7405,              // FRACTION, 0..1
//          "box_xyxy": [x1, y1, x2, y2],      // CORNERS, not x/y/w/h
//          "polygon": [[x, y], ...]           // segmentation mask
//        }]
//      }
//
// Two conversions are therefore mandatory, and getting either wrong is silent:
//
//   1. CONFIDENCE. Sakn's canonical scale is a 0-100 integer (AI-011); the
//      service emits a 0..1 fraction. Passing 0.74 straight into
//      `clampConfidence` rounds it to 1, i.e. a 74%-confident crack would be
//      reported as 1% confident.
//   2. BBOX. Sakn's canonical `bbox` is [x, y, width, height]; the service
//      emits [x1, y1, x2, y2]. Passing it through unchanged puts the box in
//      roughly the right place with wildly wrong dimensions.
//
// `polygon` is deliberately DROPPED: the canonical detection shape carries no
// segmentation geometry, and inventing a field for it here would put data in
// the DTO that nothing downstream understands.
// ---------------------------------------------------------------------------

/** Per-request ceiling. One real inference measured ~15 s on the deployed service. */
/**
 * Task 3 (Step 8) — lowered from 60s.
 *
 * The platform function budget is 60s (`vercel.json#maxDuration`). A detector
 * timeout EQUAL to the budget cannot fire: the platform kills the function
 * first and answers with an HTML error page that carries no CORS headers, so a
 * browser reports a CORS failure for what is really a timeout — measured in
 * Task 2 on a Render cold start.
 *
 * The chain must fit with room to spare for the analysis call after it AND for
 * this API's own JSON error envelope to be written. 25s + 20s = 45s, leaving
 * ~15s of headroom inside the 60s budget.
 */
const DETECTION_TIMEOUT_MS = 25_000;
/**
 * Whole-call ceiling across all images. The provider is handed every staged
 * photo, the service takes one file per request, and the analysis step must not
 * stall a homeowner's report behind an unbounded queue of inferences - so
 * images are sent one at a time and the sweep stops when the budget is spent,
 * returning whatever was detected so far.
 */
const DETECTION_TOTAL_BUDGET_MS = 60_000;
const MAX_DETECTIONS = 50;
/** MIME types this adapter will decode and forward. Anything else is skipped. */
const FORWARDABLE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ReportDetection {
  label: string;
  confidence: number;
  /** [x, y, width, height] - only present when the service returned four finite numbers. */
  bbox?: [number, number, number, number];
}

export interface ReportDetectionOutput {
  detections: ReportDetection[];
  modelVersion: string;
}

export interface ObjectDetectionProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns null when the provider is not configured - "cannot detect", not an error. */
  detect(images: { dataUri: string }[]): Promise<ReportDetectionOutput | null>;
}

/**
 * Validates one raw detection payload. Anything malformed is DROPPED rather
 * than trusted or thrown on: a bad detector response must never block an
 * otherwise-valid homeowner report. Exported for direct testing.
 */
export function validateDetections(raw: unknown): ReportDetection[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { detections?: unknown }).detections;
  if (!Array.isArray(list)) return [];

  const out: ReportDetection[] = [];
  for (const item of list.slice(0, MAX_DETECTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { label?: unknown; confidence?: unknown; bbox?: unknown };

    const label = typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 120) : '';
    if (!label) continue;

    const confidence = clampConfidence(candidate.confidence);

    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(candidate.bbox) && candidate.bbox.length === 4) {
      const nums = candidate.bbox.map((n) => (typeof n === 'number' ? n : Number(n)));
      if (nums.every((n) => Number.isFinite(n))) {
        bbox = [nums[0], nums[1], nums[2], nums[3]];
      }
    }

    out.push(bbox ? { label, confidence, bbox } : { label, confidence });
  }
  return out;
}

/**
 * Decodes an authorized data URI into raw bytes, server-side.
 *
 * The provider is only ever handed URIs the report service already produced
 * from objects the caller was authorized to read - this function does not
 * fetch anything, does not follow a URL, and rejects anything that is not an
 * inline base64 image of a forwardable type. Returns null rather than throwing:
 * one unusable photo must not fail the whole detection sweep.
 *
 * Exported for direct testing.
 */
export function decodeImageDataUri(dataUri: unknown): { buffer: Buffer; mimeType: string } | null {
  if (typeof dataUri !== 'string') return null;

  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUri.trim());
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!FORWARDABLE_MIME.has(mimeType)) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;

  return { buffer, mimeType };
}

/**
 * Validates ONE response from the real Sakn Defect Segmentation API and maps it
 * into Sakn's canonical detection shape.
 *
 * Every field is checked rather than trusted, and anything malformed is DROPPED
 * rather than thrown on: a bad detector response must never block an otherwise
 * valid homeowner report. Exported for direct testing.
 */
export function validateYoloResponse(raw: unknown): ReportDetection[] {
  if (!raw || typeof raw !== 'object') return [];

  const body = raw as { success?: unknown; detections?: unknown };
  // The service reports its own failures in-band with `success: false`.
  if (body.success === false) return [];
  if (!Array.isArray(body.detections)) return [];

  const out: ReportDetection[] = [];
  for (const item of body.detections.slice(0, MAX_DETECTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const d = item as { class_name?: unknown; confidence?: unknown; box_xyxy?: unknown };

    const label = typeof d.class_name === 'string' ? d.class_name.trim().slice(0, 120) : '';
    if (!label) continue;

    // 0..1 fraction -> Sakn's canonical 0-100 integer (AI-011). A value outside
    // that range is not a fraction and is not guessed at - the detection is
    // dropped rather than scaled into something plausible-looking.
    const fraction = typeof d.confidence === 'number' ? d.confidence : Number(d.confidence);
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;
    const confidence = clampConfidence(fraction * 100);

    // [x1, y1, x2, y2] -> [x, y, width, height].
    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(d.box_xyxy) && d.box_xyxy.length === 4) {
      const n = d.box_xyxy.map((v) => (typeof v === 'number' ? v : Number(v)));
      if (n.every((v) => Number.isFinite(v))) {
        const [x1, y1, x2, y2] = n;
        // Corners can arrive in either order; normalise rather than emit a
        // negative width.
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        if (width > 0 && height > 0) bbox = [x, y, width, height];
      }
    }

    out.push(bbox ? { label, confidence, bbox } : { label, confidence });
  }
  return out;
}

export class YoloObjectDetectionProvider implements ObjectDetectionProvider {
  readonly name = 'yolov11';

  isConfigured(): boolean {
    return !!env.ai.yoloInferenceUrl;
  }

  async detect(images: { dataUri: string }[]): Promise<ReportDetectionOutput | null> {
    if (!this.isConfigured()) {
      // Not an error - the documented, expected state in every environment
      // that has no trained model deployed yet.
      return null;
    }

    const deadline = Date.now() + DETECTION_TOTAL_BUDGET_MS;
    const detections: ReportDetection[] = [];
    let modelVersion: string | null = null;
    let succeeded = 0;
    let skipped = 0;

    for (const image of images) {
      if (Date.now() >= deadline) break;
      if (detections.length >= MAX_DETECTIONS) break;

      const decoded = decodeImageDataUri(image?.dataUri);
      if (!decoded) {
        // Never log the URI itself - only that one was unusable.
        skipped += 1;
        continue;
      }

      const result = await this.predictOne(decoded);
      if (!result) continue;

      succeeded += 1;
      modelVersion = modelVersion ?? result.modelVersion;
      for (const d of result.detections) {
        if (detections.length >= MAX_DETECTIONS) break;
        detections.push(d);
      }
    }

    if (skipped > 0) {
      logger.warn('Object detection skipped unusable image input', { skipped, total: images.length });
    }

    // Every request failed: report "cannot detect" rather than "detected
    // nothing", which is a materially different claim.
    if (succeeded === 0) return null;

    return { detections, modelVersion: modelVersion ?? 'unknown' };
  }

  /**
   * One image, one multipart request. Returns null on any failure - the caller
   * decides what an all-null sweep means.
   */
  private async predictOne(
    decoded: { buffer: Buffer; mimeType: string },
  ): Promise<ReportDetectionOutput | null> {
    const url = new URL(env.ai.yoloInferenceUrl);
    // Optional tuning, only when explicitly configured and only inside the
    // ranges the service's own OpenAPI declares. Out-of-range values are
    // ignored rather than sent: the deployed service 502s on some of them.
    if (env.ai.yoloConfidence !== null) url.searchParams.set('confidence', String(env.ai.yoloConfidence));
    if (env.ai.yoloIou !== null) url.searchParams.set('iou', String(env.ai.yoloIou));

    const form = new FormData();
    // Field name is `file`, per the service contract. The filename is
    // SERVER-GENERATED: a client-supplied name would be untrusted input on a
    // multipart boundary and could carry personal data into another system.
    form.append(
      'file',
      new Blob([new Uint8Array(decoded.buffer)], { type: decoded.mimeType }),
      `upload.${EXTENSION_BY_MIME[decoded.mimeType] ?? 'bin'}`,
    );

    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        // No Content-Type header: fetch must set it itself so the multipart
        // boundary matches the body. Setting it by hand breaks the upload.
        headers: {
          ...(env.ai.yoloApiKey ? { Authorization: `Bearer ${env.ai.yoloApiKey}` } : {}),
        },
        body: form,
        signal: AbortSignal.timeout(DETECTION_TIMEOUT_MS),
      });

      if (!res.ok) {
        logger.warn('Object detection service returned a non-OK response', {
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
        return null;
      }

      // The deployed service returns an HTML error page on a platform 502, so
      // `res.json()` is not safe to call blind.
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        logger.warn('Object detection service returned a non-JSON body', {
          status: res.status,
          contentType: res.headers.get('content-type'),
          durationMs: Date.now() - startedAt,
        });
        return null;
      }

      const parsed = validateYoloResponse(body);
      const rawVersion = (body as { model_version?: unknown; modelVersion?: unknown } | null)?.model_version
        ?? (body as { modelVersion?: unknown } | null)?.modelVersion;

      logger.info('Object detection completed', {
        detections: parsed.length,
        durationMs: Date.now() - startedAt,
      });

      return {
        detections: parsed,
        // The service does not currently return a version on /v1/predict; its
        // /health does expose the model path. Nothing is invented here - an
        // absent version reads as 'unknown'.
        modelVersion: typeof rawVersion === 'string' ? rawVersion.slice(0, 120) : 'unknown',
      };
    } catch (err) {
      logger.warn('Object detection call failed - continuing without detections', {
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      });
      return null;
    }
  }
}

export const objectDetectionProvider: ObjectDetectionProvider = new YoloObjectDetectionProvider();
