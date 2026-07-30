import { Router } from 'express';
import { buildingController } from './building.controller';
import { validateBody } from '../shared/validateBody';
import {
  createBuildingSchema,
  updateBuildingSchema,
  updateBuildingStatusSchema,
} from './building.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

// Task 6 closeout correction (decisions.md G17): this file used to also admit
// HOME_SEEKER/HOMEOWNER via `canBrowse` on the two GET routes below - removed,
// same reasoning as the identical `project.routes.ts` correction (G16). No
// documented consumer, PM, or technician contract calls either route; the
// only real frontend caller (`buildingsApi.listByProject`) is already
// company-only, and `GET /api/buildings/{id}` has zero frontend callers at all.
const companyOnly = requireRole(UserRole.COMPANY);

// Nested under a project - 08_API_Specification.md's two documented routes:
// GET/POST /api/projects/{id}/buildings. Mounted with mergeParams so :projectId
// from the parent router is visible here.
export const projectBuildingsRouter = Router({ mergeParams: true });
projectBuildingsRouter.use(authMiddleware);

/**
 * @openapi
 * /projects/{projectId}/buildings:
 *   get:
 *     tags: [Buildings]
 *     summary: List buildings for a project (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Building list }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 *       404: { description: PROJECT_NOT_FOUND }
 */
projectBuildingsRouter.get('/', companyOnly, asyncHandler(buildingController.list));

/**
 * @openapi
 * /projects/{projectId}/buildings:
 *   post:
 *     tags: [Buildings]
 *     summary: Create a building under a project (Company only) - starts in DRAFT
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, number]
 *             properties:
 *               name: { type: string }
 *               number: { type: string }
 *     responses:
 *       201: { description: Building created }
 *       409: { description: BUILDING_NUMBER_ALREADY_EXISTS or PROJECT_ARCHIVED }
 */
projectBuildingsRouter.post(
  '/',
  companyOnly,
  validateBody(createBuildingSchema),
  asyncHandler(buildingController.create),
);

// Flat resource routes for single-building operations, not nested under a
// project path (not literally in 08_API_Specification.md - a straightforward
// CRUD extension, same pattern as Projects' own :id routes).
export const buildingRouter = Router();
buildingRouter.use(authMiddleware);

/**
 * @openapi
 * /buildings/{id}:
 *   get:
 *     tags: [Buildings]
 *     summary: Get building details (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Building details }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 *       404: { description: BUILDING_NOT_FOUND }
 */
buildingRouter.get('/:id', companyOnly, asyncHandler(buildingController.getById));

/**
 * @openapi
 * /buildings/{id}:
 *   patch:
 *     tags: [Buildings]
 *     summary: Update a building's editable fields (Company only, own building)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               number: { type: string }
 *     responses:
 *       200: { description: Building updated }
 *       409: { description: BUILDING_ARCHIVED or BUILDING_NUMBER_ALREADY_EXISTS }
 */
buildingRouter.patch(
  '/:id',
  companyOnly,
  validateBody(updateBuildingSchema),
  asyncHandler(buildingController.update),
);

/**
 * @openapi
 * /buildings/{id}/publish:
 *   patch:
 *     tags: [Buildings]
 *     summary: Publish a Draft building (DRAFT -> ACTIVE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Building activated }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
buildingRouter.patch('/:id/publish', companyOnly, asyncHandler(buildingController.publish));

/**
 * @openapi
 * /buildings/{id}/status:
 *   patch:
 *     tags: [Buildings]
 *     summary: Reversible temporary activation/deactivation via isActive (Company only). Requires status=ACTIVE. This is NOT archiving - see PATCH /buildings/{id}/archive for the separate, one-way terminal transition; archived buildings can never be reactivated through this or any endpoint (decisions.md E1). No DELETE endpoint exists (D5/A7).
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
 *       200: { description: Building status updated }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
buildingRouter.patch(
  '/:id/status',
  companyOnly,
  validateBody(updateBuildingStatusSchema),
  asyncHandler(buildingController.updateStatus),
);

/**
 * @openapi
 * /buildings/{id}/archive:
 *   patch:
 *     tags: [Buildings]
 *     summary: Archive a building (Company only) - terminal, one-way (decisions.md E1). No DELETE endpoint exists.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Building archived }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
buildingRouter.patch('/:id/archive', companyOnly, asyncHandler(buildingController.archive));
