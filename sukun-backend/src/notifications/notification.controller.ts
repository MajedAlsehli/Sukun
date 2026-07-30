import { Response } from 'express';
import { notificationService } from './notification.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { MarkReadDto } from './notification.dto';

export const notificationController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const notifications = await notificationService.list(req.user!.id);
    sendSuccess(res, notifications);
  },

  async markRead(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as MarkReadDto;
    await notificationService.markRead(req.user!.id, dto.notificationId);
    sendSuccess(res, { marked: true });
  },
};
