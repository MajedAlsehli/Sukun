import { Prisma, UnitStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

// Task 4: cross-cutting read-only aggregations for RE3's project workspace -
// same rationale as dashboards/dashboard.repository.ts (these queries don't
// naturally belong to Project/Building/Unit's own CRUD repositories).
export const workspaceRepository = {
  async kpis(projectId: string) {
    const unitFilter = { building: { projectId } };
    const [buildingsCount, unitsCount, occupiedCount, warrantyActiveCount] = await Promise.all([
      prisma.building.count({ where: { projectId } }),
      prisma.unit.count({ where: unitFilter }),
      prisma.unit.count({ where: { ...unitFilter, status: UnitStatus.OCCUPIED } }),
      prisma.warranty.count({ where: { unit: unitFilter, endDate: { gt: new Date() } } }),
    ]);
    return { buildingsCount, unitsCount, occupiedCount, warrantyActiveCount };
  },

  async timeline(projectId: string) {
    const unitFilter = { building: { projectId } };
    const [firstOwnership, firstWarranty] = await Promise.all([
      prisma.ownership.findFirst({ where: { unit: unitFilter }, orderBy: { startDate: 'asc' } }),
      prisma.warranty.findFirst({ where: { unit: unitFilter }, orderBy: { startDate: 'asc' } }),
    ]);
    return {
      firstHandoverAt: firstOwnership?.startDate ?? null,
      warrantyActivatedAt: firstWarranty?.startDate ?? null,
    };
  },

  async findUnitsByProject(
    projectId: string,
    filters: { buildingId?: string; number?: string; status?: UnitStatus },
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.UnitWhereInput = {
      building: { projectId, ...(filters.buildingId ? { id: filters.buildingId } : {}) },
      ...(filters.number ? { number: { contains: filters.number } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        include: {
          building: { select: { id: true, name: true } },
          ownerships: { where: { status: 'ACTIVE' }, include: { user: true }, take: 1 },
          warranty: true,
        },
        orderBy: [{ building: { number: 'asc' } }, { floor: 'asc' }, { number: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.unit.count({ where }),
    ]);

    return { items, total };
  },

  // RE3 owners tab: every unit in the project with either an active
  // ownership or a homeowner-activation record (pending/expired) - real data
  // from Task 3's models, not a fabricated placeholder. Full management
  // (transfer/resend/status) is Task 5's RE4 job; this is read-only.
  async findHomeownerRows(projectId: string) {
    const unitFilter = { building: { projectId } };
    const [ownerships, activations] = await Promise.all([
      prisma.ownership.findMany({
        where: { unit: unitFilter, status: 'ACTIVE' },
        include: { user: true, unit: { include: { building: true } } },
      }),
      prisma.homeownerActivation.findMany({
        where: { unit: unitFilter },
        include: { user: true, unit: { include: { building: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { ownerships, activations };
  },

  async projectActivity(projectId: string, buildingIds: string[], limit: number) {
    return prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'Project', entityId: projectId },
          ...(buildingIds.length > 0 ? [{ entity: 'Building', entityId: { in: buildingIds } }] : []),
        ],
      },
      include: { user: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },

  buildingIdsByProject(projectId: string) {
    return prisma.building.findMany({ where: { projectId }, select: { id: true } });
  },
};
