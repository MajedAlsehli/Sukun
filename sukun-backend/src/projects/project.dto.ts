import { z } from 'zod';

// Task 4 (decisions.md E1/E4/E5): generation upper limits, chosen to prevent
// accidental huge generation while comfortably covering any real portfolio
// project. Enforced in project.service.ts#create, not just documented here.
export const MAX_BUILDINGS_PER_PROJECT = 50;
export const MAX_FLOORS_PER_BUILDING = 200;
export const MAX_UNITS_PER_FLOOR = 60;
export const MAX_TOTAL_UNITS_PER_PROJECT = 3000;

const unitGenerationSchema = z.object({
  perFloor: z.coerce.number().int().min(1).max(MAX_UNITS_PER_FLOOR).default(8),
  area: z.coerce.number().positive().default(140),
  beds: z.coerce.number().int().min(0).default(3),
  baths: z.coerce.number().int().min(0).default(2),
  parking: z.coerce.number().int().min(0).default(1),
  // Task 6 (decisions.md G4): optional, additive - `type` defaults to the
  // existing hardcoded 'RESIDENTIAL' when omitted (zero behavior change for
  // any existing caller/test); `price` has no default and stays null, same
  // as every other pre-Task-6 unit. Real (not fabricated) data path for
  // Discovery's price/unitType filters - see decisions.md G5.
  type: z.string().min(1).optional(),
  price: z.coerce.number().positive().optional(),
});

const buildingWizardSchema = z.object({
  name: z.string().min(1, 'Building name is required'),
  // Not required by RE2's spec (only اسم المبنى*/عدد الطوابق* are starred) -
  // auto-assigned sequentially server-side when omitted (project.service.ts).
  number: z.string().min(1).optional(),
  floors: z.coerce.number().int().min(1).max(MAX_FLOORS_PER_BUILDING),
  units: unitGenerationSchema.default({}),
});

// Task 4 (decisions.md E4): `code` is dropped - RE2's wizard never collects
// it, so the server generates a unique one instead of inventing a UI field.
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  city: z.string().min(1, 'City is required'),
  district: z.string().min(1).optional(),
  description: z.string().optional(),
  managerId: z.string().min(1, 'Project manager is required'),
  primaryContractorId: z.string().min(1, 'Primary contractor is required'),
  buildings: z.array(buildingWizardSchema).min(1, 'At least one building is required').max(MAX_BUILDINGS_PER_PROJECT),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

// code is intentionally not editable - treated as a stable business identifier (COM-006).
// managerId/primaryContractorId changes go through their own dedicated
// re-assignment path below (project.service.ts#reassignManager/#reassignContractor),
// not this general update, so history/eligibility can be checked per-field.
export const updateProjectSchema = z
  .object({
    name: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    district: z.string().min(1).optional(),
    description: z.string().optional(),
    // Task 6 (decisions.md G4): the minimal, additive path for a company to
    // set real (not fabricated) readiness/amenities data for Discovery/H4 -
    // no new endpoint, same partial-update shape and ownership/editability checks.
    readiness: z.enum(['READY', 'UNDER_CONSTRUCTION', 'OFF_PLAN']).optional(),
    amenities: z.array(z.string().min(1)).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field (name, city, district, description, readiness, amenities) must be provided',
  });
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

// Task 4 (decisions.md E1): now toggles the reversible `isActive` flag only -
// see project.types.ts#assertCanToggleActive. Archiving is a separate
// endpoint (PATCH /projects/{id}/archive).
export const updateProjectStatusSchema = z.object({
  active: z.boolean(),
});
export type UpdateProjectStatusDto = z.infer<typeof updateProjectStatusSchema>;

export const reassignManagerSchema = z.object({
  managerId: z.string().min(1, 'Project manager is required'),
});
export type ReassignManagerDto = z.infer<typeof reassignManagerSchema>;

export const reassignContractorSchema = z.object({
  primaryContractorId: z.string().min(1, 'Primary contractor is required'),
});
export type ReassignContractorDto = z.infer<typeof reassignContractorSchema>;

// Task 4 (decisions.md E7): JSON+base64, same shape/convention as
// files/file.dto.ts - RE2 spec restricts cover uploads to JPG/PNG.
export const uploadCoverSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png']),
  contentBase64: z.string().min(1).max(20_000_000),
});
export type UploadCoverDto = z.infer<typeof uploadCoverSchema>;

export const listProjectsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'mostReports']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListProjectsQueryDto = z.infer<typeof listProjectsQuerySchema>;
