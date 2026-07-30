import { Notification } from '@prisma/client';

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  createdAt: Date;
}

export function toNotificationDto(entity: Notification): NotificationDto {
  return {
    id: entity.id,
    title: entity.title,
    body: entity.body,
    type: entity.type,
    status: entity.status,
    createdAt: entity.createdAt,
  };
}
