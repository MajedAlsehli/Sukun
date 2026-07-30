import { z } from 'zod';

// JSON+base64 upload, not multipart - keeps the whole API surface uniformly
// JSON per 08_API_Specification.md's "Every endpoint returns JSON" (input
// format for upload isn't specified there; this is the simplest choice for
// an MVP local-disk store). ~14MB decoded cap - reasonable default, not stated
// anywhere in the docs.
// mimeType is restricted to what storage.util.ts's extensionFromMimeType
// actually knows how to handle - previously any string was accepted, so an
// unrecognized type would silently get stored with no file extension at all.
export const uploadFileSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  contentBase64: z.string().min(1).max(20_000_000),
});
export type UploadFileDto = z.infer<typeof uploadFileSchema>;
