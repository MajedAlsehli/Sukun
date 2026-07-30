import { Router } from 'express';
import { repairController } from './repair.controller';
import { validateBody } from '../shared/validateBody';
import { approveRepairSchema, assignRepairSchema, uploadRepairImagesSchema } from './repair.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const repairRouter = Router();
repairRouter.use(authMiddleware);

const pmOnly = requireRole(UserRole.PROJECT_MANAGER);
const technicianOnly = requireRole(UserRole.TECHNICIAN);
const homeSeekerOnly = requireRole(UserRole.HOME_SEEKER);

/**
 * @openapi
 * /repairs:
 *   post:
 *     tags: [Repairs]
 *     summary: Assign a technician to an AI-analyzed inspection report (Project Manager only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportId, technicianId]
 *             properties:
 *               reportId: { type: string }
 *               technicianId: { type: string }
 *     responses:
 *       201: { description: Repair assigned }
 */
repairRouter.post('/', pmOnly, validateBody(assignRepairSchema), asyncHandler(repairController.assign));

/**
 * @openapi
 * /repairs/{id}/start:
 *   post:
 *     tags: [Repairs]
 *     summary: Technician starts an assigned repair
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Repair started }
 */
repairRouter.post('/:id/start', technicianOnly, asyncHandler(repairController.start));

/**
 * @openapi
 * /repairs/{id}/before-images:
 *   post:
 *     tags: [Repairs]
 *     summary: Upload before-repair images (REP-003 - mandatory before completion)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images: { type: array, items: { type: string }, minItems: 1 }
 *     responses:
 *       200: { description: Images attached }
 */
repairRouter.post(
  '/:id/before-images',
  technicianOnly,
  validateBody(uploadRepairImagesSchema),
  asyncHandler(repairController.uploadBeforeImages),
);

/**
 * @openapi
 * /repairs/{id}/after-images:
 *   post:
 *     tags: [Repairs]
 *     summary: Upload after-repair images (REP-004 - mandatory before completion)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images: { type: array, items: { type: string }, minItems: 1 }
 *     responses:
 *       200: { description: Images attached }
 */
repairRouter.post(
  '/:id/after-images',
  technicianOnly,
  validateBody(uploadRepairImagesSchema),
  asyncHandler(repairController.uploadAfterImages),
);

/**
 * @openapi
 * /repairs/{id}/complete:
 *   post:
 *     tags: [Repairs]
 *     summary: Mark repair complete - starts AI validation (REP-005/006)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Repair submitted for validation }
 *       409: { description: MISSING_BEFORE_IMAGES or MISSING_AFTER_IMAGES }
 */
repairRouter.post('/:id/complete', technicianOnly, asyncHandler(repairController.complete));

/**
 * @openapi
 * /repairs/{id}/approve:
 *   post:
 *     tags: [Repairs]
 *     summary: Home Seeker approves or rejects a completed repair (Flow 7 - creator only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approved]
 *             properties:
 *               approved: { type: boolean }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Repair approved or sent back to the technician }
 */
repairRouter.post(
  '/:id/approve',
  homeSeekerOnly,
  validateBody(approveRepairSchema),
  asyncHandler(repairController.approve),
);
