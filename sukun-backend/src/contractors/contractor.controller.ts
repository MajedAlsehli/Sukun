import { Response } from 'express';
import { contractorService, Requester } from './contractor.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ListContractorsQueryDto } from './contractor.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const contractorController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const { q, page, pageSize } = res.locals.query as ListContractorsQueryDto;
    const result = await contractorService.list(toRequester(req), q, page, pageSize);
    sendSuccess(res, result);
  },
};
