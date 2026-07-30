import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entity: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
});
export type ListAuditLogsQueryDto = z.infer<typeof listAuditLogsQuerySchema>;
