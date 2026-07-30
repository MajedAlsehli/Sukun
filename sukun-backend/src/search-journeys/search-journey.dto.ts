import { z } from 'zod';

// Not documented as taking a body in 08_API_Specification.md; kept optional
// for audit context ("why was this cancelled") rather than a real precondition.
export const cancelSearchJourneySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelSearchJourneyDto = z.infer<typeof cancelSearchJourneySchema>;
