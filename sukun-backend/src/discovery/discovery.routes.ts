import { Router } from 'express';
import { discoveryController } from './discovery.controller';
import { validateQuery } from '../shared/validateQuery';
import { listDiscoveryProjectsQuerySchema } from './discovery.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';
import { discoveryRateLimiter } from '../shared/rateLimit.middleware';

export const discoveryRouter = Router();

// Discovery and visits are available to homeowner_prospect (HOME_SEEKER) and
// homeowner_active (HOMEOWNER) only - decisions.md G2, matching the
// pre-existing frontend route guard (routeAccess.ts) exactly. A pending
// homeowner (HOME_SEEKER with a live PENDING activation) is not a distinct
// backend role - it stays restricted to /activate by the frontend guard;
// the backend role check here is identical to the existing visits module's.
const canDiscover = requireRole(UserRole.HOME_SEEKER, UserRole.HOMEOWNER);

discoveryRouter.use(authMiddleware, canDiscover);

/**
 * @openapi
 * /discovery/projects:
 *   get:
 *     tags: [Discovery]
 *     summary: Search/filter discoverable projects (public-safe fields only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: priceBand
 *         schema: { type: string, enum: [UNDER_500K, FROM_500K_TO_1M, FROM_1M_TO_2M, ABOVE_2M] }
 *       - in: query
 *         name: unitType
 *         schema: { type: string }
 *       - in: query
 *         name: readiness
 *         schema: { type: string, enum: [READY, UNDER_CONSTRUCTION, OFF_PLAN] }
 *       - in: query
 *         name: saved
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated public-safe project list }
 */
discoveryRouter.get(
  '/projects',
  validateQuery(listDiscoveryProjectsQuerySchema),
  asyncHandler(discoveryController.list),
);

/**
 * @openapi
 * /discovery/projects/{id}:
 *   get:
 *     tags: [Discovery]
 *     summary: Get a discoverable project's public-safe detail (honest 404 if not discoverable)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project detail }
 *       404: { description: PROJECT_NOT_FOUND }
 */
discoveryRouter.get('/projects/:id', asyncHandler(discoveryController.getById));

/**
 * @openapi
 * /discovery/recommendations:
 *   get:
 *     tags: [Discovery]
 *     summary: AI-ranked recommendations restricted to real discoverable projects - honest AI_SERVICE_UNAVAILABLE/NO_DISCOVERABLE_PROJECTS when not possible (decisions.md G13)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Recommendation result (available true/false) }
 *       429: { description: TOO_MANY_REQUESTS }
 */
discoveryRouter.get('/recommendations', discoveryRateLimiter, asyncHandler(discoveryController.getRecommendations));

/**
 * @openapi
 * /discovery/saved/{projectId}:
 *   post:
 *     tags: [Discovery]
 *     summary: Save a project (idempotent - upsert). Non-discoverable projects cannot be newly saved.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Saved }
 *       404: { description: PROJECT_NOT_FOUND }
 */
discoveryRouter.post('/saved/:projectId', asyncHandler(discoveryController.save));

/**
 * @openapi
 * /discovery/saved/{projectId}:
 *   delete:
 *     tags: [Discovery]
 *     summary: Unsave a project (idempotent - removes only a reversible user preference)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Unsaved (stable response whether or not it was previously saved) }
 */
discoveryRouter.delete('/saved/:projectId', asyncHandler(discoveryController.unsave));
