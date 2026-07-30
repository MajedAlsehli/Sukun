import { z } from 'zod';
import { ReportPriority, ReportStatus } from '@prisma/client';
import {
  ALLOWED_REPORT_MEDIA_MIME_TYPES,
  MAX_AFTER_PHOTOS,
  MAX_HOMEOWNER_PHOTOS,
  MIN_AFTER_PHOTOS,
  MIN_HOMEOWNER_PHOTOS,
} from './report-media-storage';
import { REPORT_CATEGORIES } from './report.types';

// ---------------------------------------------------------------------------
// Task 8 request schemas.
//
// Note what is ABSENT, deliberately (decisions.md I4/I6/I8/I12):
//   * no `technicianId` anywhere            - routing is automatic, full stop
//   * no `warrantyVerdict` anywhere         - the server computes and snapshots it
//   * no `status` anywhere                  - no arbitrary status PATCH exists
//   * no `unitId`/`projectId` on create     - resolved from the active ownership
//   * no AI fields on create                - only an opaque `analysisId`
// There is therefore nothing for the server to "ignore"; the fields simply
// cannot be expressed.
// ---------------------------------------------------------------------------

const categoryEnum = z.enum(REPORT_CATEGORIES as [string, ...string[]]);

export const uploadReportMediaSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_REPORT_MEDIA_MIME_TYPES),
  // ~8MB decoded; the real size/type/magic-number checks live in
  // decodeAndValidateImage so they apply on every path, not just this one.
  contentBase64: z.string().min(1).max(12_000_000),
});
export type UploadReportMediaDto = z.infer<typeof uploadReportMediaSchema>;

const mediaKeysSchema = z
  .array(z.string().min(1).max(300))
  .min(MIN_HOMEOWNER_PHOTOS, `At least ${MIN_HOMEOWNER_PHOTOS} photo is required`)
  .max(MAX_HOMEOWNER_PHOTOS, `At most ${MAX_HOMEOWNER_PHOTOS} photos are allowed`);

export const analyzeReportSchema = z.object({
  mediaKeys: mediaKeysSchema,
  note: z.string().trim().max(1000).optional(),
});
export type AnalyzeReportDto = z.infer<typeof analyzeReportSchema>;

export const warrantyCheckSchema = z.object({
  category: categoryEnum,
});
export type WarrantyCheckDto = z.infer<typeof warrantyCheckSchema>;

export const createReportSchema = z.object({
  mediaKeys: mediaKeysSchema,
  /** The user-confirmed category (H8's "نعم، صحيح" or its correction). */
  category: categoryEnum,
  problemText: z.string().trim().min(3, 'A problem description is required').max(400),
  note: z.string().trim().max(1000).optional(),
  /** Opaque id of a prior POST /reports/analyze result. Absent = manual entry. */
  analysisId: z.string().uuid().optional(),
  /** Whether the homeowner accepted the AI category as-is, for the audit record. */
  categoryConfirmedByUser: z.boolean().optional(),
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const submitRepairSchema = z.object({
  afterPhotos: z
    .array(uploadReportMediaSchema)
    .min(MIN_AFTER_PHOTOS, 'At least one after-repair photo is required')
    .max(MAX_AFTER_PHOTOS),
  note: z.string().trim().max(1000).optional(),
});
export type SubmitRepairDto = z.infer<typeof submitRepairSchema>;

export const startRepairSchema = z.object({
  beforePhotos: z.array(uploadReportMediaSchema).max(MAX_AFTER_PHOTOS).optional(),
});
export type StartRepairDto = z.infer<typeof startRepairSchema>;

export const approveReportSchema = z.object({
  // H9's rating card disables submit at rating === 0, and RE5/C3/PM3
  // statistics read these rows - so the API requires it too (decisions.md I13).
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type ApproveReportDto = z.infer<typeof approveReportSchema>;

export const reopenReportSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to reopen a report').max(1000),
});
export type ReopenReportDto = z.infer<typeof reopenReportSchema>;

const statusList = Object.values(ReportStatus) as [string, ...string[]];
const priorityList = Object.values(ReportPriority) as [string, ...string[]];

export const listReportsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  homeownerId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  /** Repeatable or comma-separated. Always intersected with the role scope. */
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const raw = Array.isArray(value) ? value : value.split(',');
      return raw.map((v) => v.trim()).filter(Boolean);
    })
    .pipe(z.array(z.enum(statusList)).optional()),
  /**
   * Task 9 (decisions.md J8): added to the ONE canonical filter set rather than
   * implemented a second time behind /api/pm/reports. PM1 shows a priority
   * filter; RE3/PM2 legitimately want the same one.
   */
  priority: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const raw = Array.isArray(value) ? value : value.split(',');
      return raw.map((v) => v.trim()).filter(Boolean);
    })
    .pipe(z.array(z.enum(priorityList)).optional()),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReportsQueryDto = z.infer<typeof listReportsQuerySchema>;

export const listRepairHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRepairHistoryQueryDto = z.infer<typeof listRepairHistoryQuerySchema>;

export const listTechnicianTasksQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const raw = Array.isArray(value) ? value : value.split(',');
      return raw.map((v) => v.trim()).filter(Boolean);
    })
    .pipe(z.array(z.enum(statusList)).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTechnicianTasksQueryDto = z.infer<typeof listTechnicianTasksQuerySchema>;
