import { prisma } from '../config/prisma';
import { Prisma, UnitStatus } from '@prisma/client';

export const unitRepository = {
  findByBuildingAndNumber(buildingId: string, number: string) {
    return prisma.unit.findUnique({ where: { buildingId_number: { buildingId, number } } });
  },

  // Task 5: RE4 wizard step 2's vacant-unit picker - AVAILABLE units,
  // company-scoped, optionally narrowed to one project/building.
  findVacant(companyId: string, filters: { projectId?: string; buildingId?: string }) {
    const where: Prisma.UnitWhereInput = {
      status: UnitStatus.AVAILABLE,
      building: {
        ...(filters.buildingId ? { id: filters.buildingId } : {}),
        project: {
          companyId,
          ...(filters.projectId ? { id: filters.projectId } : {}),
        },
      },
    };
    return prisma.unit.findMany({
      where,
      include: { building: { include: { project: true } } },
      orderBy: [{ building: { number: 'asc' } }, { floor: 'asc' }, { number: 'asc' }],
    });
  },

  findById(id: string) {
    return prisma.unit.findUnique({ where: { id } });
  },

  findAllByBuilding(buildingId: string) {
    return prisma.unit.findMany({
      where: { buildingId },
      orderBy: { createdAt: 'desc' },
    });
  },

  create(input: { buildingId: string; number: string; floor: number; type: string }) {
    return prisma.unit.create({ data: input });
  },

  update(id: string, data: { number?: string; floor?: number; type?: string }) {
    return prisma.unit.update({ where: { id }, data });
  },

  updateStatus(id: string, status: UnitStatus) {
    return prisma.unit.update({ where: { id }, data: { status } });
  },

  countByProject(projectId: string) {
    return prisma.unit.count({ where: { building: { projectId } } });
  },
};
