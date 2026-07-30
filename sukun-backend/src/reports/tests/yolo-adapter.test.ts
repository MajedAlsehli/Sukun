import { env } from '../../config/env';
import {
  YoloObjectDetectionProvider,
  decodeImageDataUri,
  validateYoloResponse,
} from '../providers/object-detection.provider';

// ---------------------------------------------------------------------------
// Task 10 closeout — the YOLO adapter against the REAL Sakn Defect Segmentation
// API contract.
//
// The fixture below is a verbatim response from the deployed service, captured
// by sending a real image to POST /v1/predict. Everything here is deterministic:
// `fetch` is mocked, so no test depends on the service being awake.
// ---------------------------------------------------------------------------

/** Verbatim from the deployed service (polygon truncated - the adapter drops it). */
const REAL_RESPONSE = {
  success: true,
  image_width: 256,
  image_height: 256,
  inference_ms: 15888.694988563657,
  detections: [
    {
      class_id: 0,
      class_name: 'wall_crack',
      confidence: 0.7405600547790527,
      box_xyxy: [107.69247436523438, 4.1137847900390625, 133.3052978515625, 243.9378204345703],
      polygon: [[120.0, 4.0], [121.0, 4.0], [122.0, 5.0]],
    },
  ],
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG_DATA_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('decodeImageDataUri — server-side decode of an authorized data URI', () => {
  it('decodes a well-formed image data URI to real bytes', () => {
    const out = decodeImageDataUri(PNG_DATA_URI);
    expect(out?.mimeType).toBe('image/png');
    expect(out?.buffer.equals(PNG_BYTES)).toBe(true);
  });

  it('accepts each forwardable image type', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(decodeImageDataUri(`data:${mime};base64,${PNG_BYTES.toString('base64')}`)?.mimeType).toBe(mime);
    }
  });

  it.each([
    ['a non-image MIME type', 'data:application/pdf;base64,QQ=='],
    ['an svg (scriptable)', 'data:image/svg+xml;base64,QQ=='],
    ['a remote URL rather than inline bytes', 'https://example.com/a.png'],
    ['a non-base64 data URI', 'data:image/png,notbase64'],
    ['an empty payload', 'data:image/png;base64,'],
    ['a non-string', 12345],
    ['undefined', undefined],
  ])('refuses %s', (_label, input) => {
    expect(decodeImageDataUri(input as unknown)).toBeNull();
  });

  it('never fetches anything - it only decodes inline bytes', () => {
    const spy = jest.spyOn(globalThis, 'fetch');
    decodeImageDataUri('https://evil.example/steal.png');
    decodeImageDataUri(PNG_DATA_URI);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('validateYoloResponse — the real service schema', () => {
  it('maps a REAL response into the canonical detection shape', () => {
    expect(validateYoloResponse(REAL_RESPONSE)).toEqual([
      {
        label: 'wall_crack',
        // 0.7406 fraction -> 74 on Sakn's canonical 0-100 scale (AI-011).
        confidence: 74,
        // [x1,y1,x2,y2] -> [x, y, width, height].
        bbox: [
          107.69247436523438,
          4.1137847900390625,
          133.3052978515625 - 107.69247436523438,
          243.9378204345703 - 4.1137847900390625,
        ],
      },
    ]);
  });

  it('converts the 0..1 confidence fraction rather than passing it through', () => {
    // This is the bug the previous adapter would have shipped: 0.74 fed
    // straight into clampConfidence rounds to 1, i.e. 74% -> 1%.
    const [d] = validateYoloResponse({
      success: true,
      detections: [{ class_name: 'dampness', confidence: 0.9, box_xyxy: [0, 0, 10, 10] }],
    });
    expect(d.confidence).toBe(90);
    expect(d.confidence).not.toBe(1);
  });

  it('converts box_xyxy corners into x/y/width/height rather than passing them through', () => {
    const [d] = validateYoloResponse({
      success: true,
      detections: [{ class_name: 'water_leak', confidence: 0.5, box_xyxy: [10, 20, 60, 80] }],
    });
    expect(d.bbox).toEqual([10, 20, 50, 60]);
  });

  it('normalises reversed corners instead of emitting a negative width', () => {
    const [d] = validateYoloResponse({
      success: true,
      detections: [{ class_name: 'paint_damage', confidence: 0.5, box_xyxy: [60, 80, 10, 20] }],
    });
    expect(d.bbox).toEqual([10, 20, 50, 60]);
  });

  it('drops the segmentation polygon - the canonical shape carries no geometry', () => {
    const [d] = validateYoloResponse(REAL_RESPONSE);
    expect(d).not.toHaveProperty('polygon');
    expect(Object.keys(d).sort()).toEqual(['bbox', 'confidence', 'label']);
  });

  it('honours the four real model classes as labels', () => {
    const classes = ['wall_crack', 'dampness', 'water_leak', 'paint_damage'];
    const out = validateYoloResponse({
      success: true,
      detections: classes.map((c) => ({ class_name: c, confidence: 0.5, box_xyxy: [0, 0, 1, 1] })),
    });
    expect(out.map((d) => d.label)).toEqual(classes);
  });

  it('returns nothing when the service reports its own failure in-band', () => {
    expect(validateYoloResponse({ success: false, detections: [{ class_name: 'x', confidence: 0.9 }] })).toEqual([]);
  });

  it.each([
    ['a confidence above 1 (not a fraction)', { class_name: 'x', confidence: 74, box_xyxy: [0, 0, 1, 1] }],
    ['a negative confidence', { class_name: 'x', confidence: -0.2, box_xyxy: [0, 0, 1, 1] }],
    ['a non-numeric confidence', { class_name: 'x', confidence: 'high', box_xyxy: [0, 0, 1, 1] }],
    ['a missing class_name', { confidence: 0.9, box_xyxy: [0, 0, 1, 1] }],
    ['an empty class_name', { class_name: '   ', confidence: 0.9 }],
    ['a non-object item', 'not-an-object'],
  ])('drops %s rather than guessing', (_label, item) => {
    expect(validateYoloResponse({ success: true, detections: [item] })).toEqual([]);
  });

  it('keeps a detection whose bbox is unusable, but without a bbox', () => {
    const out = validateYoloResponse({
      success: true,
      detections: [
        { class_name: 'dampness', confidence: 0.6, box_xyxy: [0, 0, 0, 0] },
        { class_name: 'wall_crack', confidence: 0.6, box_xyxy: 'nope' },
      ],
    });
    expect(out).toEqual([
      { label: 'dampness', confidence: 60 },
      { label: 'wall_crack', confidence: 60 },
    ]);
  });

  it.each([
    ['a null body', null],
    ['a string body', 'boom'],
    ['an HTML error page parsed as text', { notJson: true }],
    ['a body with no detections array', { success: true }],
    ['detections that are not an array', { success: true, detections: 'many' }],
  ])('returns [] for %s rather than throwing', (_label, body) => {
    expect(validateYoloResponse(body)).toEqual([]);
  });

  it('caps a flood of detections', () => {
    const many = Array.from({ length: 500 }, () => ({
      class_name: 'wall_crack',
      confidence: 0.5,
      box_xyxy: [0, 0, 1, 1],
    }));
    expect(validateYoloResponse({ success: true, detections: many }).length).toBeLessThanOrEqual(50);
  });
});

describe('YoloObjectDetectionProvider.detect — transport', () => {
  const provider = new YoloObjectDetectionProvider();
  const originalUrl = env.ai.yoloInferenceUrl;
  const originalKey = env.ai.yoloApiKey;
  const originalConf = env.ai.yoloConfidence;
  const originalIou = env.ai.yoloIou;

  afterEach(() => {
    env.ai.yoloInferenceUrl = originalUrl;
    env.ai.yoloApiKey = originalKey;
    env.ai.yoloConfidence = originalConf;
    env.ai.yoloIou = originalIou;
    jest.restoreAllMocks();
  });

  function configure() {
    env.ai.yoloInferenceUrl = 'https://sakn-ai-model.onrender.com/v1/predict';
    env.ai.yoloApiKey = '';
    env.ai.yoloConfidence = null;
    env.ai.yoloIou = null;
  }

  it('returns null when unconfigured, without calling anything', async () => {
    env.ai.yoloInferenceUrl = '';
    const spy = jest.spyOn(globalThis, 'fetch');
    expect(await provider.detect([{ dataUri: PNG_DATA_URI }])).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends multipart/form-data with the field name "file" - never JSON', async () => {
    configure();
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(REAL_RESPONSE));

    await provider.detect([{ dataUri: PNG_DATA_URI }]);

    const [, init] = spy.mock.calls[0];
    const body = (init as RequestInit).body;
    expect(body).toBeInstanceOf(FormData);

    const form = body as FormData;
    const file = form.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('upload.png');
    expect(await (file as Blob).arrayBuffer()).toEqual(
      PNG_BYTES.buffer.slice(PNG_BYTES.byteOffset, PNG_BYTES.byteOffset + PNG_BYTES.byteLength),
    );

    // The old adapter sent {"images":[dataUri]} as JSON. It must not any more.
    expect(typeof body).not.toBe('string');
    const headers = ((init as RequestInit).headers ?? {}) as Record<string, string>;
    // fetch must set Content-Type itself so the multipart boundary matches.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  it('maps a real response end-to-end into the canonical output', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(REAL_RESPONSE));

    const out = await provider.detect([{ dataUri: PNG_DATA_URI }]);

    expect(out?.detections).toHaveLength(1);
    expect(out?.detections[0].label).toBe('wall_crack');
    expect(out?.detections[0].confidence).toBe(74);
    // The service returns no version on /v1/predict, so nothing is invented.
    expect(out?.modelVersion).toBe('unknown');
  });

  it('sends confidence/iou only when configured, and never out of range', async () => {
    configure();
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(REAL_RESPONSE));

    await provider.detect([{ dataUri: PNG_DATA_URI }]);
    expect(String(spy.mock.calls[0][0])).not.toContain('confidence=');

    spy.mockClear();
    env.ai.yoloConfidence = 0.25;
    env.ai.yoloIou = 0.5;
    await provider.detect([{ dataUri: PNG_DATA_URI }]);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('confidence=0.25');
    expect(url).toContain('iou=0.5');
  });

  /**
   * Task 3 (Step 8): lowered from 60s to 25s. A detector timeout at or above
   * the platform's function budget (`vercel.json#maxDuration`, now 60s) can
   * never fire — the function is killed first and Vercel answers with an HTML
   * error page carrying no CORS headers, so a browser reports a CORS failure
   * for what is really a timeout. Detection (25s) plus analysis (20s) now fits
   * inside the budget with room for this API's own JSON error response.
   *
   * The assertion is kept and RETARGETED rather than deleted: the point of the
   * test is that a bounded per-request timeout is always applied.
   */
  it('applies a per-request timeout that fits inside the platform function budget', async () => {
    configure();
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(REAL_RESPONSE));

    await provider.detect([{ dataUri: PNG_DATA_URI }]);
    expect(timeoutSpy).toHaveBeenCalledWith(25_000);
    const [[applied]] = timeoutSpy.mock.calls;
    // The invariant that actually matters, independent of the exact figure.
    expect(applied).toBeLessThan(60_000);
  });

  it('falls back honestly to null on a non-OK response', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));
    expect(await provider.detect([{ dataUri: PNG_DATA_URI }])).toBeNull();
  });

  // The deployed service genuinely does this on a platform 502.
  it('survives an HTML error page instead of JSON', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html><title>502</title></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    expect(await provider.detect([{ dataUri: PNG_DATA_URI }])).toBeNull();
  });

  it('falls back honestly to null when the request throws (timeout, DNS, reset)', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('The operation was aborted'));
    expect(await provider.detect([{ dataUri: PNG_DATA_URI }])).toBeNull();
  });

  it('sends one request per image and merges the detections', async () => {
    configure();
    // `mockImplementation`, not `mockResolvedValue`: a Response body is
    // single-use, so a shared instance would fail the second read - an artefact
    // of the mock, not of the adapter. Real fetch returns a fresh Response.
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(REAL_RESPONSE));

    const out = await provider.detect([{ dataUri: PNG_DATA_URI }, { dataUri: PNG_DATA_URI }]);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(out?.detections).toHaveLength(2);
  });

  it('skips an undecodable image without failing the whole sweep', async () => {
    configure();
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(REAL_RESPONSE));

    const out = await provider.detect([{ dataUri: 'not-a-data-uri' }, { dataUri: PNG_DATA_URI }]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(out?.detections).toHaveLength(1);
  });

  it('returns null - "cannot detect" - when every request failed, not an empty result', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    // "detected nothing" and "could not detect" are materially different claims.
    expect(await provider.detect([{ dataUri: PNG_DATA_URI }])).toBeNull();
  });

  it('returns an empty detection list - not null - when the service genuinely found nothing', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, image_width: 64, image_height: 64, detections: [] }),
    );
    const out = await provider.detect([{ dataUri: PNG_DATA_URI }]);
    expect(out).toEqual({ detections: [], modelVersion: 'unknown' });
  });
});

