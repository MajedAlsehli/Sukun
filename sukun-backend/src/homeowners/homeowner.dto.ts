import { z } from 'zod';
import { passwordSchema } from '../auth/auth.dto';

// Task 5 (decisions.md F1): nationalId is never editable after creation (no
// update schema below accepts it).
//
// Pre-event change: it is no longer collected in any end-user journey, so it is
// OPTIONAL here. The column stays `String? @unique` in Prisma and every value
// already stored is preserved untouched. What must NOT happen — and is what the
// `.optional()` below buys — is a client sending `""` or a fabricated number
// just to satisfy a required field: an omitted key stays `undefined` all the way
// down, and `homeowner.service.ts#register` runs the uniqueness and
// identity-conflict checks ONLY when a real value is supplied.
//
// `.trim().min(1)` rejects a whitespace-only string rather than storing it, so
// "absent" has exactly one representation (`undefined`) instead of three.
export const createHomeownerSchema = z.object({
  name: z.string().min(1),
  nationalId: z.string().trim().min(1, 'National ID must not be blank').optional(),
  email: z.string().email(),
  phone: z.string().min(6),
  unitId: z.string().min(1),
});
export type CreateHomeownerDto = z.infer<typeof createHomeownerSchema>;

// Decision 013: customer creates a password as part of the same activation
// step that redeems the QR/Activation Code - no separate endpoint exists.
export const activateHomeownerSchema = z.object({
  code: z.string().min(1),
  password: passwordSchema,
});
export type ActivateHomeownerDto = z.infer<typeof activateHomeownerSchema>;

// Task 5 (RE4): profile-edit is deliberately narrow - mobile + email only.
// nationalId/project/building/unit have no path in this schema at all
// (unit changes exclusively via POST /:id/transfer - decisions.md F1/F7).
export const updateHomeownerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    message: 'At least one field (email, phone) must be provided',
  });
export type UpdateHomeownerDto = z.infer<typeof updateHomeownerSchema>;

export const transferHomeownerSchema = z.object({
  unitId: z.string().min(1, 'Target unit is required'),
});
export type TransferHomeownerDto = z.infer<typeof transferHomeownerSchema>;

// Same {active} shape as projects/buildings (decisions.md E1) - reused here
// for API consistency (decisions.md F8).
export const updateHomeownerStatusSchema = z.object({
  active: z.boolean(),
});
export type UpdateHomeownerStatusDto = z.infer<typeof updateHomeownerStatusSchema>;

export const listHomeownersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'NOT_ACTIVATED', 'DEACTIVATED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListHomeownersQueryDto = z.infer<typeof listHomeownersQuerySchema>;

export const exportHomeownersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'NOT_ACTIVATED', 'DEACTIVATED']).optional(),
});
export type ExportHomeownersQueryDto = z.infer<typeof exportHomeownersQuerySchema>;
