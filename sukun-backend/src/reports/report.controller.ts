import { Response } from 'express';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { reportService, Principal } from './report.service';
import {
  AnalyzeReportDto,
  ApproveReportDto,
  CreateReportDto,
  ListReportsQueryDto,
  ListRepairHistoryQueryDto,
  ListTechnicianTasksQueryDto,
  ReopenReportDto,
  StartRepairDto,
  SubmitRepairDto,
  UploadReportMediaDto,
  WarrantyCheckDto,
} from './report.dto';

function principalOf(req: AuthenticatedRequest): Principal {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

function ctxOf(req: AuthenticatedRequest) {
  return { ipAddress: req.ip ?? null };
}

export const reportController = {
  async providers(_req: AuthenticatedRequest, res: Response) {
    sendSuccess(res, reportService.providerStatus());
  },

  async uploadMedia(req: AuthenticatedRequest, res: Response) {
    const result = await reportService.uploadMedia(req.body as UploadReportMediaDto, principalOf(req));
    sendSuccess(res, result, 201);
  },

  async analyze(req: AuthenticatedRequest, res: Response) {
    const result = await reportService.analyze(req.body as AnalyzeReportDto, principalOf(req));
    sendSuccess(res, result);
  },

  async warrantyCheck(req: AuthenticatedRequest, res: Response) {
    const result = await reportService.warrantyCheck(req.body as WarrantyCheckDto, principalOf(req));
    sendSuccess(res, result);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const result = await reportService.create(req.body as CreateReportDto, principalOf(req), ctxOf(req));
    sendSuccess(res, result, 201);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListReportsQueryDto;
    sendSuccess(res, await reportService.list(query, principalOf(req)));
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    sendSuccess(res, await reportService.getById(req.params.id, principalOf(req)));
  },

  async getTimeline(req: AuthenticatedRequest, res: Response) {
    sendSuccess(res, await reportService.getTimeline(req.params.id, principalOf(req)));
  },

  async start(req: AuthenticatedRequest, res: Response) {
    const dto = (req.body ?? {}) as StartRepairDto;
    sendSuccess(res, await reportService.start(req.params.id, dto, principalOf(req), ctxOf(req)));
  },

  async submitRepair(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as SubmitRepairDto;
    sendSuccess(res, await reportService.submitRepair(req.params.id, dto, principalOf(req), ctxOf(req)));
  },

  async approve(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as ApproveReportDto;
    sendSuccess(res, await reportService.approve(req.params.id, dto, principalOf(req), ctxOf(req)));
  },

  async reopen(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as ReopenReportDto;
    sendSuccess(res, await reportService.reopen(req.params.id, dto, principalOf(req), ctxOf(req)));
  },

  async technicianTasks(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListTechnicianTasksQueryDto;
    sendSuccess(res, await reportService.technicianTasks(query, principalOf(req)));
  },

  async technicianTaskSummary(req: AuthenticatedRequest, res: Response) {
    sendSuccess(res, await reportService.technicianTaskSummary(principalOf(req)));
  },

  async technicianRepairHistory(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListRepairHistoryQueryDto;
    sendSuccess(res, await reportService.technicianRepairHistory(query, principalOf(req)));
  },

  // decisions.md I9: authenticated by a shared secret, not by a user session.
  // Task 10 wires Vercel Cron to it (vercel.json, every 15 minutes). Vercel's
  // cron runner presents `Authorization: Bearer $CRON_SECRET`, which is why the
  // bearer form is accepted here - set CRON_SECRET to the same value as
  // ROUTING_RETRY_SECRET. The secret is never logged and never returned.
  async retryRouting(req: AuthenticatedRequest, res: Response) {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const custom = req.headers['x-routing-retry-secret'];
    const secret = bearer ?? (typeof custom === 'string' ? custom : undefined);
    sendSuccess(res, await reportService.retryRouting(secret));
  },
};
