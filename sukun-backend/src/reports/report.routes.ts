import { Router } from 'express';
import { reportController } from './report.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';
import { aiRateLimiter } from '../shared/rateLimit.middleware';
import {
  analyzeReportSchema,
  approveReportSchema,
  createReportSchema,
  listRepairHistoryQuerySchema,
  listReportsQuerySchema,
  listTechnicianTasksQuerySchema,
  reopenReportSchema,
  startRepairSchema,
  submitRepairSchema,
  uploadReportMediaSchema,
  warrantyCheckSchema,
} from './report.dto';

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I0 #10): /api/reports/* is the
// CANONICAL report API for H8, H9, C1, C2, C3, PM2 and every other report
// reference in the product.
//
// Note what does not exist here, and must never be added:
//   * no assignment endpoint of any kind (routing is automatic - I8/B2)
//   * no PATCH .../status (each transition has its own validated endpoint - I2)
//   * no DELETE (A7: a report and its timeline are never deleted)
//   * no mutating endpoint that admits PROJECT_MANAGER or COMPANY (I12)
// ---------------------------------------------------------------------------

export const reportRouter = Router();

const homeownerOnly = requireRole(UserRole.HOMEOWNER);
const technicianOnly = requireRole(UserRole.TECHNICIAN);
const canReadReports = requireRole(
  UserRole.HOMEOWNER,
  UserRole.TECHNICIAN,
  UserRole.PROJECT_MANAGER,
  UserRole.COMPANY,
);

/**
 * @openapi
 * /reports/routing/retry:
 *   post:
 *     tags: [Reports]
 *     summary: Re-run automatic routing for every ROUTING_PENDING report (protected, cron-suitable - decisions.md I9)
 *     description: >
 *       Authenticated by the ROUTING_RETRY_SECRET shared secret
 *       (`Authorization: Bearer <secret>` or `x-routing-retry-secret`), NOT by a
 *       user session - no ordinary user can invoke it. Returns
 *       503 ROUTING_RETRY_NOT_CONFIGURED when the secret is unset, so the route
 *       is never open. Idempotent and concurrent-safe: only reports still in
 *       ROUTING_PENDING are touched, and each assignment re-asserts that status
 *       inside its own transaction, so a re-run assigns nothing twice.
 *       Task 10 ships the Vercel Cron schedule (every 15 minutes, vercel.json);
 *       it does nothing until ROUTING_RETRY_SECRET is genuinely configured.
 *     responses:
 *       200: { description: Retry sweep completed }
 *       401: { description: INVALID_TOKEN }
 *       503: { description: ROUTING_RETRY_NOT_CONFIGURED }
 */
// Registered BEFORE `authMiddleware` is applied to the router: this endpoint
// authenticates with a machine secret, not a user JWT.
reportRouter.post('/routing/retry', asyncHandler(reportController.retryRouting));

reportRouter.use(authMiddleware);

/**
 * @openapi
 * /reports/providers:
 *   get:
 *     tags: [Reports]
 *     summary: Honest availability of the AI analysis, object-detection, and media-storage providers
 *     description: >
 *       Booleans only - no provider key or URL is ever returned. `objectDetection.available`
 *       is false unless a real, separately deployed YOLO inference service with
 *       custom-trained defect weights is configured (decisions.md I7);
 *       `media.durable` is false unless Supabase Storage is configured (I11).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Provider availability }
 */
reportRouter.get('/providers', canReadReports, asyncHandler(reportController.providers));

/**
 * @openapi
 * /reports/media:
 *   post:
 *     tags: [Reports]
 *     summary: Stage one report photo (Homeowner only) - H8's real upload step
 *     description: >
 *       Validates MIME type, decoded size, and the file's magic number, then
 *       stores it under a server-derived key in the requester's own staging
 *       namespace. Returns REPORT_MEDIA_STORAGE_NOT_CONFIGURED when durable
 *       storage is unavailable - never a fake URL.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileName, mimeType, contentBase64]
 *             properties:
 *               fileName: { type: string }
 *               mimeType: { type: string, enum: [image/jpeg, image/png, image/webp] }
 *               contentBase64: { type: string }
 *     responses:
 *       201: { description: Photo staged }
 *       400: { description: VALIDATION_ERROR }
 *       409: { description: REPORT_MEDIA_STORAGE_NOT_CONFIGURED or NO_ACTIVE_OWNERSHIP }
 */
reportRouter.post(
  '/media',
  homeownerOnly,
  validateBody(uploadReportMediaSchema),
  asyncHandler(reportController.uploadMedia),
);

