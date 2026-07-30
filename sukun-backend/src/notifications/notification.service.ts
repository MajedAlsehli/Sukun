import { notificationRepository } from './notification.repository';
import { toNotificationDto } from './notification.mapper';
import { logger } from '../shared/logger';
import { NotFoundError } from '../shared/errors';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { NotificationStatus, NotificationType } from '@prisma/client';

/**
 * Task 10: is there a real outbound channel behind this at all? Today: no.
 * No Email/SMS/Push provider credential exists in any environment, so nothing
 * is ever actually delivered - see config/env.ts#messaging.
 */
function deliveryProviderConfigured(type: NotificationType): boolean {
  if (type === NotificationType.EMAIL) return !!env.messaging.emailProvider;
  if (type === NotificationType.SMS) return !!env.messaging.smsProvider;
  return false; // PUSH: no FCM/APNs credentials exist anywhere in this product.
}

export const notificationService = {
  // Called by other modules (Visit booking, Inspection submission, Repair
  // completion, invitations, activations - NOT-001..005).
  //
  // Task 10 honesty correction: this used to mark every notification SENT
  // immediately, even though no Email/SMS/Push provider has ever been
  // configured - the row claimed a delivery that never happened. It now stays
  // QUEUED unless a real provider is configured, which is exactly what the
  // QUEUED state in 11_State_Machines.md means. The in-app notification list
  // is unaffected: it reads the row, not the delivery status.
  //
  // Nothing here is a stub *delivery* - it is a persisted intent with an
  // honest state. When a provider is genuinely wired, mark SENT only on that
  // provider's confirmation.
  async send(userId: string, title: string, body: string, type: NotificationType = NotificationType.PUSH) {
    const notification = await notificationRepository.create({ userId, title, body, type });

    if (!deliveryProviderConfigured(type)) {
      logger.info('Notification persisted but NOT delivered - no provider configured', {
        notificationId: notification.id,
        userId,
        type,
        status: NotificationStatus.QUEUED,
      });
      return notification;
    }

    // Unreachable in every environment shipped so far. Left as the explicit
    // seam a real provider integration plugs into, rather than a fake success.
    return notificationRepository.markSent(notification.id);
  },

  // GET /api/notifications
  async list(userId: string) {
    const notifications = await notificationRepository.findAllByUser(userId);
    return notifications.map(toNotificationDto);
  },

  // POST /api/notifications/read - a specific notification if given, else all unread.
  async markRead(userId: string, notificationId?: string) {
    if (notificationId) {
      const notification = await notificationRepository.findById(notificationId);
      // NOT-007: applies regardless - ownership hides other users' notifications.
      if (!notification || notification.userId !== userId) {
        throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
      }
      await notificationRepository.markRead(notificationId);
      return;
    }

    await prisma.notification.updateMany({
      where: { userId, status: { not: NotificationStatus.READ } },
      data: { status: NotificationStatus.READ },
    });
  },
};
