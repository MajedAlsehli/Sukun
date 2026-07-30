import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

/**
 * @openapi
 * /company/dashboard:
 *   get:
 *     tags: [Dashboards]
 *     summary: Company portfolio dashboard - KPIs, Projects, Technicians, Homeowners, Reports
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Company dashboard }
 */
export const companyDashboardRouter = Router();
companyDashboardRouter.get(
  '/dashboard',
  authMiddleware,
  requireRole(UserRole.COMPANY),
  asyncHandler(dashboardController.company),
);

/**
 * @openapi
 * /pm/dashboard:
 *   get:
 *     tags: [Dashboards]
 *     deprecated: true
 *     summary: "DEPRECATED - superseded by /pm/overview, /pm/alerts, /pm/activity, /pm/reports"
 *     description: >
 *       Task 9 (decisions.md J1). This endpoint computes its KPIs from the LEGACY
 *       pre-ownership InspectionReport/Repair pipeline, which I14 forbids mixing with
 *       canonical post-ownership statistics - so PM1 could not be built on it. Its
 *       behaviour is deliberately unchanged and it keeps working; it simply has no
 *       consumer. Use the granular /api/pm/* endpoints instead.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: PM dashboard (legacy, pre-ownership figures) }
 */
export const pmDashboardRouter = Router();
pmDashboardRouter.get(
  '/dashboard',
  authMiddleware,
  requireRole(UserRole.PROJECT_MANAGER),
  asyncHandler(dashboardController.pm),
);

/**
 * @openapi
 * /technician/dashboard:
 *   get:
 *     tags: [Dashboards]
 *     summary: Technician dashboard - assigned repairs and repair history
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Technician dashboard }
 */
export const technicianDashboardRouter = Router();
technicianDashboardRouter.get(
  '/dashboard',
  authMiddleware,
  requireRole(UserRole.TECHNICIAN),
  asyncHandler(dashboardController.technician),
);

/**
 * @openapi
 * /homeowner/dashboard:
 *   get:
 *     tags: [Dashboards]
 *     summary: Homeowner dashboard - ownerships, warranty, notifications
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Homeowner dashboard }
 */
export const homeownerDashboardRouter = Router();
homeownerDashboardRouter.get(
  '/dashboard',
  authMiddleware,
  requireRole(UserRole.HOMEOWNER),
  asyncHandler(dashboardController.homeowner),
);