/**
 * @openapi
 * /reports/analyze:
 *   post:
 *     tags: [Reports]
 *     summary: Analyze staged photos with AI (Homeowner only) - advisory, creates nothing
 *     description: >
 *       Returns a suggested category, problem text, priority, confidence, and
 *       explanation, plus an opaque `analysisId` that POST /reports consumes.
 *       The AI never mutates a report, a status, a warranty verdict, or an
 *       assignment (decisions.md I6). Responds AI_ANALYSIS_UNAVAILABLE when no
 *       provider is configured or the call fails, and AI_ANALYSIS_INVALID when
 *       the model returns something the server enums cannot accept - never a
 *       fabricated result.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mediaKeys]
 *             properties:
 *               mediaKeys: { type: array, items: { type: string }, minItems: 1, maxItems: 10 }
 *               note: { type: string }
 *     responses:
 *       200: { description: Analysis result }
 *       409: { description: AI_ANALYSIS_UNAVAILABLE or AI_ANALYSIS_INVALID }
 */
reportRouter.post(
  '/analyze',
  homeownerOnly,
  aiRateLimiter,
  validateBody(analyzeReportSchema),
  asyncHandler(reportController.analyze),
);

/**
 * @openapi
 * /reports/warranty-check:
 *   post:
 *     tags: [Reports]
 *     summary: Preview the warranty verdict for a category (Homeowner only) - NON-authoritative
 *     description: >
 *       H8's verification step. The result is a preview and is discarded;
 *       POST /reports always recomputes and snapshots the real verdict
 *       server-side (decisions.md I4). A client-supplied verdict is never
 *       accepted anywhere.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category: { type: string, enum: [PLUMBING, ELECTRICAL, CRACKS, PAINT, DOORS, WINDOWS, FLOORING, CEILINGS, OTHER] }
 *     responses:
 *       200: { description: Warranty preview }
 */
reportRouter.post(
  '/warranty-check',
  homeownerOnly,
  validateBody(warrantyCheckSchema),
  asyncHandler(reportController.warrantyCheck),
);

/**
 * @openapi
 * /reports:
 *   post:
 *     tags: [Reports]
 *     summary: File a canonical post-ownership report (Homeowner only)
 *     description: >
 *       Resolves the requester's active ownership server-side, snapshots the
 *       warranty verdict, and routes automatically - all in one transaction.
 *       The body carries NO technician, NO unit/project, NO status, and NO
 *       warranty verdict: those cannot be expressed, let alone supplied.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mediaKeys, category, problemText]
 *             properties:
 *               mediaKeys: { type: array, items: { type: string }, minItems: 1, maxItems: 10 }
 *               category: { type: string }
 *               problemText: { type: string }
 *               note: { type: string }
 *               analysisId: { type: string, format: uuid }
 *               categoryConfirmedByUser: { type: boolean }
 *     responses:
 *       201: { description: Report created (routed, or ROUTING_PENDING when no technician is eligible) }
 *       409: { description: NO_ACTIVE_OWNERSHIP, ANALYSIS_ALREADY_USED, or ANALYSIS_MEDIA_MISMATCH }
 *   get:
 *     tags: [Reports]
 *     summary: List reports, always scoped to the caller's role
 *     description: >
 *       Homeowner sees only their own; technician only their assigned; PM only
 *       their one project (read-only); company only their own company. Client
 *       filters are intersected with that scope and can never widen it
 *       (decisions.md I12).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: projectId, schema: { type: string } }
 *       - { in: query, name: unitId, schema: { type: string } }
 *       - { in: query, name: homeownerId, schema: { type: string } }
 *       - { in: query, name: technicianId, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string }, description: "Repeatable or comma-separated" }
 *       - { in: query, name: q, schema: { type: string }, description: "Report number (with or without #) or problem text" }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Paginated, role-scoped report list }
 */
reportRouter.post('/', homeownerOnly, validateBody(createReportSchema), asyncHandler(reportController.create));
reportRouter.get('/', canReadReports, validateQuery(listReportsQuerySchema), asyncHandler(reportController.list));

/**
 * @openapi
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Get one report (canonical detail for H9, C2, PM2, and the company view)
 *     description: >
 *       One shape for every role; what differs is what the server puts in it.
 *       A report outside the caller's scope returns 404, never 403, so its
 *       existence is not disclosed.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Report detail }
 *       404: { description: REPORT_NOT_FOUND }
 */
reportRouter.get('/:id', canReadReports, asyncHandler(reportController.getById));

/**
 * @openapi
 * /reports/{id}/timeline:
 *   get:
 *     tags: [Reports]
 *     summary: Append-only timeline for one report
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Chronological, append-only event list }
 *       404: { description: REPORT_NOT_FOUND }
 */
reportRouter.get('/:id/timeline', canReadReports, asyncHandler(reportController.getTimeline));

