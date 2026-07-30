import { Router } from 'express';
import { projectController } from './project.controller';
import { workspaceController } from './workspace.controller';
import { validateBody } from '../shared/validateBody';
import { validateQuery } from '../shared/validateQuery';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  reassignContractorSchema,
  reassignManagerSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
  uploadCoverSchema,
} from './project.dto';
import { listProjectUnitsQuerySchema } from './workspace.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const projectRouter = Router();

// Task 6 correction (decisions.md G16): this router is now Company-only,
// full stop. It used to also admit HOME_SEEKER/HOMEOWNER as a "browse public
// projects" path (canBrowse, pre-Task-6) - that consumer surface has moved
// to /api/discovery/* (public-safe fields only, real discoverability rule).
// Retaining HS/HO here was a confirmed authorization/data-exposure overlap:
// it returned the full internal ProjectDto (companyId, managerId,
// primaryContractorId, source, etc.) and included ARCHIVED projects, to
// roles that should only ever see the narrower discovery.mapper.ts shape.
// No other role (PROJECT_MANAGER/TECHNICIAN) has any documented requirement
// to call this router directly either - PM's own contract is fully served by
// GET /api/pm/dashboard, which never calls into this module (verified by
// inspection before this change).
const companyOnly = requireRole(UserRole.COMPANY);

projectRouter.use(authMiddleware);

/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List the requesting company's own project portfolio (Company only). Not a consumer browse endpoint - see GET /api/discovery/projects for the public-safe surface Home Seekers/Homeowners use.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, ACTIVE, ARCHIVED] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, oldest, name, mostReports], default: newest }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated project list, scoped to the requester's own company }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 */
projectRouter.get(
  '/',
  companyOnly,
  validateQuery(listProjectsQuerySchema),
  asyncHandler(projectController.list),
);

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get full internal project details (Company only, own project). Not a consumer detail endpoint - see GET /api/discovery/projects/{id} for the public-safe surface Home Seekers/Homeowners use.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project details }
 *       403: { description: ACCESS_DENIED - any non-Company role }
 *       404: { description: PROJECT_NOT_FOUND }
 */
projectRouter.get('/:id', companyOnly, asyncHandler(projectController.getById));

/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Transactional nested project creation (Company only) - project + buildings + generated units + manager + primary contractor + audit events, one DB transaction (decisions.md E4). Starts in DRAFT. `code` is server-generated, not part of the request.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, city, managerId, primaryContractorId, buildings]
 *             properties:
 *               name: { type: string }
 *               city: { type: string }
 *               district: { type: string }
 *               description: { type: string }
 *               managerId: { type: string }
 *               primaryContractorId: { type: string }
 *               buildings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, floors]
 *                   properties:
 *                     name: { type: string }
 *                     number: { type: string }
 *                     floors: { type: integer }
 *                     units:
 *                       type: object
 *                       properties:
 *                         perFloor: { type: integer, default: 8 }
 *                         area: { type: number, default: 140 }
 *                         beds: { type: integer, default: 3 }
 *                         baths: { type: integer, default: 2 }
 *                         parking: { type: integer, default: 1 }
 *     responses:
 *       201: { description: Project created }
 *       409: { description: MANAGER_NOT_ELIGIBLE, CONTRACTOR_NOT_ELIGIBLE, DUPLICATE_BUILDING_NUMBER, or PROJECT_UNIT_GENERATION_LIMIT_EXCEEDED }
 */
projectRouter.post(
  '/',
  companyOnly,
  validateBody(createProjectSchema),
  asyncHandler(projectController.create),
);

/**
 * @openapi
 * /projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update a project's editable fields (Company only, own project)
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
 *               name: { type: string }
 *               city: { type: string }
 *     responses:
 *       200: { description: Project updated }
 *       409: { description: PROJECT_ARCHIVED }
 */
projectRouter.patch(
  '/:id',
  companyOnly,
  validateBody(updateProjectSchema),
  asyncHandler(projectController.update),
);

