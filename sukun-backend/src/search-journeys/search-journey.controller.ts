import { Response } from 'express';
import { searchJourneyService } from './search-journey.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { CancelSearchJourneyDto } from './search-journey.dto';

export const searchJourneyController = {
  async getActive(req: AuthenticatedRequest, res: Response) {
    const journey = await searchJourneyService.getActive(req.user!.id);
    sendSuccess(res, journey);
  },

  async getHistory(req: AuthenticatedRequest, res: Response) {
    const journeys = await searchJourneyService.getHistory(req.user!.id);
    sendSuccess(res, journeys);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const journey = await searchJourneyService.startNew(req.user!.id, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, journey, 201);
  },

  async cancel(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CancelSearchJourneyDto;
    const journey = await searchJourneyService.cancel(req.user!.id, req.params.id, dto.reason, {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, journey);
  },
};
