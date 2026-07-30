import { Router } from 'express';
import { z } from 'zod';
import { warrantyController } from './warranty.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import { createWarrantyReportSchema } from './warranty.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

// 14_Permissions_Matrix.md #WARRANTY: Homeowner only (Home Seeker is ❌).
const homeownerOnly = requireRole(UserRole.HOMEOWNER);

const warrantyQuerySchema = z.object({ unitId: z.string().min(1) });

// GET /api/warranty - "Returns Coverage, Expiration, Eligibility"
export const warrantyRouter = Router();
warrantyRouter.use(authMiddleware, homeownerOnly);

/**
 * @openapi
 * /warranty:
 *   get:
 *     tags: [Warranty]
 *     summary: Get warranty coverage, expiration, and eligibility for an owned unit - Task 7 (decisions.md H2) also returns overall daysRemaining and a 6-category coverage breakdown (categories[], each with covered/reasonCode/periodEndDate/daysRemaining), computed server-side and never client-overridable
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unitId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Warranty coverage details, overall status, and per-category breakdown }
 *       404: { description: WARRANTY_NOT_FOUND }
 */
warrantyRouter.get('/', validateQuery(warrantyQuerySchema), asyncHandler(warrantyController.getByUnit));

// /api/warranty-reports - the claims themselves
export const warrantyReportRouter = Router();
warrantyReportRouter.use(authMiddleware, homeownerOnly);

/**
 * @openapi
 * /warranty-reports:
 *   post:
 *     tags: [Warranty]
 *     summary: Create a warranty claim (Homeowner only, requires active ownership + non-expired warranty)
 *     deprecated: true
 *     description: >
 *       DEPRECATED - superseded by the canonical /api/reports domain
 *       (docs/integration/decisions.md I0 #8, I3). Kept working, unchanged, for
 *       backward compatibility; no screen in the product calls it. Existing rows
 *       are mirrored into canonical reports by the additive, idempotent
 *       `npm run task8:backfill-legacy-reports` script, which never modifies or
 *       deletes a WarrantyReport.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [unitId, category, location, images]
 *             properties:
 *               unitId: { type: string }
 *               category: { type: string }
 *               location: { type: string }
 *               images: { type: array, items: { type: string }, minItems: 1 }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Warranty report created, AI analysis started }
 *       409: { description: WARRANTY_EXPIRED or OVERLAPPING_WARRANTY_CLAIM }
 */
warrantyReportRouter.post(
  '/',
  validateBody(createWarrantyReportSchema),
  asyncHandler(warrantyController.createReport),
);

/**
 * @openapi
 * /warranty-reports:
 *   get:
 *     tags: [Warranty]
 *     summary: List the homeowner's warranty reports
 *     deprecated: true
 *     description: >
 *       DEPRECATED - superseded by the canonical /api/reports domain
 *       (docs/integration/decisions.md I0 #8, I3). Kept working, unchanged, for
 *       backward compatibility; no screen in the product calls it. Existing rows
 *       are mirrored into canonical reports by the additive, idempotent
 *       `npm run task8:backfill-legacy-reports` script, which never modifies or
 *       deletes a WarrantyReport.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Warranty report list }
 */
warrantyReportRouter.get('/', asyncHandler(warrantyController.listReports));

/**
 * @openapi
 * /warranty-reports/{id}:
 *   get:
 *     tags: [Warranty]
 *     summary: Get warranty report details (owner only)
 *     deprecated: true
 *     description: >
 *       DEPRECATED - superseded by the canonical /api/reports domain
 *       (docs/integration/decisions.md I0 #8, I3). Kept working, unchanged, for
 *       backward compatibility; no screen in the product calls it. Existing rows
 *       are mirrored into canonical reports by the additive, idempotent
 *       `npm run task8:backfill-legacy-reports` script, which never modifies or
 *       deletes a WarrantyReport.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Warranty report details }
 *       404: { description: WARRANTY_REPORT_NOT_FOUND }
 */
warrantyReportRouter.get('/:id', asyncHandler(warrantyController.getReportById));