/**
 * @openapi
 * /projects/{id}/publish:
 *   patch:
 *     tags: [Projects]
 *     summary: Publish a Draft project (DRAFT -> ACTIVE)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project activated }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
projectRouter.patch('/:id/publish', companyOnly, asyncHandler(projectController.publish));

/**
 * @openapi
 * /projects/{id}/status:
 *   patch:
 *     tags: [Projects]
 *     summary: Reversible temporary activation/deactivation via isActive (Company only). Requires status=ACTIVE. This is NOT archiving - see PATCH /projects/{id}/archive for the separate, one-way terminal transition; archived projects can never be reactivated through this or any endpoint (decisions.md E1). No DELETE endpoint exists (D5/A7).
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
 *       200: { description: Project status updated }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
projectRouter.patch(
  '/:id/status',
  companyOnly,
  validateBody(updateProjectStatusSchema),
  asyncHandler(projectController.updateStatus),
);

/**
 * @openapi
 * /projects/{id}/archive:
 *   patch:
 *     tags: [Projects]
 *     summary: Archive a project (Company only) - terminal, one-way (decisions.md E1). No DELETE endpoint exists.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project archived }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
projectRouter.patch('/:id/archive', companyOnly, asyncHandler(projectController.archive));

/**
 * @openapi
 * /projects/{id}/manager:
 *   patch:
 *     tags: [Projects]
 *     summary: Reassign a project's manager (Company only) - outgoing manager returns to the unassigned pool, preserving history
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
 *             required: [managerId]
 *             properties:
 *               managerId: { type: string }
 *     responses:
 *       200: { description: Manager reassigned }
 *       409: { description: MANAGER_NOT_ELIGIBLE or PROJECT_ARCHIVED }
 */
projectRouter.patch(
  '/:id/manager',
  companyOnly,
  validateBody(reassignManagerSchema),
  asyncHandler(projectController.reassignManager),
);

/**
 * @openapi
 * /projects/{id}/contractor:
 *   patch:
 *     tags: [Projects]
 *     summary: Reassign a project's primary contractor organization (Company only)
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
 *             required: [primaryContractorId]
 *             properties:
 *               primaryContractorId: { type: string }
 *     responses:
 *       200: { description: Contractor reassigned }
 *       409: { description: CONTRACTOR_NOT_ELIGIBLE or PROJECT_ARCHIVED }
 */
projectRouter.patch(
  '/:id/contractor',
  companyOnly,
  validateBody(reassignContractorSchema),
  asyncHandler(projectController.reassignContractor),
);

/**
 * @openapi
 * /projects/{id}/cover:
 *   post:
 *     tags: [Projects]
 *     summary: Upload a project cover image (Company only, own project) - JSON+base64, Supabase Storage-backed (decisions.md E7). Fails honestly with COVER_STORAGE_NOT_CONFIGURED if no storage credentials are configured - never a fake success.
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
 *             required: [fileName, mimeType, contentBase64]
 *             properties:
 *               fileName: { type: string }
 *               mimeType: { type: string, enum: [image/jpeg, image/png] }
 *               contentBase64: { type: string }
 *     responses:
 *       200: { description: Cover uploaded }
 *       409: { description: COVER_STORAGE_NOT_CONFIGURED, COVER_UPLOAD_FAILED, or PROJECT_ARCHIVED }
 */
projectRouter.post(
  '/:id/cover',
  companyOnly,
  validateBody(uploadCoverSchema),
  asyncHandler(projectController.uploadCover),
);

/**
 * @openapi
 * /projects/{id}/workspace:
 *   get:
 *     tags: [Projects]
 *     summary: RE3 project workspace - project + server-computed KPIs/health + timeline + settings (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project workspace }
 *       404: { description: PROJECT_NOT_FOUND }
 */
projectRouter.get('/:id/workspace', companyOnly, asyncHandler(workspaceController.getWorkspace));

/**
 * @openapi
 * /projects/{id}/units:
 *   get:
 *     tags: [Projects]
 *     summary: RE3 tab 3 - project-wide unit list with building/search/occupancy filters (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: buildingId
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: occupancy
 *         schema: { type: string, enum: [ALL, OCCUPIED, AVAILABLE, RESERVED], default: ALL }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 24 }
 *     responses:
 *       200: { description: Paginated project-wide unit list }
 */
projectRouter.get(
  '/:id/units',
  companyOnly,
  validateQuery(listProjectUnitsQuerySchema),
  asyncHandler(workspaceController.listUnits),
);

/**
 * @openapi
 * /projects/{id}/homeowners:
 *   get:
 *     tags: [Projects]
 *     summary: RE3 tab 4 - real Ownership/HomeownerActivation-derived homeowner rows (Company only, own project). Full management is Task 5's RE4.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Homeowner rows for this project }
 */
projectRouter.get('/:id/homeowners', companyOnly, asyncHandler(workspaceController.listHomeowners));

/**
 * @openapi
 * /projects/{id}/activity:
 *   get:
 *     tags: [Projects]
 *     summary: RE3 activity/timeline - real audit-log-derived events for this project and its buildings (Company only, own project)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Recent activity for this project }
 */
projectRouter.get('/:id/activity', companyOnly, asyncHandler(workspaceController.listActivity));
