import { Router } from 'express';
import { pmController } from './pm.controller';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import { pmCopilotRateLimiter } from '../shared/rateLimit.middleware';
import { listReportsQuerySchema } from '../reports/report.dto';
import {
  pmActivityQuerySchema,
  pmCopilotChatSchema,
  pmCopilotSummarySchema,
  pmScopeQuerySchema,
} from './pm.dto';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md J1/J3): the PM operations API.
//
// THE PROJECT MANAGER IS SUPERVISORY AND READ-ONLY. Note what this router
// mounts: GETs, plus exactly two Copilot POSTs that reach a provider incapable
// of writing anything (J11). There is deliberately NO route here - and none may
// ever be added - that assigns a technician, changes a report's status,
// priority or warranty, closes/reopens a report, or edits a homeowner,
// technician or project. Those live on COMPANY-only routers, and integration
// tests assert a PM is refused there.
//
// Project scoping is derived from the authenticated principal in
// `resolvePmScope` (J2). A `projectId` query parameter is intersected with the
// PM's real assignment and 404s when foreign - it never widens scope.
// ---------------------------------------------------------------------------

export const pmRouter = Router();

pmRouter.use(authMiddleware);
pmRouter.use(requireRole(UserRole.PROJECT_MANAGER));

/**
 * @openapi
 * /pm/overview:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM1 operations overview - the six canonical KPIs (decisions.md J4)
 *     description: >
 *       Server-computed from canonical post-ownership reports ONLY - no legacy
 *       InspectionReport/WarrantyReport statistic is mixed in (I14). `openReports`,
 *       `inProgress` and `awaitingOwnerApproval` are deliberately disjoint, so their
 *       sum is the project's total active report count. `slaCompliancePercent` and
 *       `averageResolutionTimeMinutes` are null (never 0) on an empty denominator.
 *       The resolved month window is returned in `period` so no client re-derives it.
 *       A manager with no assigned project gets `assigned: false` and an honest
 *       empty state, not an error.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema: { type: string, format: uuid }
 *         description: Optional. Intersected with the PM's real assignment; a foreign value returns 404.
 *     responses:
 *       200: { description: PM overview }
 *       403: { description: Not a project manager }
 *       404: { description: PROJECT_NOT_FOUND }
 */
pmRouter.get(
  '/overview',
  validateQuery(pmScopeQuerySchema),
  asyncHandler(pmController.overview),
);

/**
 * @openapi
 * /pm/alerts:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM1 critical alerts, generated from canonical data (decisions.md J6)
 *     description: >
 *       Every alert references a real report row read inside the PM's scope, so its
 *       navigation target is valid by construction. A resolved condition disappears
 *       naturally - there is no alert table and no dismissal. A CLOSED report is never
 *       alerted on: its historical SLA breach stays visible in PM2's history rather than
 *       being presented as an active unresolved alert. The two threshold-based rules
 *       (AWAITING_APPROVAL_AGING, STALLED_REPAIR) are generated ONLY when
 *       PM_ALERT_AWAITING_APPROVAL_HOURS / PM_ALERT_STALLED_HOURS are configured; both
 *       are unset here, and `rules` reports them as null so the UI can say so honestly.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: PM alerts }
 */
pmRouter.get('/alerts', validateQuery(pmScopeQuerySchema), asyncHandler(pmController.alerts));

/**
 * @openapi
 * /pm/activity:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM1 recent activity from real timeline and audit rows (decisions.md J7)
 *     description: >
 *       Two real sources - the append-only ReportTimelineEvent log (I5) for reports in
 *       this project, and technician-lifecycle AuditLog rows for technicians attached to
 *       it. No event row is ever synthesised, and an unrecognised audit action is dropped
 *       rather than rendered raw. Event types are returned as enum values; the frontend
 *       maps them to Arabic copy, as it does every other enum in this product.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *     responses:
 *       200: { description: PM activity feed }
 */
pmRouter.get('/activity', validateQuery(pmActivityQuerySchema), asyncHandler(pmController.activity));

/**
 * @openapi
 * /pm/reports:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM1 report list - the ONE canonical read model, PM-scoped (decisions.md J8)
 *     description: >
 *       Delegates to the same `reportRepository.list()` + principal-derived scope that
 *       `GET /api/reports` uses. No second report model and no duplicated business rule
 *       exists (I15). Supports status, priority, technicianId, unitId, q and pagination;
 *       client filters are INTERSECTED with the role scope, never substituted for it.
 *       Every row navigates to the one canonical report detail.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Project-scoped canonical reports }
 */
pmRouter.get('/reports', validateQuery(listReportsQuerySchema), asyncHandler(pmController.reports));

