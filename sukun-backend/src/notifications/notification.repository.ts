import { prisma } from '../config/prisma';
import { NotificationStatus, NotificationType } from '@prisma/client';

export const notificationRepository = {
  create(input: { userId: string; title: string; body: string; type?: NotificationType }) {
    return prisma.notification.create({ data: input });
  },

  findAllByUser(userId: string) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  },

  findById(id: string) {
    return prisma.notification.findUnique({ where: { id } });
  },

  markRead(id: string) {
    return prisma.notification.update({ where: { id }, data: { status: NotificationStatus.READ } });
  },

  markSent(id: string) {
    return prisma.notification.update({ where: { id }, data: { status: NotificationStatus.SENT } });
  },
};
