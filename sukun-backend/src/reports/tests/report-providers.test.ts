import { ReportCategory, ReportPriority } from '@prisma/client';
import { env } from '../../config/env';
import {
  MAX_ANALYSIS_IMAGES,
  normalizeAnalysis,
  OpenAiReportAnalysisProvider,
  ReportAnalysisProvider,
} from '../providers/report-analysis.provider';
import {
  ObjectDetectionProvider,
  validateDetections,
  YoloObjectDetectionProvider,
} from '../providers/object-detection.provider';

const meta = { provider: 'test', model: 'test-model' };

function raw(overrides: Record<string, unknown> = {}) {
  return {
    category: 'PLUMBING',
    problemText: 'تسريب أسفل المغسلة',
    priority: 'HIGH',
    confidence: 88,
    explanation: 'يظهر أثر ماء واضح حول الوصلة',
    ...overrides,
  };
}

describe('normalizeAnalysis - structured model output validation (decisions.md I6)', () => {
  it('accepts a well-formed response and restricts it to server enums', () => {
    const result = normalizeAnalysis(raw(), meta);
    expect(result).toEqual({
      provider: 'test',
      model: 'test-model',
      category: ReportCategory.PLUMBING,
      problemText: 'تسريب أسفل المغسلة',
      priority: ReportPriority.HIGH,
      confidence: 88,
      explanation: 'يظهر أثر ماء واضح حول الوصلة',
    });
  });

  it('accepts lower/mixed-case enum values from the model', () => {
    const result = normalizeAnalysis(raw({ category: 'electrical', priority: 'medium' }), meta);
    expect(result.category).toBe(ReportCategory.ELECTRICAL);
    expect(result.priority).toBe(ReportPriority.MEDIUM);
  });

  it('normalizes an UNKNOWN category to OTHER - the enum\'s own unclassified member', () => {
    expect(normalizeAnalysis(raw({ category: 'HVAC' }), meta).category).toBe(ReportCategory.OTHER);
    expect(normalizeAnalysis(raw({ category: 'مياه' }), meta).category).toBe(ReportCategory.OTHER);
    expect(normalizeAnalysis(raw({ category: 42 }), meta).category).toBe(ReportCategory.OTHER);
    expect(normalizeAnalysis(raw({ category: null }), meta).category).toBe(ReportCategory.OTHER);
  });

  it('REJECTS an unknown or missing priority rather than inventing a neutral one', () => {
    for (const priority of ['URGENT', 'CRITICAL', '', null, undefined, 7]) {
      expect(() => normalizeAnalysis(raw({ priority }), meta)).toThrow(
        expect.objectContaining({ errorCode: 'AI_ANALYSIS_INVALID' }),
      );
    }
  });

  it('rejects a response with no usable problem text', () => {
    for (const problemText of ['', '   ', null, 12]) {
      expect(() => normalizeAnalysis(raw({ problemText }), meta)).toThrow(
        expect.objectContaining({ errorCode: 'AI_ANALYSIS_INVALID' }),
      );
    }
  });

  it('rejects a non-object payload outright', () => {
    for (const value of [null, 'a string', 42, []]) {
      expect(() => normalizeAnalysis(value, meta)).toThrow(
        expect.objectContaining({ errorCode: 'AI_ANALYSIS_INVALID' }),
      );
    }
  });

  it('clamps confidence into 0-100 (AI-011) instead of trusting the model', () => {
    expect(normalizeAnalysis(raw({ confidence: 250 }), meta).confidence).toBe(100);
    expect(normalizeAnalysis(raw({ confidence: -30 }), meta).confidence).toBe(0);
    expect(normalizeAnalysis(raw({ confidence: 'not a number' }), meta).confidence).toBe(0);
    expect(normalizeAnalysis(raw({ confidence: 61.6 }), meta).confidence).toBe(62);
  });

  it('hard-truncates long text so a runaway model cannot bloat a row', () => {
    const result = normalizeAnalysis(
      raw({ problemText: 'ت'.repeat(5000), explanation: 'ش'.repeat(5000) }),
      meta,
    );
    expect(result.problemText.length).toBe(400);
    expect(result.explanation.length).toBe(600);
  });

  it('falls back to the problem text when the model omits an explanation', () => {
    const result = normalizeAnalysis(raw({ explanation: '' }), meta);
    expect(result.explanation).toBe('تسريب أسفل المغسلة');
  });
});

