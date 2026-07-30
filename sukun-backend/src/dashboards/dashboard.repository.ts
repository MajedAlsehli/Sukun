import { prisma } from '../config/prisma';

// Dashboards are inherently cross-cutting read-only aggregations - these
// queries don't naturally belong to any single existing module's repository.
export const dashboardRepository = {
  async companyPortfolio(companyId: string) {
    const [projectsCount, buildingsCount, unitsCount, techniciansCount, homeownersCount, openInspectionReports, openWarrantyReports, projects] =
      await Promise.all([
        prisma.project.count({ where: { companyId } }),
        prisma.building.count({ where: { project: { companyId } } }),
        prisma.unit.count({ where: { building: { project: { companyId } } } }),
        prisma.technician.count({ where: { project: { companyId } } }),
        prisma.ownership.count({
          where: { status: 'ACTIVE', unit: { building: { project: { companyId } } } },
        }),
        prisma.inspectionReport.count({
          where: { status: { not: 'CLOSED' }, unit: { building: { project: { companyId } } } },
        }),
        prisma.warrantyReport.count({
          where: { status: { not: 'CLOSED' }, unit: { building: { project: { companyId } } } },
        }),
        prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);

    return {
      projectsCount,
      buildingsCount,
      unitsCount,
      techniciansCount,
      homeownersCount,
      openInspectionReports,
      openWarrantyReports,
      projects,
    };
  },

  async technicians(companyId: string) {
    return prisma.technician.findMany({ where: { project: { companyId } }, include: { user: true } });
  },

  async pmProjectOverview(projectId: string) {
    const [openInspectionReports, criticalInspectionReports, technicians, recentReports] = await Promise.all([
      prisma.inspectionReport.count({
        where: { status: { not: 'CLOSED' }, unit: { building: { projectId } } },
      }),
      prisma.inspectionReport.count({
        where: { priority: 'CRITICAL', status: { not: 'CLOSED' }, unit: { building: { projectId } } },
      }),
      prisma.technician.findMany({ where: { projectId }, include: { user: true, repairs: true } }),
      prisma.inspectionReport.findMany({
        where: { unit: { building: { projectId } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { openInspectionReports, criticalInspectionReports, technicians, recentReports };
  },

  async technicianAssignedRepairs(technicianId: string) {
    return prisma.repair.findMany({
      where: { technicianId },
      include: { images: { include: { file: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async homeownerOwnerships(userId: string) {
    return prisma.ownership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { unit: true },
    });
  },
};
