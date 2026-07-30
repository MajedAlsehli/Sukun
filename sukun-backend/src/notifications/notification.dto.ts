import { z } from 'zod';

export const markReadSchema = z.object({
  notificationId: z.string().min(1).optional(),
});
export type MarkReadDto = z.infer<typeof markReadSchema>;
