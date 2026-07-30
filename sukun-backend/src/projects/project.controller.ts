import { Response } from 'express';
import { projectService, Requester } from './project.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  ReassignContractorDto,
  ReassignManagerDto,
  UpdateProjectDto,
  UpdateProjectStatusDto,
  UploadCoverDto,
} from './project.dto';

function toRequester(req: AuthenticatedRequest): Requester {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

export const projectController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListProjectsQueryDto;
    const result = await projectService.list(toRequester(req), query);
    sendSuccess(res, result);
  },

  async getById(req: AuthenticatedRequest, res: Response) {
    const project = await projectService.getById(req.params.id, toRequester(req));
    sendSuccess(res, project);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as CreateProjectDto;
    const project = await projectService.create(dto, toRequester(req), { ipAddress: req.ip ?? null });
    sendSuccess(res, project, 201);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateProjectDto;
    const project = await projectService.update(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async publish(req: AuthenticatedRequest, res: Response) {
    const project = await projectService.publish(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async updateStatus(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UpdateProjectStatusDto;
    const project = await projectService.updateStatus(req.params.id, dto.active, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async archive(req: AuthenticatedRequest, res: Response) {
    const project = await projectService.archive(req.params.id, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async reassignManager(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as ReassignManagerDto;
    const project = await projectService.reassignManager(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async reassignContractor(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as ReassignContractorDto;
    const project = await projectService.reassignContractor(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },

  async uploadCover(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UploadCoverDto;
    const project = await projectService.uploadCover(req.params.id, dto, toRequester(req), {
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, project);
  },
};
