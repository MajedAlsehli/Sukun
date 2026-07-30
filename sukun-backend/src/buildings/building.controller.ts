import { Response } from 'express';
import { buildingService, Requester } from './building.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { CreateBuildingDto, UpdateBuildingDto, UpdateBuildingStatusDto } from './building.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const buildingController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const buildings = await buildingService.list(req.params.projectId, toRequester(req));
    sendSuccess(res, buildings);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateBuildingDto;
    const building = await buildingService.create(req.params.projectId, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, building, 201);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const building = await buildingService.getById(req.params.id, toRequester(req));
    sendSuccess(res, building);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateBuildingDto;
    const building = await buildingService.update(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, building);
  },

  async publish(req: AuthenticatedRequest, res: Response) {
    const building = await buildingService.publish(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, building);
  },

  async updateStatus(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateBuildingStatusDto;
    const building = await buildingService.updateStatus(req.params.id, dto.active, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, building);
  },

  async archive(req: AuthenticatedRequest, res: Response) {
    const building = await buildingService.archive(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, building);
  },
};