/**
 * @openapi
 * /pm/contractors:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM3 technician performance overview (decisions.md J9)
 *     description: >
 *       "Contractor" is the design's wording; the operational entity is the individual
 *       Technician - NOT Task 4's ContractorOrganization, which this endpoint never reads.
 *       Every figure is project-scoped and canonical (ReportRepair durations, ReportReview
 *       ratings), with no legacy pre-ownership number anywhere. Technicians transferred off
 *       the roster who still hold real work here are returned with `membership: HISTORICAL`
 *       so their past work stays attributed to them; header KPIs count the CURRENT roster
 *       only. `averageRating` is null (never 0) with no reviews.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Project technicians and their measured performance }
 */
pmRouter.get(
  '/contractors',
  validateQuery(pmScopeQuerySchema),
  asyncHandler(pmController.contractors),
);

/**
 * @openapi
 * /pm/contractors/{technicianId}/performance:
 *   get:
 *     tags: [Project Manager]
 *     summary: PM-safe, read-only technician profile (decisions.md J10)
 *     description: >
 *       A PM-specific response, not a filtered company profile. It omits email, invitation
 *       state, the assigned manager's identity, cross-project counts and the legacy
 *       statistics block. There is no edit, resend, transfer or deactivate affordance here
 *       and no PM route that could perform one - the RE5 endpoints that do are COMPANY-only.
 *       A technician neither on this project's roster nor holding canonical work in it
 *       returns 404, not 403 (hide existence).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: PM-safe technician performance profile }
 *       404: { description: TECHNICIAN_NOT_FOUND }
 */
pmRouter.get(
  '/contractors/:technicianId/performance',
  asyncHandler(pmController.contractorPerformance),
);

/**
 * @openapi
 * /pm/contractors/{technicianId}/insight:
 *   get:
 *     tags: [Project Manager]
 *     summary: One grounded AI explanation of a technician's measured performance (decisions.md J13)
 *     description: >
 *       Returns 200 with an explicit availability envelope rather than an error status -
 *       the insight is a panel on a page that must keep working. `available: false` with
 *       `unavailableReason: INSUFFICIENT_DATA` when the technician has no completed work and
 *       no reviews (nothing true could be said), `NOT_CONFIGURED` when no OpenAI key is set,
 *       `PROVIDER_ERROR` on timeout/transport failure. When unavailable the payload carries
 *       NO reply string at all - no canned text is ever returned as AI. The prompt forbids
 *       inferring misconduct, intent or any personal trait, and forbids trend claims (there
 *       is no time series in the data).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Insight, or an honest unavailable state }
 *       404: { description: TECHNICIAN_NOT_FOUND }
 */
pmRouter.get(
  '/contractors/:technicianId/insight',
  pmCopilotRateLimiter,
  asyncHandler(pmController.contractorInsight),
);

/**
 * @openapi
 * /pm/copilot/summary:
 *   post:
 *     tags: [Project Manager]
 *     summary: Grounded daily operational summary (decisions.md J11/J12/J13)
 *     description: >
 *       READ-ONLY BY CONSTRUCTION. The provider imports no repository, no Prisma client and
 *       no service, so it cannot mutate anything, and the snapshot it is given is built
 *       server-side from the authenticated principal - a request body cannot broaden it.
 *       Every returned reference is validated against the candidate id set from that
 *       snapshot; hallucinated or foreign ids are dropped and counted in
 *       `droppedReferenceCount`. Stored homeowner/technician/report text is passed as
 *       untrusted data under a `data` key and can never become a system instruction.
 *       Returns 200 with `available: false` when unavailable, never canned text.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Grounded summary, or an honest unavailable state }
 *       429: { description: TOO_MANY_REQUESTS }
 */
pmRouter.post(
  '/copilot/summary',
  pmCopilotRateLimiter,
  validateBody(pmCopilotSummarySchema),
  asyncHandler(pmController.copilotSummary),
);

/**
 * @openapi
 * /pm/copilot/chat:
 *   post:
 *     tags: [Project Manager]
 *     summary: Grounded, read-only Q&A over the PM's own project (decisions.md J12)
 *     description: >
 *       Same grounding, validation and injection boundary as the summary endpoint. The
 *       optional `context` field is folded into the QUESTION only - it never reaches the
 *       snapshot and therefore cannot widen authorization. References are validated against
 *       the authorized candidate set, so even a successful prompt injection cannot make the
 *       assistant surface an entity this PM may not see.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 500 }
 *               context: { type: string, maxLength: 200 }
 *     responses:
 *       200: { description: Grounded reply, or an honest unavailable state }
 *       400: { description: VALIDATION_ERROR }
 *       429: { description: TOO_MANY_REQUESTS }
 */
pmRouter.post(
  '/copilot/chat',
  pmCopilotRateLimiter,
  validateBody(pmCopilotChatSchema),
  asyncHandler(pmController.copilotChat),
);
