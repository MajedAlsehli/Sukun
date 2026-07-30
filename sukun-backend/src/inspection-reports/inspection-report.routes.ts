import { Router } from 'express';
import { inspectionReportController } from './inspection-report.controller';
import { validateBody } from '../shared/validateBody';
import { createInspectionReportSchema } from './inspection-report.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const inspectionReportRouter = Router();

// 14_Permissions_Matrix.md #INSPECTION: only a Home Seeker creates reports;
// a Homeowner keeps Read Only access to their pre-ownership history
// (00_Product_Foundation.md: "previous inspection history remains visible").
const homeSeekerOnly = requireRole(UserRole.HOME_SEEKER);
const canView = requireRole(UserRole.HOME_SEEKER, UserRole.HOMEOWNER);

inspectionReportRouter.use(authMiddleware);

/**
 * @openapi
 * /inspection-reports:
 *   post:
 *     tags: [InspectionReports]
 *     summary: Create an inspection report during a Checked-In visit
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [visitId, unitId, images, location]
 *             properties:
 *               visitId: { type: string }
 *               unitId: { type: string }
 *               images: { type: array, items: { type: string }, minItems: 1 }
 *               notes: { type: string }
 *               location: { type: string }
 *     responses:
 *       201: { description: Report created, AI processing started }
 *       409: { description: VISIT_NOT_CHECKED_IN or UNIT_VISIT_MISMATCH }
 */
inspectionReportRouter.post(
  '/',
  homeSeekerOnly,
  validateBody(createInspectionReportSchema),
  asyncHandler(inspectionReportController.create),
);

/**
 * @openapi
 * /inspection-reports:
 *   get:
 *     tags: [InspectionReports]
 *     summary: List the current user's inspection reports
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Report list }
 */
inspectionReportRouter.get('/', canView, asyncHandler(inspectionReportController.list));

/**
 * @openapi
 * /inspection-reports/{id}:
 *   get:
 *     tags: [InspectionReports]
 *     summary: Get report details, AI analysis, and repair timeline (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Report details }
 *       404: { description: REPORT_NOT_FOUND }
 */
inspectionReportRouter.get('/:id', canView, asyncHandler(inspectionReportController.getById));
