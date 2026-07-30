import { Router } from 'express';
import { homeownerController } from './homeowner.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import {
  activateHomeownerSchema,
  createHomeownerSchema,
  exportHomeownersQuerySchema,
  listHomeownersQuerySchema,
  transferHomeownerSchema,
  updateHomeownerSchema,
  updateHomeownerStatusSchema,
} from './homeowner.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';
import { authRateLimiter } from '../shared/rateLimit.middleware';

export const homeownerRouter = Router();

const companyOnly = requireRole(UserRole.COMPANY);
const homeownerOnly = requireRole(UserRole.HOMEOWNER);

/**
 * @openapi
 * /homeowners:
 *   post:
 *     tags: [Homeowners]
 *     summary: Create a pending homeowner record for a unit (Company only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, unitId]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               unitId: { type: string }
 *               nationalId:
 *                 type: string
 *                 description: >
 *                   Optional. Collected in no end-user journey; omit the key
 *                   entirely when there is no value. Must not be sent as an
 *                   empty or placeholder string - a blank value is rejected.
 *                   When supplied it must be unique across all accounts and is
 *                   checked for identity conflicts; when omitted, no
 *                   national-ID rule runs and any value already stored for an
 *                   existing person is left untouched.
 *     responses:
 *       201: { description: Pending homeowner created, activation code returned }
 *       409: { description: UNIT_ALREADY_OWNED, NATIONAL_ID_ALREADY_EXISTS or IDENTITY_MISMATCH }
 */
homeownerRouter.post(
  '/',
  authMiddleware,
  companyOnly,
  validateBody(createHomeownerSchema),
  asyncHandler(homeownerController.register),
);

/**
 * @openapi
 * /homeowners/activate:
 *   post:
 *     tags: [Homeowners]
 *     summary: Redeem a QR/Activation Code, set a password, and promote the account to Homeowner
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, password]
 *             properties:
 *               code: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Homeowner activated, tokens issued }
 *       409: { description: INVALID_ACTIVATION_CODE, ACTIVATION_CODE_EXPIRED, ACTIVATION_CODE_ALREADY_USED, or UNIT_ALREADY_OWNED }
 */
homeownerRouter.post(
  '/activate',
  authRateLimiter, // brute-forceable activation code, no auth gate otherwise
  validateBody(activateHomeownerSchema),
  asyncHandler(homeownerController.activate),
);

/**
 * @openapi
 * /homeowners/{id}/resend:
 *   post:
 *     tags: [Homeowners]
 *     summary: Reissue a new activation code for a pending homeowner (Company only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: New activation code issued }
 *       409: { description: ALREADY_ACTIVATED }
 */
homeownerRouter.post(
  '/:id/resend',
  authMiddleware,
  companyOnly,
  asyncHandler(homeownerController.resend),
);

/**
 * @openapi
 * /homeowners/me:
 *   get:
 *     tags: [Homeowners]
 *     summary: Get the authenticated Homeowner's active unit/building/project (My Home page) - Task 7 (decisions.md H7) also returns handoverDate, unit area/bedrooms/bathrooms/parkingSpots, project.developerName, coverImage, a warranty summary, and a reportsSummary carrying a real canonical open-report count (Task 8, decisions.md I15 - the shape Task 7 froze is unchanged; only the values became real)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active ownership with unit/building/project details, warranty summary, and reports boundary }
 *       404: { description: NO_ACTIVE_OWNERSHIP }
 */
homeownerRouter.get('/me', authMiddleware, homeownerOnly, asyncHandler(homeownerController.getMyHome));

// ---------------------------------------------------------------------
// Task 5 (RE4): company-wide homeowner management. Every :id below is a
// User.id (decisions.md F5), not a HomeownerActivation.id.
// ---------------------------------------------------------------------

/**
 * @openapi
 * /homeowners/{id}/resend-invitation:
 *   post:
 *     tags: [Homeowners]
 *     summary: Resend the current activation invitation (Company only) - resolves the user's latest activation internally (decisions.md F5)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: New activation code issued }
 *       404: { description: HOMEOWNER_NOT_FOUND or ACTIVATION_NOT_FOUND }
 *       409: { description: ALREADY_ACTIVATED }
 */
