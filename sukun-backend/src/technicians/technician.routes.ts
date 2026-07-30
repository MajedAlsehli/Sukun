import { Router } from 'express';
import { technicianController } from './technician.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import {
  listTechniciansQuerySchema,
  registerTechnicianSchema,
  transferTechnicianSchema,
  updateOwnStatusSchema,
  updateTechnicianSchema,
  updateTechnicianStatusSchema,
} from './technician.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const technicianRouter = Router();

// 14_Permissions_Matrix.md #COMPANY: Company only, EXCEPT /me... below, which
// is Technician-only self-service - no longer a blanket companyOnly gate.
const companyOnly = requireRole(UserRole.COMPANY);
const technicianOnly = requireRole(UserRole.TECHNICIAN);
technicianRouter.use(authMiddleware);

/**
 * @openapi
 * /technicians/me:
 *   get:
 *     tags: [Technicians]
 *     summary: Get the authenticated technician's own profile (Technician only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Own technician profile }
 *       404: { description: TECHNICIAN_NOT_FOUND }
 */
technicianRouter.get('/me', technicianOnly, asyncHandler(technicianController.getMe));

/**
 * @openapi
 * /technicians/me/status:
 *   patch:
 *     tags: [Technicians]
 *     summary: Self-service status update (Technician only) - ACTIVATED/AVAILABLE/BUSY only
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVATED, AVAILABLE, BUSY] }
 *     responses:
 *       200: { description: Status updated }
 *       409: { description: INVALID_STATUS_TRANSITION }
 */
technicianRouter.patch(
  '/me/status',
  technicianOnly,
  validateBody(updateOwnStatusSchema),
  asyncHandler(technicianController.updateMyStatus),
);

/**
 * @openapi
 * /technicians:
 *   post:
 *     tags: [Technicians]
 *     summary: Register a technician for one of the company's projects (Company only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, projectId]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               projectId: { type: string }
 *     responses:
 *       201: { description: Technician registered }
 */
technicianRouter.post(
  '/',
  companyOnly,
  validateBody(registerTechnicianSchema),
  asyncHandler(technicianController.register),
);

/**
 * @openapi
 * /technicians:
 *   get:
 *     tags: [Technicians]
 *     summary: List technicians (Company only) - company-wide by default; projectId narrows to one project
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [INVITED, ACTIVATED, AVAILABLE, BUSY, INACTIVE] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, name, rating, completed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Technician list }
 */
technicianRouter.get(
  '/',
  companyOnly,
  validateQuery(listTechniciansQuerySchema),
  asyncHandler(technicianController.list),
);

/**
 * @openapi
 * /technicians/summary:
 *   get:
 *     tags: [Technicians]
 *     summary: Company-wide technician KPI summary (Company only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Technician summary }
 */
technicianRouter.get('/summary', companyOnly, asyncHandler(technicianController.summary));

/**
 * @openapi
 * /technicians/{id}:
 *   get:
 *     tags: [Technicians]
 *     summary: Get technician profile, performance, and assigned repairs (Company only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Technician profile }
 *       404: { description: TECHNICIAN_NOT_FOUND }
 */
technicianRouter.get('/:id', companyOnly, asyncHandler(technicianController.getById));

/**
 * @openapi
 * /technicians/{id}:
 *   patch:
 *     tags: [Technicians]
 *     summary: Edit a technician's mobile/email/specialty (Company only)
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
 *             properties:
 *               email: { type: string }
 *               phone: { type: string }
 *               specialty: { type: string }
 *     responses:
 *       200: { description: Technician updated }
 */
technicianRouter.patch(
  '/:id',
  companyOnly,
  validateBody(updateTechnicianSchema),
  asyncHandler(technicianController.update),
);

/**
 * @openapi
 * /technicians/{id}/resend-invitation:
 *   post:
 *     tags: [Technicians]
 *     summary: Resend an outstanding activation invitation (Company only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invitation resent }
 *       409: { description: ALREADY_ACTIVATED }
 */
technicianRouter.post(
  '/:id/resend-invitation',
  companyOnly,
  asyncHandler(technicianController.resendInvitation),
);

/**
 * @openapi
 * /technicians/{id}/transfer:
 *   post:
 *     tags: [Technicians]
 *     summary: Transfer a technician to a different project (Company only)
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
 *             required: [projectId]
 *             properties:
 *               projectId: { type: string }
 *     responses:
 *       200: { description: Technician transferred }
 *       409: { description: TECHNICIAN_HAS_ACTIVE_REPAIR }
 */
technicianRouter.post(
  '/:id/transfer',
  companyOnly,
  validateBody(transferTechnicianSchema),
  asyncHandler(technicianController.transfer),
);

/**
 * @openapi
 * /technicians/{id}/status:
 *   patch:
 *     tags: [Technicians]
 *     summary: Temporarily deactivate/reactivate a technician (Company only)
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
 *             required: [active]
 *             properties:
 *               active: { type: boolean }
 *     responses:
 *       200: { description: Status updated }
 *       409: { description: TECHNICIAN_HAS_ACTIVE_REPAIR }
 */
technicianRouter.patch(
  '/:id/status',
  companyOnly,
  validateBody(updateTechnicianStatusSchema),
  asyncHandler(technicianController.setStatus),
);

/**
 * @openapi
 * /technicians/{id}/reviews:
 *   get:
 *     tags: [Technicians]
 *     summary: Technician reviews (Company only) - honest empty boundary, no review model exists yet
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reviews (currently always empty) }
 */
technicianRouter.get('/:id/reviews', companyOnly, asyncHandler(technicianController.reviews));
