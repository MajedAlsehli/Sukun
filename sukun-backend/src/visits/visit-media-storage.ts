import { BusinessError } from '../shared/errors';
import {
  createSignedUrls,
  isStorageConfigured,
  privateMediaTarget,
  uploadObject,
} from '../shared/supabaseStorage';

export interface VisitMediaUploadResult {
  /**
   * Task 10: empty for the private bucket - a private object has no durable
   * URL, only a signature that expires. `storageKey` is the durable reference
   * and `signedUrls()` turns it back into something a browser can load, after
   * the caller has already been authorized for the parent visit.
   */
  url: string;
  storageKey: string;
}

// Task 6 (decisions.md G12): a second, independent adapter mirroring
// projects/cover-storage.ts's shape against the same already-configured
// Supabase Storage env vars - deliberately not a refactor of the
// already-tested cover-storage.ts (lower risk, no touch to Task 4's verified
// code), at the cost of some small duplication. Honest failure, never a fake
// success, same as cover-storage.ts.
export interface VisitMediaStorageAdapter {
  isConfigured(): boolean;
  upload(key: string, buffer: Buffer, mimeType: string): Promise<VisitMediaUploadResult>;
  /** Short-lived signed URLs by storage key; empty map when unconfigured. */
  signedUrls(keys: string[]): Promise<Map<string, string>>;
}

/**
 * Task 10 (decisions.md K3): visit note/issue photos are a prospect's own
 * observations inside someone's property. They live in the PRIVATE bucket and
 * are served through short-lived signed URLs, never an anonymous public link.
 */
class SupabaseVisitMediaStorage implements VisitMediaStorageAdapter {
  isConfigured(): boolean {
    return isStorageConfigured(privateMediaTarget());
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<VisitMediaUploadResult> {
    await uploadObject(privateMediaTarget(), key, buffer, mimeType, 'MEDIA_UPLOAD_FAILED');
    return { url: '', storageKey: key };
  }

  async signedUrls(keys: string[]): Promise<Map<string, string>> {
    return createSignedUrls(privateMediaTarget(), keys);
  }
}

class UnavailableVisitMediaStorage implements VisitMediaStorageAdapter {
  isConfigured(): boolean {
    return false;
  }

  async upload(): Promise<VisitMediaUploadResult> {
    throw new BusinessError(
      'Visit media storage is not configured in this environment',
      'MEDIA_STORAGE_NOT_CONFIGURED',
    );
  }

  async signedUrls(): Promise<Map<string, string>> {
    return new Map();
  }
}

function selectAdapter(): VisitMediaStorageAdapter {
  const supabase = new SupabaseVisitMediaStorage();
  return supabase.isConfigured() ? supabase : new UnavailableVisitMediaStorage();
}

export const visitMediaStorage: VisitMediaStorageAdapter = selectAdapter();

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}
