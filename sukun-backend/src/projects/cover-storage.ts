import { BusinessError } from '../shared/errors';
import {
  deleteObject,
  isStorageConfigured,
  publicMediaTarget,
  publicObjectUrl,
  uploadObject,
} from '../shared/supabaseStorage';

export interface CoverUploadResult {
  key: string;
  url: string;
}

// Task 4 (decisions.md E7): Vercel has no persistent local filesystem, so
// project covers cannot reuse files/storage.util.ts's local-disk MVP path.
// This interface is the swap point - Supabase Storage today, anything else
// later, without touching project.service.ts's calling code.
export interface CoverStorageAdapter {
  isConfigured(): boolean;
  upload(key: string, buffer: Buffer, mimeType: string): Promise<CoverUploadResult>;
  /**
   * Task 10: replacing a cover used to leave the superseded object in the
   * bucket forever - the row pointed elsewhere but the bytes stayed readable
   * at a URL someone may already have. `remove` is called after the new cover
   * is committed, so a failure here can never lose the new one.
   */
  remove(key: string): Promise<void>;
}

/**
 * Task 10 (decisions.md K3): covers stay in the PUBLIC bucket, deliberately.
 * A project cover is marketing content on a discoverable project - an
 * anonymous home seeker who is not signed in has to be able to load it. The
 * PRIVATE bucket is for report and visit photos, which are property evidence.
 */
class SupabaseCoverStorage implements CoverStorageAdapter {
  isConfigured(): boolean {
    return isStorageConfigured(publicMediaTarget());
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<CoverUploadResult> {
    await uploadObject(publicMediaTarget(), key, buffer, mimeType, 'COVER_UPLOAD_FAILED');
    return { key, url: publicObjectUrl(publicMediaTarget(), key) };
  }

  async remove(key: string): Promise<void> {
    await deleteObject(publicMediaTarget(), key, 'COVER_DELETE_FAILED');
  }
}

// Honest failure, never a fake success - per decisions.md E7, "prefer an
// explicit failure over pretending a temporary local upload is durable."
class UnavailableCoverStorage implements CoverStorageAdapter {
  isConfigured(): boolean {
    return false;
  }

  async upload(): Promise<CoverUploadResult> {
    throw new BusinessError(
      'Cover image storage is not configured in this environment',
      'COVER_STORAGE_NOT_CONFIGURED',
    );
  }

  async remove(): Promise<void> {
    // Nothing was ever stored, so there is nothing to remove and nothing to
    // report as failed.
  }
}

function selectAdapter(): CoverStorageAdapter {
  const supabase = new SupabaseCoverStorage();
  return supabase.isConfigured() ? supabase : new UnavailableCoverStorage();
}

export const coverStorage: CoverStorageAdapter = selectAdapter();
