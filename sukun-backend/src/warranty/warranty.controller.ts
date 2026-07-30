import { Response } from 'express';
import { warrantyService } from './warranty.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { CreateWarrantyReportDto } from './warranty.dto';

export const warrantyController = {
  async getByUnit(req: AuthenticatedRequest, res: Response) {
    const { unitId } = res.locals.query as { unitId: string };
    const warranty = await warrantyService.getByUnit(unitId, req.user!.id);
    sendSuccess(res, warranty);
  },

  async createReport(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateWarrantyReportDto;
    const report = await warrantyService.createReport(dto, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, report, 201);
  },

  async listReports(req: AuthenticatedRequest, res: Response) {
    const reports = await warrantyService.listReports(req.user!.id);
    sendSuccess(res, reports);
  },

  async getReportById(req: AuthenticatedRequest, res: Response) {
    const report = await warrantyService.getReportById(req.params.id, req.user!.id);
    sendSuccess(res, report);
  },
};
