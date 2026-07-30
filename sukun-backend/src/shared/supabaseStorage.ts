import { env } from '../config/env';
import { BusinessError, ValidationError } from './errors';

// ---------------------------------------------------------------------------
// Task 10 (docs/integration/decisions.md K3) - the ONE Supabase Storage
// transport.
//
// Tasks 4/6/8 each grew their own adapter (project covers, visit media, report
// media) that duplicated the same three fetch calls against the same PUBLIC
// object path. Task 10 does not merge those three adapters - their business
// rules, error codes and tests are genuinely different and are already
// verified - but it does put the raw HTTP in one place, because that is where
// the two things Task 10 must actually change live:
//
//   1. PRIVATE buckets. Homeowner report photos and visit note/issue photos
//      are property evidence, not marketing content. They go in a private
//      bucket and are never reachable by URL alone.
//   2. Signed URLs. A private object is served through a short-lived signed
//      URL that the server mints only AFTER it has authorized the caller for
//      the parent report/visit. The signature is not the authorization - the
//      authorization already happened, and the signature is what lets an
//      <img> tag load the bytes without carrying a bearer token.
//
// Nothing in this file is reachable from the browser, and the service key
// never leaves the server: it is used to sign, and the signature is what
// travels.
// ---------------------------------------------------------------------------

export interface SupabaseStorageTarget {
  /** Bucket name. `private: true` buckets must never be linked to directly. */
  bucket: string;
  private: boolean;
}

export function publicMediaTarget(): SupabaseStorageTarget {
  return { bucket: env.supabaseStorage.bucket, private: false };
}

export function privateMediaTarget(): SupabaseStorageTarget {
  return { bucket: env.supabaseStorage.privateBucket, private: true };
}

export function isStorageConfigured(target: SupabaseStorageTarget): boolean {
  return !!(env.supabaseStorage.url && env.supabaseStorage.serviceKey && target.bucket);
}

/**
 * Object keys in this product are ALWAYS server-derived (uuid segments and a
 * whitelisted extension). This is the belt-and-braces check that says so in
 * code: no absolute path, no traversal segment, no backslash, no scheme, no
 * empty segment, and finally a strict `[A-Za-z0-9._/-]` whitelist that also
 * excludes every control character. It runs on every read and every write,
 * so a key that somehow reached the database from a bad migration or an
 * imported row still cannot escape its bucket.
 */
export function assertSafeStorageKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    throw new ValidationError('Invalid storage key');
  }
  if (key.startsWith('/') || key.includes('\\') || key.includes('://')) {
    throw new ValidationError('Invalid storage key');
  }
  const segments = key.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new ValidationError('Invalid storage key');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) {
    throw new ValidationError('Invalid storage key');
  }
}

function requireConfigured(target: SupabaseStorageTarget, errorCode: string): void {
  if (!isStorageConfigured(target)) {
    throw new BusinessError('Media storage is not configured in this environment', errorCode);
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.supabaseStorage.serviceKey}` };
}

/** Uploads (or replaces, via x-upsert) one object. */
export async function uploadObject(
  target: SupabaseStorageTarget,
  key: string,
  buffer: Buffer,
  mimeType: string,
  errorCode: string,
): Promise<void> {
  requireConfigured(target, errorCode);
  assertSafeStorageKey(key);

  const res = await fetch(
    `${env.supabaseStorage.url}/storage/v1/object/${target.bucket}/${encodeStorageKey(key)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': mimeType,
        // Replace-in-place. Keys are uuid-based so a genuine collision is not
        // expected; this makes a retry of the same upload idempotent rather
        // than a 409.
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BusinessError(`Supabase Storage upload failed: ${res.status} ${body}`.trim(), errorCode);
  }
}

/**
 * A short-lived signed URL for a PRIVATE object. Returns null when storage is
 * not configured, so a caller can degrade to an honest "unavailable" state
 * rather than emitting a broken link.
 */
