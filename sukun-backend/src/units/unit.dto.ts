import { z } from 'zod';

export const createUnitSchema = z.object({
  number: z.string().min(1, 'Unit number is required'),
  floor: z.coerce.number().int(),
  type: z.string().min(1, 'Unit type is required'),
});
export type CreateUnitDto = z.infer<typeof createUnitSchema>;

// Task 5: RE4 wizard step 2's vacant-unit picker.
export const listVacantUnitsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  buildingId: z.string().min(1).optional(),
});
export type ListVacantUnitsQueryDto = z.infer<typeof listVacantUnitsQuerySchema>;

export const updateUnitSchema = z
  .object({
    number: z.string().min(1).optional(),
    floor: z.coerce.number().int().optional(),
    type: z.string().min(1).optional(),
  })
  .refine((data) => data.number !== undefined || data.floor !== undefined || data.type !== undefined, {
    message: 'At least one field (number, floor, type) must be provided',
  });
export type UpdateUnitDto = z.infer<typeof updateUnitSchema>;
