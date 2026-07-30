import { z } from 'zod';

// RE5 wizard step 2's 5 fixed tiles - kept as free text in the schema (see
// decisions.md F2), but the create/edit DTOs constrain to exactly these 5
// values since that's all the UI ever offers.
export const SPECIALTIES = ['كهرباء', 'سباكة', 'تكييف وتبريد', 'دهان', 'صيانة عامة'] as const;

// Flow 11 (Register Technician): Company provides technician info + assigns
// a project. No separate activation/QR flow is documented for Technicians
// (unlike Homeowner's Decision 013/014) - a temporary password is generated
// and real delivery is deferred to Task 012 (Notifications).
export const registerTechnicianSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(6),
  projectId: z.string().min(1),
  specialty: z.enum(SPECIALTIES),
});
export type RegisterTechnicianDto = z.infer<typeof registerTechnicianSchema>;

// Self-service status update (GET/PATCH /technicians/me...). INACTIVE is
// deliberately excluded here - deactivating a technician reads as a Company
// action, not self-service (see the Company-side /:id/status route below).
export const updateOwnStatusSchema = z.object({
  status: z.enum(['ACTIVATED', 'AVAILABLE', 'BUSY']),
});
export type UpdateOwnStatusDto = z.infer<typeof updateOwnStatusSchema>;

// Task 5 (RE5): profile-edit is mobile/email/specialty only. Name and
// project have no path in this schema at all (project changes exclusively
// via POST /:id/transfer).
export const updateTechnicianSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    specialty: z.enum(SPECIALTIES).optional(),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined || data.specialty !== undefined, {
    message: 'At least one field (email, phone, specialty) must be provided',
  });
export type UpdateTechnicianDto = z.infer<typeof updateTechnicianSchema>;

export const transferTechnicianSchema = z.object({
  projectId: z.string().min(1, 'Target project is required'),
});
export type TransferTechnicianDto = z.infer<typeof transferTechnicianSchema>;

// Same {active} shape as projects/buildings/homeowners for API consistency.
export const updateTechnicianStatusSchema = z.object({
  active: z.boolean(),
});
export type UpdateTechnicianStatusDto = z.infer<typeof updateTechnicianStatusSchema>;

// Task 5 (decisions.md F11): projectId becomes optional - omitted means
// company-wide (RE5); provided still narrows to one project exactly as
// before.
export const listTechniciansQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  status: z.enum(['INVITED', 'ACTIVATED', 'AVAILABLE', 'BUSY', 'INACTIVE']).optional(),
  sort: z.enum(['newest', 'name', 'rating', 'completed']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTechniciansQueryDto = z.infer<typeof listTechniciansQuerySchema>;