describe('YOLO adapter — homeowner images never reach the logs', () => {
  const provider = new YoloObjectDetectionProvider();
  const originalUrl = env.ai.yoloInferenceUrl;

  afterEach(() => {
    env.ai.yoloInferenceUrl = originalUrl;
    jest.restoreAllMocks();
  });

  it('logs no image bytes, data URI or base64 payload on success or on failure', async () => {
    env.ai.yoloInferenceUrl = 'https://sakn-ai-model.onrender.com/v1/predict';
    const base64 = PNG_BYTES.toString('base64');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = require('../../shared/logger').logger as Record<string, jest.Mock>;
    const captured: string[] = [];
    for (const level of ['info', 'warn', 'error', 'debug']) {
      jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        captured.push(JSON.stringify(args));
        return undefined as never;
      });
    }

    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(REAL_RESPONSE));
    await provider.detect([{ dataUri: PNG_DATA_URI }, { dataUri: 'not-a-data-uri' }]);

    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    await provider.detect([{ dataUri: PNG_DATA_URI }]);

    const all = captured.join('\n');
    expect(all).not.toContain(base64);
    expect(all).not.toContain('data:image');
    expect(all).not.toContain('not-a-data-uri');
    // It should still say something useful.
    expect(captured.length).toBeGreaterThan(0);
  });
});
