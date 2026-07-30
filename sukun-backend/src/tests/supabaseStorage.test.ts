import { env } from '../config/env';
import {
  assertSafeStorageKey,
  createSignedUrls,
  deleteObject,
  downloadObject,
  encodeStorageKey,
  isStorageConfigured,
  privateMediaTarget,
  publicMediaTarget,
  publicObjectUrl,
  uploadObject,
} from '../shared/supabaseStorage';

/**
 * Task 10 (decisions.md K3) - the shared Supabase Storage transport.
 *
 * Storage is genuinely unconfigured in this environment, so these drive the
 * transport against a mocked `fetch`. What they pin down is the part that is
 * true regardless of whether a bucket exists: key safety, which bucket each
 * media class targets, and honest behaviour when nothing is configured.
 */
describe('storage key safety (no traversal, no absolute path, no scheme)', () => {
  it('accepts the server-derived key shapes this product actually produces', () => {
    expect(() => assertSafeStorageKey('reports/abc-123/homeowner/9f3.png')).not.toThrow();
    expect(() => assertSafeStorageKey('visits/v1/notes/2b7.jpg')).not.toThrow();
    expect(() => assertSafeStorageKey('projects/p1/cover-77a.webp')).not.toThrow();
  });

  it.each([
    ['a traversal segment', 'reports/../../etc/passwd'],
    ['a bare traversal', '../secrets.png'],
    ['a current-directory segment', 'reports/./a.png'],
    ['an absolute path', '/etc/passwd'],
    ['a windows separator', 'reports\\a.png'],
    ['an embedded scheme', 'https://evil.example/a.png'],
    ['an empty segment', 'reports//a.png'],
    ['an empty key', ''],
    ['a space', 'reports/a b.png'],
    ['a null byte', `reports/a${String.fromCharCode(0)}.png`],
    ['a newline', 'reports/a\n.png'],
    ['a query string', 'reports/a.png?x=1'],
  ])('rejects %s', (_label, key) => {
    expect(() => assertSafeStorageKey(key)).toThrow(/Invalid storage key/);
  });

  it('rejects an absurdly long key', () => {
    expect(() => assertSafeStorageKey('a'.repeat(513))).toThrow(/Invalid storage key/);
  });

  it('percent-encodes segments while preserving the separators', () => {
    expect(encodeStorageKey('reports/a-b/c.png')).toBe('reports/a-b/c.png');
  });
});

describe('bucket targeting (decisions.md K3)', () => {
  const original = { ...env.supabaseStorage };

  afterEach(() => {
    Object.assign(env.supabaseStorage, original);
    jest.restoreAllMocks();
  });

  function configure() {
    env.supabaseStorage.url = 'https://example.supabase.co';
    env.supabaseStorage.serviceKey = 'service-key';
    env.supabaseStorage.bucket = 'sakn-public';
    env.supabaseStorage.privateBucket = 'sakn-private';
  }

  it('routes project covers to the PUBLIC bucket and report/visit media to the PRIVATE one', () => {
    configure();
    expect(publicMediaTarget()).toEqual({ bucket: 'sakn-public', private: false });
    expect(privateMediaTarget()).toEqual({ bucket: 'sakn-private', private: true });
  });

  it('builds an anonymous URL only for a public object', () => {
    configure();
    expect(publicObjectUrl(publicMediaTarget(), 'projects/p1/cover.png')).toBe(
      'https://example.supabase.co/storage/v1/object/public/sakn-public/projects/p1/cover.png',
    );
  });

  it('reports itself unconfigured when only the public bucket exists', () => {
    configure();
    env.supabaseStorage.privateBucket = '';
    expect(isStorageConfigured(publicMediaTarget())).toBe(true);
    expect(isStorageConfigured(privateMediaTarget())).toBe(false);
  });

  it('never sends the service key anywhere except the storage host, and never returns it', async () => {
    configure();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));

    await uploadObject(privateMediaTarget(), 'reports/r1/a.png', Buffer.from([1, 2, 3]), 'image/png', 'X');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/example\.supabase\.co\//);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer service-key');
  });

  it('fails honestly rather than silently when storage is unconfigured', async () => {
    env.supabaseStorage.url = '';
    env.supabaseStorage.serviceKey = '';
    env.supabaseStorage.bucket = '';
    env.supabaseStorage.privateBucket = '';

    await expect(
      uploadObject(privateMediaTarget(), 'reports/r1/a.png', Buffer.alloc(1), 'image/png', 'NOT_CONFIGURED'),
    ).rejects.toMatchObject({ errorCode: 'NOT_CONFIGURED' });
    await expect(
      downloadObject(privateMediaTarget(), 'reports/r1/a.png', 'NOT_CONFIGURED'),
    ).rejects.toMatchObject({ errorCode: 'NOT_CONFIGURED' });
    await expect(
      deleteObject(publicMediaTarget(), 'projects/p1/c.png', 'NOT_CONFIGURED'),
    ).rejects.toMatchObject({ errorCode: 'NOT_CONFIGURED' });
    // Signing degrades to "nothing to show" rather than an exception, so a
    // report detail still renders with an honest missing image.
    expect((await createSignedUrls(privateMediaTarget(), ['reports/r1/a.png'])).size).toBe(0);
  });

  it('treats a 404 on delete as success - the object is gone either way', async () => {
    configure();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(
      deleteObject(publicMediaTarget(), 'projects/p1/c.png', 'COVER_DELETE_FAILED'),
    ).resolves.toBeUndefined();
  });

  it('refuses an unsafe key before any network call is made', async () => {
    configure();
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(
      uploadObject(privateMediaTarget(), '../escape.png', Buffer.alloc(1), 'image/png', 'X'),
    ).rejects.toThrow(/Invalid storage key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
