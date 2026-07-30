import { Response } from 'express';
import { discoveryService } from './discovery.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ListDiscoveryProjectsQueryDto } from './discovery.dto';

export const discoveryController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListDiscoveryProjectsQueryDto;
    const result = await discoveryService.list(req.user!.id, query);
    sendSuccess(res, result);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const project = await discoveryService.getById(req.params.id, req.user!.id);
    sendSuccess(res, project);
  },

  async getRecommendations(req: AuthenticatedRequest, res: Response) {
    const result = await discoveryService.getRecommendations(req.user!.id);
    sendSuccess(res, result);
  },

  async save(req: AuthenticatedRequest, res: Response) {
    const result = await discoveryService.save(req.user!.id, req.params.projectId);
    sendSuccess(res, result, 201);
  },

  async unsave(req: AuthenticatedRequest, res: Response) {
    const result = await discoveryService.unsave(req.user!.id, req.params.projectId);
    sendSuccess(res, result);
  },
};
