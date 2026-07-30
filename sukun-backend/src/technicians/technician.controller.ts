import { Response } from 'express';
import { technicianService, Requester } from './technician.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import {
  ListTechniciansQueryDto,
  RegisterTechnicianDto,
  TransferTechnicianDto,
  UpdateOwnStatusDto,
  UpdateTechnicianDto,
  UpdateTechnicianStatusDto,
} from './technician.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const technicianController = {
  async register(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as RegisterTechnicianDto;
    const technician = await technicianService.register(dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, technician, 201);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListTechniciansQueryDto;
    const technicians = await technicianService.list(toRequester(req), query);
    sendSuccess(res, technicians);
  },

  async summary(req: AuthenticatedRequest, res: Response) {
    const summary = await technicianService.summary(toRequester(req));
    sendSuccess(res, summary);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const technician = await technicianService.getById(req.params.id, toRequester(req));
    sendSuccess(res, technician);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateTechnicianDto;
    const technician = await technicianService.update(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, technician);
  },

  async resendInvitation(req: AuthenticatedRequest, res: Response) {
    const technician = await technicianService.resendInvitation(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, technician);
  },

  async transfer(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as TransferTechnicianDto;
    const technician = await technicianService.transfer(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, technician);
  },

  async setStatus(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateTechnicianStatusDto;
    const technician = await technicianService.setStatus(req.params.id, dto.active, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, technician);
  },

  async reviews(req: AuthenticatedRequest, res: Response) {
    const reviews = await technicianService.reviews(req.params.id, toRequester(req));
    sendSuccess(res, reviews);
  },

  async getMe(req: AuthenticatedRequest, res: Response) {
    const technician = await technicianService.getMe(toRequester(req));
    sendSuccess(res, technician);
  },

  async updateMyStatus(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateOwnStatusDto;
    const technician = await technicianService.updateMyStatus(toRequester(req), dto);
    sendSuccess(res, technician);
  },
};
