import { Router } from 'express';
import { searchJourneyController } from './search-journey.controller';
import { validateBody } from '../shared/validateBody';
import { cancelSearchJourneySchema } from './search-journey.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const searchJourneyRouter = Router();

// 14_Permissions_Matrix.md #SEARCH: Home Seeker and Homeowner only.
const canManageJourneys = requireRole(UserRole.HOME_SEEKER, UserRole.HOMEOWNER);

searchJourneyRouter.use(authMiddleware, canManageJourneys);

/**
 * @openapi
 * /search-journey:
 *   get:
 *     tags: [SearchJourney]
 *     summary: Get the current active Search Journey for the authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active journey, or null if none }
 */
searchJourneyRouter.get('/', asyncHandler(searchJourneyController.getActive));

/**
 * @openapi
 * /search-journey/history:
 *   get:
 *     tags: [SearchJourney]
 *     summary: List all Search Journeys for the authenticated user (SEA-004)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All journeys, most recent first }
 */
searchJourneyRouter.get('/history', asyncHandler(searchJourneyController.getHistory));

/**
 * @openapi
 * /search-journey:
 *   post:
 *     tags: [SearchJourney]
 *     summary: Start a new Search Journey (auto-closes any existing active one)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: New journey created }
 */
searchJourneyRouter.post('/', asyncHandler(searchJourneyController.create));

/**
 * @openapi
 * /search-journey/{id}/cancel:
 *   patch:
 *     tags: [SearchJourney]
 *     summary: Cancel an active Search Journey
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
 *               reason: { type: string }
 *     responses:
 *       200: { description: Journey cancelled }
 *       404: { description: SEARCH_JOURNEY_NOT_FOUND }
 *       409: { description: JOURNEY_ALREADY_CLOSED }
 */
searchJourneyRouter.patch(
  '/:id/cancel',
  validateBody(cancelSearchJourneySchema),
  asyncHandler(searchJourneyController.cancel),
);
