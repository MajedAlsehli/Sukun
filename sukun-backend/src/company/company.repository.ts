import { ReportStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { mapInBatches } from '../shared/batch';
import { ACTIVE_REPORT_STATUSES } from '../reports/report.types';

// Task 4 (decisions.md B3/E8): company-wide read-only aggregations for RE1 -
// same cross-cutting rationale as dashboards/dashboard.repository.ts.
//
// Task 8 (decisions.md I14): `openReportsCount`/`closedReportsCount` now mean
// CANONICAL POST-OWNERSHIP reports. The pre-ownership InspectionReport totals
// and any not-yet-mirrored legacy WarrantyReport totals moved into their own
// explicitly-named `legacy*` fields rather than being summed in - RE1's report
// KPI is about the maintenance loop, and mixing a sales-journey inspection into
// it was always an approximation forced by B1 being unresolved.
export const companyRepository = {
  async kpis(companyId: string) {
    const unitFilter = { building: { project: { companyId } } };
    const companyScope = { project: { companyId } };

    // Task 10 closeout (decisions.md K4): these ELEVEN counts used to run under
    // one `Promise.all`, i.e. eleven simultaneous connections from a single
    // request. Against a pooled Postgres that is what makes RE1's KPI strip the
    // first thing to fail under load - it 500'd in production while every
    // narrower endpoint on the same screen succeeded. Batched to three at a
    // time, exactly as J15 requires and as `projectsSummary` already does.
    const [
      projectsCount,
      buildingsCount,
      unitsCount,
      occupiedCount,
      homeownersCount,
      openCanonical,
      closedCanonical,
      openInspection,
      openWarranty,
      closedInspection,
      closedWarranty,
    ] = await mapInBatches(
      [
        () => prisma.project.count({ where: { companyId } }),
        () => prisma.building.count({ where: { project: { companyId } } }),
        () => prisma.unit.count({ where: unitFilter }),
        () => prisma.unit.count({ where: { ...unitFilter, status: 'OCCUPIED' } }),
        () => prisma.ownership.count({ where: { status: 'ACTIVE', unit: unitFilter } }),
        () => prisma.report.count({ where: { ...companyScope, status: { in: ACTIVE_REPORT_STATUSES } } }),
        () => prisma.report.count({ where: { ...companyScope, status: ReportStatus.CLOSED } }),
        () => prisma.inspectionReport.count({ where: { status: { not: 'CLOSED' }, unit: unitFilter } }),
        // `canonicalReport: null` keeps a backfilled legacy row from being
        // counted twice - once here and once as its canonical mirror.
        () =>
          prisma.warrantyReport.count({
            where: { status: { not: 'CLOSED' }, unit: unitFilter, canonicalReport: { is: null } },
          }),
        () => prisma.inspectionReport.count({ where: { status: 'CLOSED', unit: unitFilter } }),
        () =>
          prisma.warrantyReport.count({
            where: { status: 'CLOSED', unit: unitFilter, canonicalReport: { is: null } },
          }),
      ],
      (run) => run(),
    );

    return {
      projectsCount,
      buildingsCount,
      unitsCount,
      occupiedCount,
      homeownersCount,
      openReportsCount: openCanonical,
      closedReportsCount: closedCanonical,
      legacyOpenReportsCount: openInspection + openWarranty,
      legacyClosedReportsCount: closedInspection + closedWarranty,
    };
  },

  projectsSummary(companyId: string) {
    return prisma.project.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { buildings: true } },
        projectManager: { include: { user: true } },
        primaryContractor: true,
      },
    });
  },

  async activity(companyId: string, limit: number) {
    const projects = await prisma.project.findMany({ where: { companyId }, select: { id: true } });
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) return [];

    const buildings = await prisma.building.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const buildingIds = buildings.map((b) => b.id);

    return prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'Project', entityId: { in: projectIds } },
          ...(buildingIds.length > 0 ? [{ entity: 'Building', entityId: { in: buildingIds } }] : []),
        ],
      },
      include: { user: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },
};
