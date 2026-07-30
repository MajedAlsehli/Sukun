import { Response } from 'express';
import { repairService } from './repair.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ApproveRepairDto, AssignRepairDto, UploadRepairImagesDto } from './repair.dto';

export const repairController = {
  async assign(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as AssignRepairDto;
    const repair = await repairService.assign(dto, req.user!.id, { ipAddress: req.ip ?? null });
    sendSuccess(res, repair, 201);
  },

  async start(req: AuthenticatedRequest, res: Response) {
    const repair = await repairService.start(req.params.id, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, repair);
  },

  async uploadBeforeImages(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UploadRepairImagesDto;
    const repair = await repairService.uploadImages(req.params.id, 'BEFORE', dto.images, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, repair);
  },

  async uploadAfterImages(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UploadRepairImagesDto;
    const repair = await repairService.uploadImages(req.params.id, 'AFTER', dto.images, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, repair);
  },

  async complete(req: AuthenticatedRequest, res: Response) {
    const repair = await repairService.complete(req.params.id, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, repair);
  },

  async approve(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as ApproveRepairDto;
    const repair = await repairService.approve(
      req.params.id,
      dto.approved,
      dto.reason,
      req.user!.id,
      { ipAddress: req.ip ?? null },
    );
    sendSuccess(res, repair);
  },
};
