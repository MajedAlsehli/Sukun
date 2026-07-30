import { z } from 'zod';

export const createInspectionReportSchema = z.object({
  visitId: z.string().min(1),
  unitId: z.string().min(1),
  // INS-001: at least one image required.
  images: z.array(z.string().min(1)).min(1, 'At least one image is required'),
  notes: z.string().max(2000).optional(),
  // INS-024: location inside the unit is mandatory.
  location: z.string().min(1, 'Location is required'),
});
export type CreateInspectionReportDto = z.infer<typeof createInspectionReportSchema>;
