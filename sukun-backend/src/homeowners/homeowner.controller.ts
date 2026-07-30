import { Request, Response } from 'express';
import { homeownerService, Requester } from './homeowner.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { setRefreshCookie } from '../auth/refreshCookie';
import { ttlToDate } from '../auth/token.util';
import { env } from '../config/env';
import {
  ActivateHomeownerDto,
  CreateHomeownerDto,
  ExportHomeownersQueryDto,
  ListHomeownersQueryDto,
  TransferHomeownerDto,
  UpdateHomeownerDto,
  UpdateHomeownerStatusDto,
} from './homeowner.dto';
import { writeHomeownersCsv } from './homeowner.csv';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const homeownerController = {
  async register(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateHomeownerDto;
    const activation = await homeownerService.register(dto, req.user!.id, req.user!.companyId, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, activation, 201);
  },

  async activate(req: Request, res: Response) {
    const dto = req.body as ActivateHomeownerDto;
    const { session, refreshToken } = await homeownerService.activate(dto, {
      ipAddress: req.ip ?? null,
    });
    setRefreshCookie(res, refreshToken, ttlToDate(env.jwt.refreshTtl));
    sendSuccess(res, session);
  },

  async resend(req: AuthenticatedRequest, res: Response) {
    const activation = await homeownerService.resend(
      req.params.id,
      req.user!.id,
      req.user!.companyId,
      { ipAddress: req.ip ?? null },
    );
    sendSuccess(res, activation);
  },

  async getMyHome(req: AuthenticatedRequest, res: Response) {
    const myHome = await homeownerService.getMyHome(req.user!.id);
    sendSuccess(res, myHome);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListHomeownersQueryDto;
    const result = await homeownerService.list(toRequester(req), query);
    sendSuccess(res, result);
  },

  async getProfile(req: AuthenticatedRequest, res: Response) {
    const profile = await homeownerService.getProfile(req.params.id, toRequester(req));
    sendSuccess(res, profile);
  },

  async getByUnit(req: AuthenticatedRequest, res: Response) {
    const profile = await homeownerService.getByUnit(req.params.unitNumber, toRequester(req));
    sendSuccess(res, profile);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateHomeownerDto;
    const profile = await homeownerService.update(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, profile);
  },

  async resendInvitationForUser(req: AuthenticatedRequest, res: Response) {
    const activation = await homeownerService.resendInvitationForUser(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, activation);
  },

  async transfer(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as TransferHomeownerDto;
    const profile = await homeownerService.transfer(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, profile);
  },

  async setStatus(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateHomeownerStatusDto;
    const profile = await homeownerService.setStatus(req.params.id, dto.active, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, profile);
  },

  async export(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ExportHomeownersQueryDto;
    const rows = await homeownerService.listForExport(toRequester(req), query);
    const csv = writeHomeownersCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="homeowners.csv"');
    res.status(200).send(csv);
  },
};
