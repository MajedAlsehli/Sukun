import { Response } from 'express';
import { dashboardService } from './dashboard.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';

export const dashboardController = {
  async company(req: AuthenticatedRequest, res: Response) {
    const dashboard = await dashboardService.companyDashboard(req.user!.companyId);
    sendSuccess(res, dashboard);
  },

  async pm(req: AuthenticatedRequest, res: Response) {
    const dashboard = await dashboardService.pmDashboard(req.user!.id);
    sendSuccess(res, dashboard);
  },

  async technician(req: AuthenticatedRequest, res: Response) {
    const dashboard = await dashboardService.technicianDashboard(req.user!.id);
    sendSuccess(res, dashboard);
  },

  async homeowner(req: AuthenticatedRequest, res: Response) {
    const dashboard = await dashboardService.homeownerDashboard(req.user!.id);
    sendSuccess(res, dashboard);
  },
};
