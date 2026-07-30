import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { BusinessError, ValidationError } from '../shared/errors';
import {
  createSignedUrls,
  deleteObject,
  downloadObject,
  isStorageConfigured,
  privateMediaTarget,
  uploadObject,
} from '../shared/supabaseStorage';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I11): durable storage for canonical
// report photos - or an honest failure. A third independent adapter following
// E7 (project covers) and G12 (visit media), deliberately not a refactor of
// either already-tested file.
//
// Three drivers, chosen once at module load:
//   * Supabase Storage  - when SUPABASE_STORAGE_URL/SERVICE_KEY and the PRIVATE
//                         bucket are set. Task 10 moved these objects out of the
//                         public bucket: a homeowner's report photos are property
//                         evidence, so they are reachable only through a
//                         short-lived signed URL minted after the caller has
//                         already been authorized for the parent report.
//   * Test              - REPORT_MEDIA_STORAGE_DRIVER=test, refuses to construct
//                         under NODE_ENV=production. Writes to STORAGE_ROOT and
//                         serves through the existing /files static mount. Exists
//                         only so automated/browser verification can exercise a
//                         real photo lifecycle while Supabase Storage remains an
//                         external configuration blocker. NOT durable, NOT a
//                         production capability, and documented as such.
//   * Unavailable       - everything else. Every upload fails with
//                         REPORT_MEDIA_STORAGE_NOT_CONFIGURED. Never a fake URL,
//                         never base64 in a database column, never a silent
//                         local-disk fallback in production.
// ---------------------------------------------------------------------------

export interface ReportMediaUploadResult {
  key: string;
  url: string;
}

export interface ReportMediaStorageAdapter {
  readonly driver: 'supabase' | 'test' | 'unavailable';
  isConfigured(): boolean;
  upload(key: string, buffer: Buffer, mimeType: string): Promise<ReportMediaUploadResult>;
  /**
   * The URL a browser should load this object from, when one exists without a
   * signature. The `supabase` driver has NO such URL (the bucket is private)
   * and throws; use `signedUrl()` there. The `test` driver serves through this
   * API's own /files mount and does have one.
   */
  publicUrl(key: string): string;
  /**
   * Short-lived signed URLs for private objects, keyed by storage key. Task 10:
   * this is what report DTOs hand to the browser - minted per response, in ONE
   * batched call, and only after the caller has already been authorized for the
   * parent report. A key that cannot be signed is simply absent from the map,
   * so the caller degrades to an honest missing image rather than a dead link.
   */
  signedUrls(keys: string[]): Promise<Map<string, string>>;
  /**
   * Reads an object back as a base64 data URI. Needed because the AI analysis
   * step runs against images the homeowner already staged, and the vision
   * provider is handed bytes rather than a URL (a URL would have to be publicly
   * reachable by a third party, which the test driver's /files path is not).
   */
  getDataUri(key: string, mimeType: string): Promise<string>;
  /**
   * Task 3 (Step 9): BEST-EFFORT removal of a single staged object.
   *
   * Staged objects are never moved or copied — the staging key IS the eventual
   * `ReportMedia.storageKey` — so nothing removed an object whose analysis or
   * submission never completed, and failed attempts accumulated in the private
   * bucket unreferenced by any row.
   *
   * MUST NOT THROW. It is called on failure paths where the caller is already
   * returning an error to the user; a cleanup problem must never replace the
   * real error, and must never turn a failed analysis into a failed request for
   * a different reason. A `false` return means "not removed", which is safe:
   * the orphan sweeper can still find it later.
   */
  remove(key: string): Promise<boolean>;
}

export const ALLOWED_REPORT_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ReportMediaMimeType = (typeof ALLOWED_REPORT_MEDIA_MIME_TYPES)[number];

export const MAX_REPORT_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_HOMEOWNER_PHOTOS = 10;
export const MIN_HOMEOWNER_PHOTOS = 1;
export const MAX_AFTER_PHOTOS = 10;
export const MIN_AFTER_PHOTOS = 1;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}

/**
 * Magic-number check on the decoded bytes, not just the declared MIME type -
 * "no executable content" cannot be satisfied by trusting a client-supplied
 * label. A renamed .exe with `mimeType: 'image/png'` fails here.
 */
export function detectImageMimeType(buffer: Buffer): ReportMediaMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Decodes and fully validates one submitted photo. Throws a ValidationError
 * (400) rather than a storage error for anything the client got wrong, so an
 * oversized or non-image upload never even reaches the storage adapter.
 */
export function decodeAndValidateImage(input: { mimeType: string; contentBase64: string }): {
  buffer: Buffer;
  mimeType: ReportMediaMimeType;
} {
  if (!(ALLOWED_REPORT_MEDIA_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new ValidationError('Unsupported image type. Allowed: JPEG, PNG, WebP.');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.contentBase64, 'base64');
  } catch {
    throw new ValidationError('Invalid base64 content');
  }

  if (buffer.length === 0) {
    throw new ValidationError('Uploaded photo is empty');
  }
  if (buffer.length > MAX_REPORT_MEDIA_BYTES) {
    throw new ValidationError(
      `Photo exceeds the ${Math.round(MAX_REPORT_MEDIA_BYTES / (1024 * 1024))}MB limit`,
    );
  }

  const detected = detectImageMimeType(buffer);
  if (!detected) {
    throw new ValidationError('File content is not a supported image (JPEG, PNG, or WebP)');
  }
  if (detected !== input.mimeType) {
    throw new ValidationError('Declared image type does not match the file content');
  }

  return { buffer, mimeType: detected };
}