export async function createSignedUrl(
  target: SupabaseStorageTarget,
  key: string,
  ttlSeconds: number = env.supabaseStorage.signedUrlTtlSeconds,
): Promise<string | null> {
  if (!isStorageConfigured(target)) return null;
  assertSafeStorageKey(key);

  const res = await fetch(
    `${env.supabaseStorage.url}/storage/v1/object/sign/${target.bucket}/${encodeStorageKey(key)}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    },
  );

  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as { signedURL?: string; signedUrl?: string } | null;
  const signed = payload?.signedURL ?? payload?.signedUrl;
  if (!signed) return null;

  // Supabase returns a root-relative path ("/object/sign/<bucket>/<key>?token=…").
  return signed.startsWith('http') ? signed : `${env.supabaseStorage.url}/storage/v1${signed}`;
}

/**
 * Batch variant of `createSignedUrl`. One request for every photo on a report
 * detail (or a whole technician-history page), never one request per photo -
 * the same bounded-fan-out discipline decisions.md J15 applies to the database.
 * Keys that fail to sign are simply absent from the returned map, so a caller
 * degrades to an honest missing image rather than a broken link.
 */
export async function createSignedUrls(
  target: SupabaseStorageTarget,
  keys: string[],
  ttlSeconds: number = env.supabaseStorage.signedUrlTtlSeconds,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (keys.length === 0 || !isStorageConfigured(target)) return result;
  for (const key of keys) assertSafeStorageKey(key);

  const res = await fetch(`${env.supabaseStorage.url}/storage/v1/object/sign/${target.bucket}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: ttlSeconds, paths: keys }),
  });

  if (!res.ok) return result;

  const payload = (await res.json().catch(() => null)) as
    | Array<{ path?: string; signedURL?: string; signedUrl?: string; error?: string | null }>
    | null;
  if (!Array.isArray(payload)) return result;

  for (const entry of payload) {
    const signed = entry.signedURL ?? entry.signedUrl;
    if (!entry.path || !signed || entry.error) continue;
    result.set(
      entry.path,
      signed.startsWith('http') ? signed : `${env.supabaseStorage.url}/storage/v1${signed}`,
    );
  }
  return result;
}

/** Reads an object back through the service key - never through a public URL. */
export async function downloadObject(
  target: SupabaseStorageTarget,
  key: string,
  errorCode: string,
): Promise<Buffer> {
  requireConfigured(target, errorCode);
  assertSafeStorageKey(key);

  const res = await fetch(
    `${env.supabaseStorage.url}/storage/v1/object/${target.bucket}/${encodeStorageKey(key)}`,
    { headers: authHeaders() },
  );

  if (!res.ok) {
    throw new BusinessError(`Stored object could not be read back: ${res.status}`, errorCode);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Deletes one object. Used only where the product genuinely replaces media
 * (a project cover being re-uploaded). Report and visit photos are evidence
 * and are never deleted - see decisions.md A7.
 */
export async function deleteObject(
  target: SupabaseStorageTarget,
  key: string,
  errorCode: string,
): Promise<void> {
  requireConfigured(target, errorCode);
  assertSafeStorageKey(key);

  const res = await fetch(
    `${env.supabaseStorage.url}/storage/v1/object/${target.bucket}/${encodeStorageKey(key)}`,
    { method: 'DELETE', headers: authHeaders() },
  );

  // 404 is a successful outcome for a delete: the object is gone either way.
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new BusinessError(`Supabase Storage delete failed: ${res.status} ${body}`.trim(), errorCode);
  }
}

/** Percent-encodes each path segment while keeping the `/` separators. */
export function encodeStorageKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** The anonymous, cache-friendly URL of a PUBLIC object (project covers only). */
export function publicObjectUrl(target: SupabaseStorageTarget, key: string): string {
  assertSafeStorageKey(key);
  return `${env.supabaseStorage.url}/storage/v1/object/public/${target.bucket}/${encodeStorageKey(key)}`;
}
