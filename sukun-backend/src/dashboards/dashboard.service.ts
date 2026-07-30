import { dashboardRepository } from './dashboard.repository';
import { technicianRepository } from '../technicians/technician.repository';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { notificationRepository } from '../notifications/notification.repository';
import { toNotificationDto } from '../notifications/notification.mapper';
import { AuthorizationError } from '../shared/errors';

export const dashboardService = {
  // GET /api/company/dashboard - "Portfolio KPIs, Projects, Technicians, Homeowners, Reports"
  async companyDashboard(companyId: string | null) {
    if (!companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }
    const [portfolio, technicians] = await Promise.all([
      dashboardRepository.companyPortfolio(companyId),
      dashboardRepository.technicians(companyId),
    ]);

    return {
      kpis: {
        projectsCount: portfolio.projectsCount,
        buildingsCount: portfolio.buildingsCount,
        unitsCount: portfolio.unitsCount,
        techniciansCount: portfolio.techniciansCount,
        homeownersCount: portfolio.homeownersCount,
        openInspectionReports: portfolio.openInspectionReports,
        openWarrantyReports: portfolio.openWarrantyReports,
      },
      projects: portfolio.projects.map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.status })),
      technicians: technicians.map((t) => ({ id: t.id, name: t.user.name, status: t.status })),
    };
  },

  // GET /api/pm/dashboard - "KPIs, Open Reports, Critical Reports, Technician Performance"
  async pmDashboard(requesterUserId: string) {
    const pm = await projectManagerRepository.findByUserId(requesterUserId);
    // Task 4 (decisions.md E3): projectId is now nullable - a manager can
    // exist, invited/activated, in the unassigned picker pool before ever
    // being assigned to a project.
    if (!pm || !pm.projectId) {
      throw new AuthorizationError('This account is not registered as a project manager.');
    }

    const overview = await dashboardRepository.pmProjectOverview(pm.projectId);

    return {
      kpis: {
        openInspectionReports: overview.openInspectionReports,
        criticalInspectionReports: overview.criticalInspectionReports,
      },
      technicianPerformance: overview.technicians.map((t) => ({
        id: t.id,
        name: t.user.name,
        status: t.status,
        assignedRepairsCount: t.repairs.length,
        completedRepairsCount: t.repairs.filter((r) => r.status === 'COMPLETED').length,
      })),
      recentReports: overview.recentReports.map((r) => ({
        id: r.id,
        status: r.status,
        priority: r.priority,
        createdAt: r.createdAt,
      })),
    };
  },

  // GET /api/technician/dashboard (13_Frontend_Backend_Mapping.md)
  async technicianDashboard(requesterUserId: string) {
    const technician = await technicianRepository.findByUserId(requesterUserId);
    if (!technician) {
      throw new AuthorizationError('This account is not registered as a technician.');
    }

    const repairs = await dashboardRepository.technicianAssignedRepairs(technician.id);

    return {
      assignedRepairs: repairs
        .filter((r) => r.status !== 'COMPLETED')
        .map((r) => ({ id: r.id, reportId: r.reportId, status: r.status })),
      repairHistory: repairs
        .filter((r) => r.status === 'COMPLETED')
        .map((r) => ({ id: r.id, reportId: r.reportId, completedAt: r.completedAt })),
    };
  },

  // GET /api/homeowner/dashboard (13_Frontend_Backend_Mapping.md)
  async homeownerDashboard(requesterUserId: string) {
    const [ownerships, notifications] = await Promise.all([
      dashboardRepository.homeownerOwnerships(requesterUserId),
      notificationRepository.findAllByUser(requesterUserId),
    ]);

    return {
      ownerships: ownerships.map((o) => ({
        id: o.id,
        unitId: o.unitId,
        unitNumber: o.unit.number,
        startDate: o.startDate,
      })),
      notifications: notifications.slice(0, 10).map(toNotificationDto),
    };
  },
};
