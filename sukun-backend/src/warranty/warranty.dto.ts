import { z } from 'zod';

export const createWarrantyReportSchema = z.object({
  unitId: z.string().min(1),
  category: z.string().min(1, 'Category is required'),
  location: z.string().min(1, 'Location is required'),
  // WAR-018: minimum one image.
  images: z.array(z.string().min(1)).min(1, 'At least one image is required'),
  notes: z.string().max(2000).optional(),
});
export type CreateWarrantyReportDto = z.infer<typeof createWarrantyReportSchema>;

// WAITING_HOMEOWNER -> CLOSED (approved) or REJECTED (still broken), per the
// existing FORWARD_TRANSITIONS table in warranty.types.ts - that transition
// was already modeled but had no endpoint calling it.
export const respondToWarrantyReportSchema = z.object({
  approved: z.boolean(),
});
export type RespondToWarrantyReportDto = z.infer<typeof respondToWarrantyReportSchema>;
