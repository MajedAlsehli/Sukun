import { Response } from 'express';
import { unitService, Requester } from './unit.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { CreateUnitDto, ListVacantUnitsQueryDto, UpdateUnitDto } from './unit.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const unitController = {
  async listVacant(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListVacantUnitsQueryDto;
    const units = await unitService.listVacant(toRequester(req), query);
    sendSuccess(res, units);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const units = await unitService.list(req.params.buildingId, toRequester(req));
    sendSuccess(res, units);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateUnitDto;
    const unit = await unitService.create(req.params.buildingId, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, unit, 201);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const unit = await unitService.getById(req.params.id, toRequester(req));
    sendSuccess(res, unit);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateUnitDto;
    const unit = await unitService.update(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, unit);
  },
};
