import { Response } from 'express';
import { visitService } from './visit.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import {
  CreateVisitDto,
  CreateVisitFeedbackDto,
  CreateVisitIssueDto,
  CreateVisitNoteDto,
  RescheduleVisitDto,
} from './visit.dto';

export const visitController = {
  async create(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateVisitDto;
    const visit = await visitService.create(dto, req.user!.id, { ipAddress: req.ip ?? null });
    sendSuccess(res, visit, 201);
  },

  async list(req: AuthenticatedRequest, res: Response) {
    const visits = await visitService.list(req.user!.id);
    sendSuccess(res, visits);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const visit = await visitService.getById(req.params.id, req.user!.id);
    sendSuccess(res, visit);
  },

  async checkIn(req: AuthenticatedRequest, res: Response) {
    const visit = await visitService.checkIn(req.params.id, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, visit);
  },

  async checkOut(req: AuthenticatedRequest, res: Response) {
    const visit = await visitService.checkOut(req.params.id, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, visit);
  },

  async cancel(req: AuthenticatedRequest, res: Response) {
    const visit = await visitService.cancel(req.params.id, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, visit);
  },

  async reschedule(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as RescheduleVisitDto;
    const visit = await visitService.reschedule(req.params.id, dto, req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, visit);
  },

  async addNote(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateVisitNoteDto;
    const note = await visitService.addNote(req.params.id, dto, req.user!.id);
    sendSuccess(res, note, 201);
  },

  async addIssue(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateVisitIssueDto;
    const issue = await visitService.addIssue(req.params.id, dto, req.user!.id);
    sendSuccess(res, issue, 201);
  },

  async submitFeedback(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateVisitFeedbackDto;
    const feedback = await visitService.submitFeedback(req.params.id, dto, req.user!.id);
    sendSuccess(res, feedback, 201);
  },
};
