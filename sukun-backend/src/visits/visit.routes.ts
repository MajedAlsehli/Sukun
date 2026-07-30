import { Router } from 'express';
import { visitController } from './visit.controller';
import { validateBody } from '../shared/validateBody';
import {
  createVisitFeedbackSchema,
  createVisitIssueSchema,
  createVisitNoteSchema,
  createVisitSchema,
  rescheduleVisitSchema,
} from './visit.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';
import { requireRole } from '../shared/rbac.middleware';
import { UserRole } from '../shared/roles';

export const visitRouter = Router();

// 14_Permissions_Matrix.md #VISITS: Home Seeker and Homeowner only.
const canManageVisits = requireRole(UserRole.HOME_SEEKER, UserRole.HOMEOWNER);

visitRouter.use(authMiddleware, canManageVisits);

/**
 * @openapi
 * /visits:
 *   post:
 *     tags: [Visits]
 *     summary: Book a property visit
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, unitId, date, time]
 *             properties:
 *               projectId: { type: string }
 *               unitId: { type: string }
 *               date: { type: string, format: date }
 *               time: { type: string }
 *     responses:
 *       201: { description: Visit booked }
 *       409: { description: VISIT_SLOT_ALREADY_BOOKED, UNIT_NOT_AVAILABLE, or NO_ACTIVE_SEARCH_JOURNEY }
 */
visitRouter.post('/', validateBody(createVisitSchema), asyncHandler(visitController.create));

/**
 * @openapi
 * /visits:
 *   get:
 *     tags: [Visits]
 *     summary: List the authenticated user's visits
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Visit list }
 */
visitRouter.get('/', asyncHandler(visitController.list));

/**
 * @openapi
 * /visits/{id}:
 *   get:
 *     tags: [Visits]
 *     summary: Get visit details (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Visit details }
 *       404: { description: VISIT_NOT_FOUND }
 */
visitRouter.get('/:id', asyncHandler(visitController.getById));

/**
 * @openapi
 * /visits/{id}/checkin:
 *   post:
 *     tags: [Visits]
 *     summary: Check in to a visit - enables Inspection Report creation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Visit checked in }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
visitRouter.post('/:id/checkin', asyncHandler(visitController.checkIn));

/**
 * @openapi
 * /visits/{id}/checkout:
 *   post:
 *     tags: [Visits]
 *     summary: Check out of a visit - disables further Inspection Report creation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Visit checked out }
 *       409: { description: INVALID_STATE_TRANSITION }
 */
visitRouter.post('/:id/checkout', asyncHandler(visitController.checkOut));

/**
 * @openapi
 * /visits/{id}/cancel:
 *   post:
 *     tags: [Visits]
 *     summary: Cancel a visit (not documented as a distinct endpoint in 08_API_Specification.md, but "Cancel Visit" is a real permission-matrix action)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Visit cancelled }
 *       409: { description: VISIT_READ_ONLY or INVALID_STATE_TRANSITION }
 */
visitRouter.post('/:id/cancel', asyncHandler(visitController.cancel));

/**
 * @openapi
 * /visits/{id}:
 *   patch:
 *     tags: [Visits]
 *     summary: Reschedule a visit (owner only) - valid only before check-in (decisions.md G9). Confirm/cancel keep their existing dedicated endpoints.
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
 *             required: [date, time]
 *             properties:
 *               date: { type: string, format: date }
 *               time: { type: string }
 *     responses:
 *       200: { description: Visit rescheduled }
 *       409: { description: VISIT_NOT_RESCHEDULABLE or VISIT_SLOT_ALREADY_BOOKED }
 */
visitRouter.patch('/:id', validateBody(rescheduleVisitSchema), asyncHandler(visitController.reschedule));

/**
 * @openapi
 * /visits/{id}/notes:
 *   post:
 *     tags: [Visits]
 *     summary: Add a visit note (owner only, only while checked in) - never becomes a report (decisions.md A9/G10)
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
 *             properties:
 *               text: { type: string }
 *               photo:
 *                 type: object
 *                 properties:
 *                   fileName: { type: string }
 *                   mimeType: { type: string, enum: [image/jpeg, image/png, image/webp] }
 *                   contentBase64: { type: string }
 *     responses:
 *       201: { description: Note added }
 *       409: { description: VISIT_NOT_IN_PROGRESS or MEDIA_STORAGE_NOT_CONFIGURED }
 */
visitRouter.post('/:id/notes', validateBody(createVisitNoteSchema), asyncHandler(visitController.addNote));

/**
 * @openapi
 * /visits/{id}/issues:
 *   post:
 *     tags: [Visits]
 *     summary: Report a visit issue (owner only, only while checked in) - never a warranty claim, never a technician-queue entry (decisions.md A9/G10)
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
 *             required: [category]
 *             properties:
 *               category: { type: string, enum: [FINISHING, ELECTRICAL, PLUMBING, PLAN_MISMATCH, OTHER] }
 *               description: { type: string }
 *               photo:
 *                 type: object
 *                 properties:
 *                   fileName: { type: string }
 *                   mimeType: { type: string, enum: [image/jpeg, image/png, image/webp] }
 *                   contentBase64: { type: string }
 *     responses:
 *       201: { description: Issue reported }
 *       409: { description: VISIT_NOT_IN_PROGRESS or MEDIA_STORAGE_NOT_CONFIGURED }
 */
visitRouter.post('/:id/issues', validateBody(createVisitIssueSchema), asyncHandler(visitController.addIssue));

/**
 * @openapi
 * /visits/{id}/feedback:
 *   post:
 *     tags: [Visits]
 *     summary: Submit visit feedback (owner only, completed visits only, one per visit) - decisions.md G11
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
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               suitability: { type: string, enum: [YES, SOMEWHAT, NO] }
 *     responses:
 *       201: { description: Feedback submitted }
 *       409: { description: VISIT_NOT_COMPLETED or FEEDBACK_ALREADY_SUBMITTED }
 */
visitRouter.post(
  '/:id/feedback',
  validateBody(createVisitFeedbackSchema),
  asyncHandler(visitController.submitFeedback),
);
