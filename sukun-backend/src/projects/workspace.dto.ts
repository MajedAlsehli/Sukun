import { z } from 'zod';

// Task 4: GET /api/projects/{id}/units - project-wide unit list (RE3 tab 3).
// "occupancy" maps directly onto the existing UnitStatus enum values the
// frontend's filter chips already correspond to (الكل/مشغولة/شاغرة/محجوزة).
export const listProjectUnitsQuerySchema = z.object({
  buildingId: z.string().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  occupancy: z.enum(['ALL', 'OCCUPIED', 'AVAILABLE', 'RESERVED']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListProjectUnitsQueryDto = z.infer<typeof listProjectUnitsQuerySchema>;
