import { Router } from 'express';
import { managerController } from './project-manager.controller';
import { validateQuery } from '../shared/validateQuery';
import { listManagersQuerySchema } from './project-manager.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const managerRouter = Router();
managerRouter.use(authMiddleware);

/**
 * @openapi
 * /managers:
 *   get:
 *     tags: [Managers]
 *     summary: Read-only picker over unassigned, activated project managers for RE2's wizard step 4 (Company only, own company)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated unassigned-manager list }
 */
managerRouter.get(
  '/',
  requireRole(UserRole.COMPANY),
  validateQuery(listManagersQuerySchema),
  asyncHandler(managerController.list),
);
