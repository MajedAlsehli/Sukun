import { Response } from 'express';
import { inspectionReportService } from './inspection-report.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { CreateInspectionReportDto } from './inspection-report.dto';

export const inspectionReportController = {
  async create(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateInspectionReportDto;
    const report = await inspectionReportService.create(dto, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, report, 201);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const reports = await inspectionReportService.list(req.user!.id);
    sendSuccess(res, reports);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionReportService.getById(req.params.id, req.user!.id);
    sendSuccess(res, report);
  },
};
