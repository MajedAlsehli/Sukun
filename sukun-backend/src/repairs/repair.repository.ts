import { prisma } from '../config/prisma';
import { RepairImageType, RepairStatus } from '@prisma/client';

const withImages = { images: { include: { file: true } } } as const;

export const repairRepository = {
  create(input: { reportId: string; technicianId: string }) {
    return prisma.repair.create({ data: input, include: withImages });
  },

  findById(id: string) {
    return prisma.repair.findUnique({ where: { id }, include: withImages });
  },

  findByReportId(reportId: string) {
    return prisma.repair.findUnique({ where: { reportId }, include: withImages });
  },

  addImages(repairId: string, type: RepairImageType, fileIds: string[]) {
    return prisma.repairImage.createMany({
      data: fileIds.map((fileId) => ({ repairId, fileId, type })),
    });
  },

  updateStatus(
    id: string,
    status: RepairStatus,
    timestamps: { startedAt?: Date; completedAt?: Date } = {},
  ) {
    return prisma.repair.update({ where: { id }, data: { status, ...timestamps }, include: withImages });
  },
};