/**
 * @openapi
 * /reports/{id}/start:
 *   post:
 *     tags: [Reports]
 *     summary: Assigned technician starts (or resumes a reopened) repair
 *     description: >
 *       Technician only, assignee only. Enforces the single-active-repair rule -
 *       a second concurrent start returns 409 ACTIVE_REPAIR_EXISTS carrying the
 *       blocking report's id/number (C1 renders it). Optional before-photos may
 *       be attached here.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Repair started }
 *       404: { description: REPORT_NOT_FOUND (also returned for another technician's report) }
 *       409: { description: ACTIVE_REPAIR_EXISTS or INVALID_REPORT_STATUS_TRANSITION }
 */
reportRouter.post(
  '/:id/start',
  technicianOnly,
  validateBody(startRepairSchema),
  asyncHandler(reportController.start),
);

/**
 * @openapi
 * /reports/{id}/submit-repair:
 *   post:
 *     tags: [Reports]
 *     summary: Assigned technician submits the completed repair (at least one after-photo required)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [afterPhotos]
 *             properties:
 *               afterPhotos:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [fileName, mimeType, contentBase64]
 *                   properties:
 *                     fileName: { type: string }
 *                     mimeType: { type: string, enum: [image/jpeg, image/png, image/webp] }
 *                     contentBase64: { type: string }
 *               note: { type: string }
 *     responses:
 *       200: { description: Repair submitted, report now AWAITING_OWNER_APPROVAL }
 *       400: { description: VALIDATION_ERROR (missing/invalid after-photo) }
 *       409: { description: INVALID_REPORT_STATUS_TRANSITION or REPORT_MEDIA_STORAGE_NOT_CONFIGURED }
 */
reportRouter.post(
  '/:id/submit-repair',
  technicianOnly,
  validateBody(submitRepairSchema),
  asyncHandler(reportController.submitRepair),
);

/**
 * @openapi
 * /reports/{id}/approve:
 *   post:
 *     tags: [Reports]
 *     summary: The report's homeowner approves the repair and rates it (closes the report)
 *     description: >
 *       Homeowner only, and only the report's own homeowner. A rating (1-5) is
 *       required - H9's own flow leads straight from approval into the rating
 *       card, and RE5/C3/PM3 statistics read these rows (decisions.md I13).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       200: { description: Report closed and reviewed }
 *       404: { description: REPORT_NOT_FOUND (also returned for another homeowner's report) }
 *       409: { description: INVALID_REPORT_STATUS_TRANSITION }
 */
reportRouter.post(
  '/:id/approve',
  homeownerOnly,
  validateBody(approveReportSchema),
  asyncHandler(reportController.approve),
);

/**
 * @openapi
 * /reports/{id}/reopen:
 *   post:
 *     tags: [Reports]
 *     summary: The report's homeowner reopens the repair (reason required)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 3 }
 *     responses:
 *       200: { description: Report reopened, back to IN_PROGRESS }
 *       400: { description: VALIDATION_ERROR (missing reason) }
 *       409: { description: INVALID_REPORT_STATUS_TRANSITION }
 */
reportRouter.post(
  '/:id/reopen',
  homeownerOnly,
  validateBody(reopenReportSchema),
  asyncHandler(reportController.reopen),
);

// ---------------------------------------------------------------------------
// Technician self-service (C1/C3), mounted at /api/technician/*
// ---------------------------------------------------------------------------

export const technicianTaskRouter = Router();
technicianTaskRouter.use(authMiddleware, requireRole(UserRole.TECHNICIAN));

/**
 * @openapi
 * /technician/tasks:
 *   get:
 *     tags: [Reports]
 *     summary: The authenticated technician's own task queue (C1)
 *     description: >
 *       Assigned reports only - there is no self-assignment and no way to see
 *       or claim another technician's work. Ordered by priority, then age.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string }, description: "Repeatable or comma-separated" }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Task queue }
 */
technicianTaskRouter.get(
  '/tasks',
  validateQuery(listTechnicianTasksQuerySchema),
  asyncHandler(reportController.technicianTasks),
);

/**
 * @openapi
 * /technician/tasks/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Real counts for C1's summary strip, plus the current active repair (if any)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Task summary }
 */
technicianTaskRouter.get('/tasks/summary', asyncHandler(reportController.technicianTaskSummary));

/**
 * @openapi
 * /technician/repairs/history:
 *   get:
 *     tags: [Reports]
 *     summary: The technician's approved/closed repairs with real durations and homeowner reviews (C3)
 *     description: Read-only. Only APPROVED repairs appear; statistics are real aggregates, never fabricated totals.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Repair history }
 */
technicianTaskRouter.get(
  '/repairs/history',
  validateQuery(listRepairHistoryQuerySchema),
  asyncHandler(reportController.technicianRepairHistory),
);
