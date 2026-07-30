import { Response } from 'express';
import { managerService, Requester } from './project-manager.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ListManagersQueryDto } from './project-manager.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const managerController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const { q, page, pageSize } = res.locals.query as ListManagersQueryDto;
    const result = await managerService.list(toRequester(req), q, page, pageSize);
    sendSuccess(res, result);
  },
};
