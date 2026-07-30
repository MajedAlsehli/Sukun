import { prisma } from '../config/prisma';
import { WarrantyReportStatus } from '@prisma/client';

const withImages = {
  images: { include: { file: true } },
  aiResults: { orderBy: { createdAt: 'desc' as const } },
} as const;

export const warrantyRepository = {
  // Default 2-year term/coverage - no policy-configuration endpoint exists
  // anywhere in the docs (see schema.prisma comment on the Warranty model).
  createDefault(unitId: string, startDate: Date = new Date()) {
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 2);
    return prisma.warranty.create({
      data: { unitId, startDate, endDate, coverage: 'Standard' },
    });
  },

  findByUnitId(unitId: string) {
    return prisma.warranty.findUnique({ where: { unitId } });
  },

  findById(id: string) {
    return prisma.warranty.findUnique({ where: { id } });
  },

  createReport(input: {
    warrantyId: string;
    unitId: string;
    homeownerId: string;
    referenceNumber: string;
    category: string;
    location: string;
    notes?: string;
    fileIds: string[];
  }) {
    return prisma.warrantyReport.create({
      data: {
        warrantyId: input.warrantyId,
        unitId: input.unitId,
        homeownerId: input.homeownerId,
        referenceNumber: input.referenceNumber,
        category: input.category,
        location: input.location,
        notes: input.notes,
        status: WarrantyReportStatus.AI_ANALYSIS,
        images: { create: input.fileIds.map((fileId, index) => ({ fileId, order: index })) },
      },
      include: withImages,
    });
  },

  findReportById(id: string) {
    return prisma.warrantyReport.findUnique({ where: { id }, include: withImages });
  },

  findReportsByHomeowner(homeownerId: string) {
    return prisma.warrantyReport.findMany({
      where: { homeownerId },
      include: withImages,
      orderBy: { createdAt: 'desc' },
    });
  },

  updateReportAfterAnalysis(
    id: string,
    data: { status: WarrantyReportStatus; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' },
  ) {
    return prisma.warrantyReport.update({ where: { id }, data });
  },
};
