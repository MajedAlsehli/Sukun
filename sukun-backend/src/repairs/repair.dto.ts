import { z } from 'zod';

export const assignRepairSchema = z.object({
  reportId: z.string().min(1),
  technicianId: z.string().min(1),
});
export type AssignRepairDto = z.infer<typeof assignRepairSchema>;

export const uploadRepairImagesSchema = z.object({
  images: z.array(z.string().min(1)).min(1, 'At least one image is required'),
});
export type UploadRepairImagesDto = z.infer<typeof uploadRepairImagesSchema>;

export const approveRepairSchema = z.object({
  approved: z.boolean(),
  reason: z.string().max(1000).optional(),
});
export type ApproveRepairDto = z.infer<typeof approveRepairSchema>;
