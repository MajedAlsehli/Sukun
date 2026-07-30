import { z } from 'zod';

// Task 4 (decisions.md E3): read-only picker only. No PM-creation endpoint
// exists (README "Known gaps" #1) - provisioning stays a manual DB operation.
export const listManagersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListManagersQueryDto = z.infer<typeof listManagersQuerySchema>;
