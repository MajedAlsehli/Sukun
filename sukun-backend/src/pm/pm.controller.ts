import { Response } from 'express';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { pmService, Principal } from './pm.service';
import { ListReportsQueryDto } from '../reports/report.dto';
import {
  PmActivityQueryDto,
  PmCopilotChatDto,
  PmCopilotSummaryDto,
  PmScopeQueryDto,
} from './pm.dto';

function principalOf(req: AuthenticatedRequest): Principal {
  return { id: req.user!.id, role: req.user!.role, companyId: req.user!.companyId };
}

// `validateQuery` puts the PARSED, coerced query on `res.locals.query` - never
// back onto `req.query` (which is a string-valued getter). Reading `req.query`
// here instead was a real defect the browser pass caught: `pageSize` arrived as
// the string "25" and `page` as undefined, so Prisma rejected `take`/`skip` and
// every PM report list 500'd. Read `res.locals.query`, exactly as
// reportController.list does.
export const pmController = {
  async overview(_req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as PmScopeQueryDto;
    sendSuccess(res, await pmService.overview(principalOf(_req), query.projectId));
  },

  async alerts(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as PmScopeQueryDto;
    sendSuccess(res, await pmService.alerts(principalOf(req), query.projectId));
  },

  async activity(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as PmActivityQueryDto;
    sendSuccess(
      res,
      await pmService.activity(principalOf(req), {
        limit: query.limit,
        projectId: query.projectId,
      }),
    );
  },

  async reports(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as ListReportsQueryDto;
    sendSuccess(res, await pmService.reports(principalOf(req), query));
  },

  async contractors(req: AuthenticatedRequest, res: Response) {
    const query = res.locals.query as PmScopeQueryDto;
    sendSuccess(res, await pmService.contractors(principalOf(req), query.projectId));
  },

  async contractorPerformance(req: AuthenticatedRequest, res: Response) {
    sendSuccess(
      res,
      await pmService.contractorPerformance(principalOf(req), req.params.technicianId),
    );
  },

  async contractorInsight(req: AuthenticatedRequest, res: Response) {
    sendSuccess(res, await pmService.contractorInsight(principalOf(req), req.params.technicianId));
  },

  async copilotSummary(req: AuthenticatedRequest, res: Response) {
    // Body is validated but currently carries only optional UI context - the
    // snapshot is built server-side from the principal (decisions.md J12).
    void (req.body as PmCopilotSummaryDto);
    sendSuccess(res, await pmService.copilotSummary(principalOf(req)));
  },

  async copilotChat(req: AuthenticatedRequest, res: Response) {
    const body = req.body as PmCopilotChatDto;
    sendSuccess(
      res,
      await pmService.copilotChat(principalOf(req), {
        message: body.message,
        context: body.context ?? null,
      }),
    );
  },
};
