import { Router } from 'express';
import { companyController } from './company.controller';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

// Task 4 (decisions.md B3): granular RE1 endpoints alongside the existing
// monolithic GET /api/company/dashboard (dashboards/dashboard.routes.ts,
// left unchanged/untouched - kept for whatever else may still read it).
// These are the three endpoints RE1's real frontend implementation targets.
export const companyOverviewRouter = Router();
companyOverviewRouter.use(authMiddleware, requireRole(UserRole.COMPANY));

/**
 * @openapi
 * /company/overview:
 *   get:
 *     tags: [Company]
 *     summary: RE1 portfolio KPIs - server-computed, real data only (Company only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Company portfolio KPIs }
 */
companyOverviewRouter.get('/overview', asyncHandler(companyController.overview));

/**
 * @openapi
 * /company/projects/summary:
 *   get:
 *     tags: [Company]
 *     summary: RE1 project cards - one row per project with server-computed health (Company only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Project summary list }
 */
companyOverviewRouter.get('/projects/summary', asyncHandler(companyController.projectsSummary));

/**
 * @openapi
 * /company/activity:
 *   get:
 *     tags: [Company]
 *     summary: RE1 recent-activity feed - real audit-log-derived events only (Company only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Recent company-wide activity }
 */
companyOverviewRouter.get('/activity', asyncHandler(companyController.activity));
