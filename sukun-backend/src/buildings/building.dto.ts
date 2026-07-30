import { z } from 'zod';

export const createBuildingSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  number: z.string().min(1, 'Building number is required'),
});
export type CreateBuildingDto = z.infer<typeof createBuildingSchema>;

export const updateBuildingSchema = z
  .object({
    name: z.string().min(1).optional(),
    number: z.string().min(1).optional(),
    // Task 4: RE3's inline building-edit card also edits floors (decisions.md
    // E5) - editing this never touches existing units (no regeneration).
    floors: z.coerce.number().int().min(1).optional(),
  })
  .refine((data) => data.name !== undefined || data.number !== undefined || data.floors !== undefined, {
    message: 'At least one field (name, number, floors) must be provided',
  });
export type UpdateBuildingDto = z.infer<typeof updateBuildingSchema>;

// Replaces the forbidden `DELETE /buildings/{id}` (D5/A7 - no-delete rule).
// Same semantics as project.dto.ts's updateProjectStatusSchema.
export const updateBuildingStatusSchema = z.object({
  active: z.boolean(),
});
export type UpdateBuildingStatusDto = z.infer<typeof updateBuildingStatusSchema>;
