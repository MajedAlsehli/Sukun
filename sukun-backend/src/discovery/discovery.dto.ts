import { z } from 'zod';

export const listDiscoveryProjectsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  priceBand: z.enum(['UNDER_500K', 'FROM_500K_TO_1M', 'FROM_1M_TO_2M', 'ABOVE_2M']).optional(),
  unitType: z.string().trim().min(1).optional(),
  readiness: z.enum(['READY', 'UNDER_CONSTRUCTION', 'OFF_PLAN']).optional(),
  // 'true' = only the requester's saved projects (favorites view).
  saved: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListDiscoveryProjectsQueryDto = z.infer<typeof listDiscoveryProjectsQuerySchema>;
