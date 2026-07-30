import { Response } from 'express';
import { workspaceService, Requester } from './workspace.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ListProjectUnitsQueryDto } from './workspace.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const workspaceController = {
  async getWorkspace(req: AuthenticatedRequest, res: Response) {
    const result = await workspaceService.getWorkspace(req.params.id, toRequester(req));
    sendSuccess(res, result);
  },

  async listUnits(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListProjectUnitsQueryDto;
    const result = await workspaceService.listUnits(req.params.id, toRequester(req), query);
    sendSuccess(res, result);
  },

  async listHomeowners(req: AuthenticatedRequest, res: Response) {
    const result = await workspaceService.listHomeowners(req.params.id, toRequester(req));
    sendSuccess(res, result);
  },

  async listActivity(req: AuthenticatedRequest, res: Response) {
    const result = await workspaceService.listActivity(req.params.id, toRequester(req));
    sendSuccess(res, result);
  },
};
