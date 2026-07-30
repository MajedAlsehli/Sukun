import { prisma } from '../config/prisma';
import { BuildingStatus } from '@prisma/client';

export const buildingRepository = {
  findByProjectAndNumber(projectId: string, number: string) {
    return prisma.building.findUnique({ where: { projectId_number: { projectId, number } } });
  },

  findById(id: string) {
    return prisma.building.findUnique({
      where: { id },
      include: { _count: { select: { units: true } } },
    });
  },

  findAllByProject(projectId: string) {
    return prisma.building.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { units: true } } },
    });
  },

  create(input: { projectId: string; name: string; number: string }) {
    return prisma.building.create({ data: input });
  },

  update(id: string, data: { name?: string; number?: string; floors?: number }) {
    return prisma.building.update({ where: { id }, data });
  },

  updateStatus(id: string, status: BuildingStatus) {
    return prisma.building.update({ where: { id }, data: { status } });
  },

  updateIsActive(id: string, isActive: boolean) {
    return prisma.building.update({ where: { id }, data: { isActive } });
  },

  archive(id: string) {
    return prisma.building.update({
      where: { id },
      data: { status: BuildingStatus.ARCHIVED, isActive: false },
    });
  },
};
