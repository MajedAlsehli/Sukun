import { Response } from 'express';
import { companyService, Requester } from './company.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const companyController = {
  async overview(req: AuthenticatedRequest, res: Response) {
    const result = await companyService.overview(toRequester(req));
    sendSuccess(res, result);
  },

  async projectsSummary(req: AuthenticatedRequest, res: Response) {
    const result = await companyService.projectsSummary(toRequester(req));
    sendSuccess(res, result);
  },

  async activity(req: AuthenticatedRequest, res: Response) {
    const result = await companyService.activity(toRequester(req));
    sendSuccess(res, result);
  },
};
