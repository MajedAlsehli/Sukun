import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

// Local-disk MVP storage (product decision - see conversation history).
// Swappable behind this same interface for S3/Supabase Storage later.
export function writeLocalFile(buffer: Buffer, extension: string): { storageKey: string } {
  fs.mkdirSync(env.storage.root, { recursive: true });
  const storageKey = `${randomUUID()}${extension}`;
  fs.writeFileSync(path.join(env.storage.root, storageKey), buffer);
  return { storageKey };
}

export function extensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mimeType] ?? '';
}
