import { z } from 'zod';

// Task 4 (decisions.md E2): read-only picker only - no create/update schema,
// no management CRUD exists for this entity in this task's scope.
export const listContractorsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListContractorsQueryDto = z.infer<typeof listContractorsQuerySchema>;
