import { Router } from 'express';
import { auditController } from './audit.controller';
import { validateQuery } from '../shared/validateQuery';
import { listAuditLogsQuerySchema } from './audit.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const auditRouter = Router();

/**
 * @openapi
 * /audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs (Company only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: entity
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated audit log list }
 */
auditRouter.get(
  '/',
  authMiddleware,
  requireRole(UserRole.COMPANY),
  validateQuery(listAuditLogsQuerySchema),
  asyncHandler(auditController.list),
);
