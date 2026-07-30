import { z } from 'zod';

const futureDate = z.coerce.date().refine(
  (date) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return date >= startOfToday;
  },
  { message: 'Visit date cannot be in the past' },
);

export const createVisitSchema = z.object({
  projectId: z.string().min(1),
  unitId: z.string().min(1),
  date: futureDate,
  time: z.string().min(1, 'Time is required'),
});
export type CreateVisitDto = z.infer<typeof createVisitSchema>;

// Task 6 (decisions.md G9): PATCH /api/visits/{id} - reschedule only (see
// decisions.md G9 for why confirm/cancel keep their existing endpoints).
export const rescheduleVisitSchema = z.object({
  date: futureDate,
  time: z.string().min(1, 'Time is required'),
});
export type RescheduleVisitDto = z.infer<typeof rescheduleVisitSchema>;

const photoSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentBase64: z.string().min(1).max(20_000_000),
});
export type PhotoUploadDto = z.infer<typeof photoSchema>;

// Task 6 (decisions.md G10): text and/or photo - at least one is required.
export const createVisitNoteSchema = z
  .object({
    text: z.string().min(1).optional(),
    photo: photoSchema.optional(),
  })
  .refine((data) => data.text !== undefined || data.photo !== undefined, {
    message: 'Either text or a photo is required',
  });
export type CreateVisitNoteDto = z.infer<typeof createVisitNoteSchema>;

export const createVisitIssueSchema = z.object({
  category: z.enum(['FINISHING', 'ELECTRICAL', 'PLUMBING', 'PLAN_MISMATCH', 'OTHER']),
  description: z.string().min(1).optional(),
  photo: photoSchema.optional(),
});
export type CreateVisitIssueDto = z.infer<typeof createVisitIssueSchema>;

// Task 6 (decisions.md G11): rating required, comment/suitability optional.
export const createVisitFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().min(1).optional(),
  suitability: z.enum(['YES', 'SOMEWHAT', 'NO']).optional(),
});
export type CreateVisitFeedbackDto = z.infer<typeof createVisitFeedbackSchema>;