describe('OpenAiReportAnalysisProvider availability (decisions.md I6)', () => {
  const originalKey = env.ai.openAiApiKey;
  afterEach(() => {
    env.ai.openAiApiKey = originalKey;
  });

  it('reports itself unconfigured when no API key is set', () => {
    env.ai.openAiApiKey = '';
    expect(new OpenAiReportAnalysisProvider().isConfigured()).toBe(false);
  });

  it('fails with an honest AI_ANALYSIS_UNAVAILABLE rather than a fabricated result', async () => {
    env.ai.openAiApiKey = '';
    await expect(
      new OpenAiReportAnalysisProvider().analyze({ images: [{ dataUri: 'data:image/png;base64,AA' }] }),
    ).rejects.toMatchObject({ errorCode: 'AI_ANALYSIS_UNAVAILABLE' });
  });

  it('caps how many images one analysis call may send', () => {
    expect(MAX_ANALYSIS_IMAGES).toBe(10);
  });

  it('satisfies the ReportAnalysisProvider port, so a future provider is a swap not a rewrite', () => {
    const provider: ReportAnalysisProvider = new OpenAiReportAnalysisProvider();
    expect(typeof provider.isConfigured).toBe('function');
    expect(typeof provider.analyze).toBe('function');
    expect(provider.name).toBe('openai');
  });
});

describe('YOLOv11 object-detection boundary (decisions.md I7)', () => {
  const originalUrl = env.ai.yoloInferenceUrl;
  afterEach(() => {
    env.ai.yoloInferenceUrl = originalUrl;
  });

  it('is UNCONFIGURED in this environment - nothing may claim YOLO is active', () => {
    expect(env.ai.yoloInferenceUrl).toBe('');
    expect(new YoloObjectDetectionProvider().isConfigured()).toBe(false);
  });

  it('returns null (cannot detect), not an error, when unconfigured', async () => {
    env.ai.yoloInferenceUrl = '';
    await expect(
      new YoloObjectDetectionProvider().detect([{ dataUri: 'data:image/png;base64,AA' }]),
    ).resolves.toBeNull();
  });

  it('is a separate env var from Task 008\'s inspection-side detection layer', () => {
    // Wiring one must never silently activate the other.
    expect(env.ai.yoloInferenceUrl).not.toBe(undefined);
    expect(env.ai.yoloServiceUrl).not.toBe(undefined);
  });

  it('satisfies the ObjectDetectionProvider port', () => {
    const provider: ObjectDetectionProvider = new YoloObjectDetectionProvider();
    expect(provider.name).toBe('yolov11');
    expect(typeof provider.detect).toBe('function');
  });

  describe('validateDetections', () => {
    it('accepts well-formed detections with a bbox', () => {
      expect(
        validateDetections({ detections: [{ label: 'crack', confidence: 91, bbox: [1, 2, 3, 4] }] }),
      ).toEqual([{ label: 'crack', confidence: 91, bbox: [1, 2, 3, 4] }]);
    });

    it('drops a detection with no usable label', () => {
      expect(validateDetections({ detections: [{ label: '', confidence: 90 }] })).toEqual([]);
      expect(validateDetections({ detections: [{ confidence: 90 }] })).toEqual([]);
      expect(validateDetections({ detections: [{ label: 12, confidence: 90 }] })).toEqual([]);
    });

    it('clamps confidence and drops a malformed bbox instead of trusting it', () => {
      expect(validateDetections({ detections: [{ label: 'x', confidence: 900 }] })).toEqual([
        { label: 'x', confidence: 100 },
      ]);
      expect(
        validateDetections({ detections: [{ label: 'x', confidence: 50, bbox: [1, 2, 3] }] }),
      ).toEqual([{ label: 'x', confidence: 50 }]);
      expect(
        validateDetections({ detections: [{ label: 'x', confidence: 50, bbox: [1, 'a', 3, 4] }] }),
      ).toEqual([{ label: 'x', confidence: 50 }]);
      expect(
        validateDetections({ detections: [{ label: 'x', confidence: 50, bbox: [1, 2, 3, Infinity] }] }),
      ).toEqual([{ label: 'x', confidence: 50 }]);
    });

    it('returns an empty list for any wholly-invalid payload - never throws at the caller', () => {
      expect(validateDetections(null)).toEqual([]);
      expect(validateDetections('nope')).toEqual([]);
      expect(validateDetections({})).toEqual([]);
      expect(validateDetections({ detections: 'nope' })).toEqual([]);
      expect(validateDetections({ detections: [null, 3, 'x'] })).toEqual([]);
    });

    it('caps the number of detections it will accept from the service', () => {
      const many = Array.from({ length: 500 }, (_, i) => ({ label: `d${i}`, confidence: 50 }));
      expect(validateDetections({ detections: many })).toHaveLength(50);
    });

    it('truncates an over-long label', () => {
      const [only] = validateDetections({ detections: [{ label: 'x'.repeat(500), confidence: 1 }] });
      expect(only.label.length).toBe(120);
    });
  });
});
