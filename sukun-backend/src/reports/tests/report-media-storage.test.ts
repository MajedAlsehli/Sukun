import { env } from '../../config/env';
import {
  ALLOWED_REPORT_MEDIA_MIME_TYPES,
  decodeAndValidateImage,
  detectImageMimeType,
  extensionForMimeType,
  MAX_HOMEOWNER_PHOTOS,
  MAX_REPORT_MEDIA_BYTES,
  MIN_AFTER_PHOTOS,
  MIN_HOMEOWNER_PHOTOS,
  selectReportMediaAdapter,
} from '../report-media-storage';

// Minimal but genuinely valid magic-number prefixes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.alloc(64),
]);
// "MZ" - a Windows executable. The exact thing "no executable content" is about.
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

const b64 = (buf: Buffer) => buf.toString('base64');

describe('report media validation (decisions.md I11)', () => {
  it('accepts each allowed image type when the bytes genuinely match', () => {
    expect(decodeAndValidateImage({ mimeType: 'image/jpeg', contentBase64: b64(JPEG) }).mimeType).toBe(
      'image/jpeg',
    );
    expect(decodeAndValidateImage({ mimeType: 'image/png', contentBase64: b64(PNG) }).mimeType).toBe(
      'image/png',
    );
    expect(decodeAndValidateImage({ mimeType: 'image/webp', contentBase64: b64(WEBP) }).mimeType).toBe(
      'image/webp',
    );
  });

  it('rejects a MIME type outside the allow-list', () => {
    expect(() =>
      decodeAndValidateImage({ mimeType: 'image/gif', contentBase64: b64(PNG) }),
    ).toThrow(/Unsupported image type/);
    expect(() =>
      decodeAndValidateImage({ mimeType: 'application/pdf', contentBase64: b64(PNG) }),
    ).toThrow(/Unsupported image type/);
  });

  it('rejects executable content disguised with an image MIME type', () => {
    expect(() =>
      decodeAndValidateImage({ mimeType: 'image/png', contentBase64: b64(EXE) }),
    ).toThrow(/not a supported image/);
  });

  it('rejects a declared type that does not match the real file content', () => {
    expect(() =>
      decodeAndValidateImage({ mimeType: 'image/png', contentBase64: b64(JPEG) }),
    ).toThrow(/does not match the file content/);
  });

  it('rejects an empty upload', () => {
    expect(() => decodeAndValidateImage({ mimeType: 'image/png', contentBase64: '' })).toThrow(
      /empty/,
    );
  });

  it('rejects an oversized upload', () => {
    const tooBig = Buffer.concat([PNG, Buffer.alloc(MAX_REPORT_MEDIA_BYTES + 1)]);
    expect(() =>
      decodeAndValidateImage({ mimeType: 'image/png', contentBase64: b64(tooBig) }),
    ).toThrow(/exceeds the 8MB limit/);
  });

  it('enforces H8\'s 1-10 photo rule and C2\'s at-least-one-after-photo rule', () => {
    expect(MIN_HOMEOWNER_PHOTOS).toBe(1);
    expect(MAX_HOMEOWNER_PHOTOS).toBe(10);
    expect(MIN_AFTER_PHOTOS).toBe(1);
  });

  it('maps each allowed MIME type to a safe extension, and anything else to .bin', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/webp')).toBe('webp');
    expect(extensionForMimeType('text/html')).toBe('bin');
  });

  it('detects the three supported formats and nothing else', () => {
    expect(detectImageMimeType(JPEG)).toBe('image/jpeg');
    expect(detectImageMimeType(PNG)).toBe('image/png');
    expect(detectImageMimeType(WEBP)).toBe('image/webp');
    expect(detectImageMimeType(EXE)).toBeNull();
    expect(detectImageMimeType(Buffer.alloc(2))).toBeNull();
    expect(ALLOWED_REPORT_MEDIA_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('report media storage adapter selection (decisions.md I11)', () => {
  const original = {
    url: env.supabaseStorage.url,
    key: env.supabaseStorage.serviceKey,
    bucket: env.supabaseStorage.bucket,
    privateBucket: env.supabaseStorage.privateBucket,
    driver: env.reportMedia.driver,
    publicBaseUrl: env.reportMedia.publicBaseUrl,
    nodeEnv: env.nodeEnv,
  };

  afterEach(() => {
    env.supabaseStorage.url = original.url;
    env.supabaseStorage.serviceKey = original.key;
    env.supabaseStorage.bucket = original.bucket;
    env.supabaseStorage.privateBucket = original.privateBucket;
    env.reportMedia.driver = original.driver;
    env.reportMedia.publicBaseUrl = original.publicBaseUrl;
    env.nodeEnv = original.nodeEnv;
  });

  function clearSupabase() {
    env.supabaseStorage.url = '';
    env.supabaseStorage.serviceKey = '';
    env.supabaseStorage.bucket = '';
    env.supabaseStorage.privateBucket = '';
  }

  function configureSupabase() {
    env.supabaseStorage.url = 'https://example.supabase.co';
    env.supabaseStorage.serviceKey = 'service-key';
    env.supabaseStorage.bucket = 'sakn-public';
    env.supabaseStorage.privateBucket = 'sakn-private';
  }

  it('is UNAVAILABLE in this environment - Supabase Storage is genuinely unconfigured', () => {
    // Verified against the real .env, not assumed: this is the honest blocker
    // Task 8 reports rather than papering over.
    expect(env.supabaseStorage.url).toBe('');
    clearSupabase();
    env.reportMedia.driver = '';
    expect(selectReportMediaAdapter().driver).toBe('unavailable');
  });

  it('fails an upload with REPORT_MEDIA_STORAGE_NOT_CONFIGURED - never a fake URL', async () => {
    clearSupabase();
    env.reportMedia.driver = '';
    const adapter = selectReportMediaAdapter();

    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.upload('k', PNG, 'image/png')).rejects.toMatchObject({
      errorCode: 'REPORT_MEDIA_STORAGE_NOT_CONFIGURED',
    });
    await expect(adapter.getDataUri('k', 'image/png')).rejects.toMatchObject({
      errorCode: 'REPORT_MEDIA_STORAGE_NOT_CONFIGURED',
    });
    // No signature is invented for an object that was never stored either.
    expect((await adapter.signedUrls(['k'])).size).toBe(0);
    // Not even a URL is invented for an object that was never stored.
    expect(() => adapter.publicUrl('k')).toThrow(
      expect.objectContaining({ errorCode: 'REPORT_MEDIA_STORAGE_NOT_CONFIGURED' }),
    );
  });

  // Task 10 (decisions.md K3) replaced the old "builds an ABSOLUTE Supabase
  // PUBLIC URL" expectation. Report photos are a homeowner's property
  // evidence: they now live in the PRIVATE bucket, so there is no anonymous
  // URL to build at all, and asking for one is a programming error rather
  // than something to answer with a link that would 400 at Supabase.
  it('refuses to produce a public URL for a private report photo', () => {
    configureSupabase();
    const adapter = selectReportMediaAdapter();
    expect(adapter.driver).toBe('supabase');
    expect(() => adapter.publicUrl('reports/a/b.png')).toThrow(
      expect.objectContaining({ errorCode: 'REPORT_MEDIA_PRIVATE' }),
    );
  });

  it('reports itself configured off the PRIVATE bucket, not the public one', () => {
    configureSupabase();
    env.supabaseStorage.privateBucket = '';
    // A public bucket alone is not enough - report media has nowhere private
    // to go, so the adapter must not claim to be usable.
    expect(selectReportMediaAdapter().driver).toBe('unavailable');
  });

  it('signs private objects in ONE batched call and never one per photo', async () => {
    configureSupabase();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { path: 'reports/a/1.png', signedURL: '/object/sign/sakn-private/reports/a/1.png?token=t1' },
            { path: 'reports/a/2.png', signedURL: '/object/sign/sakn-private/reports/a/2.png?token=t2' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    try {
      const signed = await selectReportMediaAdapter().signedUrls([
        'reports/a/1.png',
        'reports/a/2.png',
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchMock.mock.calls[0];
      expect(String(calledUrl)).toBe('https://example.supabase.co/storage/v1/object/sign/sakn-private');
      expect(signed.get('reports/a/1.png')).toBe(
        'https://example.supabase.co/storage/v1/object/sign/sakn-private/reports/a/1.png?token=t1',
      );
      expect(signed.size).toBe(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('degrades to an empty signing map rather than a broken link when signing fails', async () => {
    configureSupabase();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }));
    try {
      expect((await selectReportMediaAdapter().signedUrls(['reports/a/1.png'])).size).toBe(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('builds an ABSOLUTE test-driver URL against the configured API origin', () => {
    clearSupabase();
    env.reportMedia.driver = 'test';
    env.reportMedia.publicBaseUrl = 'http://localhost:4000';
    // A root-relative path would resolve against the FRONTEND origin in dev and
    // 404 - which is exactly the defect the browser-verification pass caught.
    expect(selectReportMediaAdapter().publicUrl('reports/a/b.png')).toBe(
      'http://localhost:4000/files/report-media/reports/a/b.png',
    );
  });

  it('prefers Supabase Storage whenever the private bucket is fully configured', () => {
    configureSupabase();
    env.reportMedia.driver = 'test';

    // Even with the test driver requested, real durable storage wins.
    const adapter = selectReportMediaAdapter();
    expect(adapter.driver).toBe('supabase');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('enables the explicit test driver only when asked for by name', () => {
    clearSupabase();
    env.reportMedia.driver = 'test';
    expect(selectReportMediaAdapter().driver).toBe('test');

    env.reportMedia.driver = 'local';
    expect(selectReportMediaAdapter().driver).toBe('unavailable');
  });

  it('REFUSES to construct the non-durable test driver under NODE_ENV=production', () => {
    clearSupabase();
    env.reportMedia.driver = 'test';
    env.nodeEnv = 'production';

    expect(() => selectReportMediaAdapter()).toThrow(/not permitted in production/);
  });
});
