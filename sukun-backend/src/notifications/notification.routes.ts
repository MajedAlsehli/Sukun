import { Router } from 'express';
import { notificationController } from './notification.controller';
import { validateBody } from '../shared/validateBody';
import { markReadSchema } from './notification.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';

export const notificationRouter = Router();
notificationRouter.use(authMiddleware);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the authenticated user's notifications
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notification list }
 */
notificationRouter.get('/', asyncHandler(notificationController.list));

/**
 * @openapi
 * /notifications/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark a specific notification as read, or all if none specified
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationId: { type: string }
 *     responses:
 *       200: { description: Marked as read }
 */
notificationRouter.post(
  '/read',
  validateBody(markReadSchema),
  asyncHandler(notificationController.markRead),
);
