import { Router } from 'express';
import { contractorController } from './contractor.controller';
import { validateQuery } from '../shared/validateQuery';
import { listContractorsQuerySchema } from './contractor.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const contractorRouter = Router();
contractorRouter.use(authMiddleware);

/**
 * @openapi
 * /contractors:
 *   get:
 *     tags: [Contractors]
 *     summary: Read-only contractor-organization picker for RE2's primary-contractor step (Company only, own company, active-only)
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
 *       200: { description: Paginated contractor-organization list }
 */
contractorRouter.get(
  '/',
  requireRole(UserRole.COMPANY),
  validateQuery(listContractorsQuerySchema),
  asyncHandler(contractorController.list),
);