/**
 * Task 10 (decisions.md K3): report photos live in the PRIVATE bucket. They
 * are a homeowner's own property evidence, so no anonymous URL to them exists
 * at all - `publicUrl()` deliberately refuses, and `signedUrl()` is the only
 * way to produce something a browser can load. The service that mints it has
 * already authorized the caller for the parent report.
 */
class SupabaseReportMediaStorage implements ReportMediaStorageAdapter {
  readonly driver = 'supabase' as const;

  isConfigured(): boolean {
    return isStorageConfigured(privateMediaTarget());
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<ReportMediaUploadResult> {
    await uploadObject(privateMediaTarget(), key, buffer, mimeType, 'REPORT_MEDIA_UPLOAD_FAILED');
    // No durable URL is stored for a private object: a signature would expire
    // long before the row does. The key IS the durable reference.
    return { key, url: '' };
  }

  publicUrl(): string {
    throw new BusinessError(
      'Report photos are private and have no public URL - use a signed URL',
      'REPORT_MEDIA_PRIVATE',
    );
  }

  async signedUrls(keys: string[]): Promise<Map<string, string>> {
    return createSignedUrls(privateMediaTarget(), keys);
  }

  async getDataUri(key: string, mimeType: string): Promise<string> {
    const bytes = await downloadObject(privateMediaTarget(), key, 'REPORT_MEDIA_READ_FAILED');
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  }

  async remove(key: string): Promise<boolean> {
    try {
      await deleteObject(privateMediaTarget(), key, 'REPORT_MEDIA_DELETE_FAILED');
      return true;
    } catch {
      // Deliberately swallowed - see the interface docstring.
      return false;
    }
  }
}

class TestReportMediaStorage implements ReportMediaStorageAdapter {
  readonly driver = 'test' as const;
  private readonly root: string;

  constructor() {
    // Hard stop: an environment mistake must never be able to turn a
    // non-durable local-disk driver on in production (decisions.md I11).
    if (env.nodeEnv === 'production') {
      throw new Error(
        'REPORT_MEDIA_STORAGE_DRIVER=test is not permitted in production - configure Supabase Storage instead',
      );
    }
    this.root = path.resolve(env.storage.root, 'report-media');
  }

  isConfigured(): boolean {
    return true;
  }

  private resolvePath(key: string): string {
    // Keys are entirely server-generated (uuid segments only), but resolve and
    // re-check anyway so this driver can never be talked into writing outside
    // its own directory.
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new ValidationError('Invalid storage key');
    }
    return target;
  }

  publicUrl(key: string): string {
    // Absolute against the API origin when one is configured: this driver
    // serves through THIS server's /files mount, and in dev the frontend runs
    // on a different port, where a root-relative path would 404.
    const base = env.reportMedia.publicBaseUrl.replace(/\/$/, '');
    return `${base}/files/report-media/${key}`;
  }

  /** The local driver serves through /files; there is nothing to sign. */
  async signedUrls(keys: string[]): Promise<Map<string, string>> {
    return new Map(keys.map((key) => [key, this.publicUrl(key)]));
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<ReportMediaUploadResult> {
    const target = this.resolvePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return { key, url: this.publicUrl(key) };
  }

  async getDataUri(key: string, mimeType: string): Promise<string> {
    const bytes = await fs.readFile(this.resolvePath(key));
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  }

  async remove(key: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }
}

class UnavailableReportMediaStorage implements ReportMediaStorageAdapter {
  readonly driver = 'unavailable' as const;

  isConfigured(): boolean {
    return false;
  }

  async upload(): Promise<ReportMediaUploadResult> {
    throw new BusinessError(
      'Report media storage is not configured in this environment',
      'REPORT_MEDIA_STORAGE_NOT_CONFIGURED',
    );
  }

  publicUrl(): string {
    // Never a fabricated URL - an unconfigured adapter never produced an object
    // to point at, so there is nothing legitimate to return.
    throw new BusinessError(
      'Report media storage is not configured in this environment',
      'REPORT_MEDIA_STORAGE_NOT_CONFIGURED',
    );
  }

  async signedUrls(): Promise<Map<string, string>> {
    return new Map();
  }

  async getDataUri(): Promise<string> {
    throw new BusinessError(
      'Report media storage is not configured in this environment',
      'REPORT_MEDIA_STORAGE_NOT_CONFIGURED',
    );
  }

  async remove(): Promise<boolean> {
    // Nothing was ever stored, so nothing can be orphaned.
    return false;
  }
}

export function selectReportMediaAdapter(): ReportMediaStorageAdapter {
  const supabase = new SupabaseReportMediaStorage();
  if (supabase.isConfigured()) return supabase;
  if (env.reportMedia.driver === 'test') return new TestReportMediaStorage();
  return new UnavailableReportMediaStorage();
}

export const reportMediaStorage: ReportMediaStorageAdapter = selectReportMediaAdapter();
