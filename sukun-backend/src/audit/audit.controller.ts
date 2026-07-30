import { Response } from 'express';
import { auditService } from './audit.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { ListAuditLogsQueryDto } from './audit.dto';

export const auditController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListAuditLogsQueryDto;
    const result = await auditService.list(query);
    sendSuccess(res, result);
  },
};