homeownerRouter.post(
  '/:id/resend-invitation',
  authMiddleware,
  companyOnly,
  asyncHandler(homeownerController.resendInvitationForUser),
);

/**
 * @openapi
 * /homeowners/{id}/transfer:
 *   post:
 *     tags: [Homeowners]
 *     summary: Transfer a homeowner to a different (vacant, same-company) unit (Company only) - decisions.md F7
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
 *             required: [unitId]
 *             properties:
 *               unitId: { type: string }
 *     responses:
 *       200: { description: Homeowner transferred }
 *       404: { description: HOMEOWNER_NOT_FOUND or NO_TRANSFERABLE_ASSIGNMENT }
 *       409: { description: UNIT_ALREADY_OWNED, ALREADY_OWNS_UNIT, or HOMEOWNER_DEACTIVATED }
 */
homeownerRouter.post(
  '/:id/transfer',
  authMiddleware,
  companyOnly,
  validateBody(transferHomeownerSchema),
  asyncHandler(homeownerController.transfer),
);

/**
 * @openapi
 * /homeowners/{id}/status:
 *   patch:
 *     tags: [Homeowners]
 *     summary: Temporarily deactivate/reactivate a homeowner account (Company only) - reuses User.status, never touches Ownership (decisions.md F8). No DELETE endpoint exists.
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
 */
homeownerRouter.patch(
  '/:id/status',
  authMiddleware,
  companyOnly,
  validateBody(updateHomeownerStatusSchema),
  asyncHandler(homeownerController.setStatus),
);

/**
 * @openapi
 * /homeowners/{id}:
 *   patch:
 *     tags: [Homeowners]
 *     summary: Edit a homeowner's mobile/email only (Company only) - nationalId/project/building/unit have no path here (decisions.md F1)
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
 *               email: { type: string }
 *               phone: { type: string }
 *     responses:
 *       200: { description: Homeowner updated }
 *       409: { description: EMAIL_ALREADY_EXISTS or PHONE_ALREADY_EXISTS }
 */
homeownerRouter.patch(
  '/:id',
  authMiddleware,
  companyOnly,
  validateBody(updateHomeownerSchema),
  asyncHandler(homeownerController.update),
);

/**
 * @openapi
 * /homeowners/export:
 *   get:
 *     tags: [Homeowners]
 *     summary: CSV export of this company's homeowners (Company only) - decisions.md F13. Registered before /:id so "export" is never matched as an id.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PENDING, NOT_ACTIVATED, DEACTIVATED] }
 *     responses:
 *       200: { description: CSV file }
 */
homeownerRouter.get(
  '/export',
  authMiddleware,
  companyOnly,
  validateQuery(exportHomeownersQuerySchema),
  asyncHandler(homeownerController.export),
);

/**
 * @openapi
 * /homeowners/by-unit/{unitNumber}:
 *   get:
 *     tags: [Homeowners]
 *     summary: Look up a homeowner profile by unit number (Company only) - best-effort, most-recent-match (decisions.md F13, unit numbers are unique only per-building)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: unitNumber
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Homeowner profile }
 *       404: { description: HOMEOWNER_NOT_FOUND }
 */
homeownerRouter.get('/by-unit/:unitNumber', authMiddleware, companyOnly, asyncHandler(homeownerController.getByUnit));

/**
 * @openapi
 * /homeowners:
 *   get:
 *     tags: [Homeowners]
 *     summary: List this company's homeowners (Company only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PENDING, NOT_ACTIVATED, DEACTIVATED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated homeowner list }
 */
homeownerRouter.get(
  '/',
  authMiddleware,
  companyOnly,
  validateQuery(listHomeownersQuerySchema),
  asyncHandler(homeownerController.list),
);

/**
 * @openapi
 * /homeowners/{id}:
 *   get:
 *     tags: [Homeowners]
 *     summary: Get one homeowner's full profile (Company only) - id is a User.id (decisions.md F5). Registered last among GETs with a single dynamic segment.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Homeowner profile }
 *       404: { description: HOMEOWNER_NOT_FOUND }
 */
homeownerRouter.get('/:id', authMiddleware, companyOnly, asyncHandler(homeownerController.getProfile));
