import { Router } from 'express';
import { unitController } from './unit.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import { createUnitSchema, listVacantUnitsQuerySchema, updateUnitSchema } from './unit.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

// Task 6 closeout correction (decisions.md G17): this file used to also admit
// HOME_SEEKER/HOMEOWNER via `canBrowse` on the two GET routes below - removed,
// same reasoning as the identical `project.routes.ts`/`building.routes.ts`
// correction (G16/G17). Neither route has any real frontend caller today,
// let alone a documented consumer/PM/technician contract requiring them.
const companyOnly = requireRole(UserRole.COMPANY);

// Nested under a building - list/create. Not literally in 08_API_Specification.md
// (only GET /api/units/{id} and 13_Frontend_Backend_Mapping.md's flat
// POST /api/units are documented) - kept consistent with the Project/Building
// nesting pattern already established.
export const buildingUnitsRouter = Router({ mergeParams: true });
buildingUnitsRouter.use(authMiddleware);

/**
 * @openapi
 * /buildings/{buildingId}/units:
 *   get:
 *     tags: [Units]
 *     summary: List units for a building (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Unit list }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 *       404: { description: BUILDING_NOT_FOUND }
 */
buildingUnitsRouter.get('/', companyOnly, asyncHandler(unitController.list));

/**
 * @openapi
 * /buildings/{buildingId}/units:
 *   post:
 *     tags: [Units]
 *     summary: Create a unit under a building (Company only) - starts AVAILABLE
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [number, floor, type]
 *             properties:
 *               number: { type: string }
 *               floor: { type: integer }
 *               type: { type: string }
 *     responses:
 *       201: { description: Unit created }
 *       409: { description: UNIT_NUMBER_ALREADY_EXISTS or BUILDING_ARCHIVED }
 */
buildingUnitsRouter.post(
  '/',
  companyOnly,
  validateBody(createUnitSchema),
  asyncHandler(unitController.create),
);

// Flat resource routes. GET /api/units/{id} is the one endpoint literally
// documented in 08_API_Specification.md ("Returns Unit Details, Owner,
// Warranty, Inspection History"). No DELETE/archive: Unit's state machine
// (11_State_Machines.md #UNIT) has no terminal/archived state to move it to,
// and no such endpoint appears anywhere in the docs - see task report.
export const unitRouter = Router();
unitRouter.use(authMiddleware);

/**
 * @openapi
 * /units/vacant:
 *   get:
 *     tags: [Units]
 *     summary: List AVAILABLE units, company-scoped (Company only) - RE4 wizard step 2's vacant-unit picker. Registered before /:id so "vacant" is never matched as an id.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: buildingId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Vacant unit list }
 */
unitRouter.get(
  '/vacant',
  requireRole(UserRole.COMPANY),
  validateQuery(listVacantUnitsQuerySchema),
  asyncHandler(unitController.listVacant),
);

/**
 * @openapi
 * /units/{id}:
 *   get:
 *     tags: [Units]
 *     summary: Get unit details (Company only, own project - Owner/Warranty/Inspection History are placeholders until later tasks)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Unit details }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 *       404: { description: UNIT_NOT_FOUND }
 */
unitRouter.get('/:id', companyOnly, asyncHandler(unitController.getById));

/**
 * @openapi
 * /units/{id}:
 *   patch:
 *     tags: [Units]
 *     summary: Update a unit's editable fields (Company only; locked once past AVAILABLE)
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
 *               number: { type: string }
 *               floor: { type: integer }
 *               type: { type: string }
 *     responses:
 *       200: { description: Unit updated }
 *       409: { description: UNIT_LOCKED or UNIT_NUMBER_ALREADY_EXISTS }
 */
unitRouter.patch(
  '/:id',
  companyOnly,
  validateBody(updateUnitSchema),
  asyncHandler(unitController.update),
);
