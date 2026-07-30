import { z } from 'zod';
import { MAX_CHAT_MESSAGE_CHARS } from './pm.copilot';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md J2/J12).
//
// `projectId` is accepted for a legitimate multi-project future shape, but the
// service INTERSECTS it with the PM's real assignment and 404s a foreign value
// (J2). Validating it here does not grant it any authority.
// ---------------------------------------------------------------------------

export const pmScopeQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});
export type PmScopeQueryDto = z.infer<typeof pmScopeQuerySchema>;

export const pmActivityQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type PmActivityQueryDto = z.infer<typeof pmActivityQuerySchema>;

export const pmCopilotSummarySchema = z.object({
  /**
   * Optional UI context. Bounded and folded into the QUESTION only - it can
   * never widen what the model was shown, because the snapshot is built
   * server-side from the authenticated principal (J12).
   */
  context: z.string().trim().max(200).optional(),
});
export type PmCopilotSummaryDto = z.infer<typeof pmCopilotSummarySchema>;

export const pmCopilotChatSchema = z.object({
  message: z.string().trim().min(1, 'A message is required').max(MAX_CHAT_MESSAGE_CHARS),
  context: z.string().trim().max(200).optional(),
});
export type PmCopilotChatDto = z.infer<typeof pmCopilotChatSchema>;
