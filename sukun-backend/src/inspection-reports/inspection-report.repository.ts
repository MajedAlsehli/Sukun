import { prisma } from '../config/prisma';
import { InspectionPriority, InspectionReportStatus } from '@prisma/client';

const withImages = {
  images: { include: { file: true } },
  aiResults: { orderBy: { createdAt: 'desc' as const } },
} as const;

export const inspectionReportRepository = {
  create(input: {
    visitId: string;
    unitId: string;
    searchJourneyId: string;
    location: string;
    notes?: string;
    fileIds: string[];
  }) {
    return prisma.inspectionReport.create({
      data: {
        visitId: input.visitId,
        unitId: input.unitId,
        searchJourneyId: input.searchJourneyId,
        location: input.location,
        notes: input.notes,
        status: InspectionReportStatus.AI_PROCESSING,
        images: {
          create: input.fileIds.map((fileId, index) => ({ fileId, order: index })),
        },
      },
      include: withImages,
    });
  },

  findById(id: string) {
    return prisma.inspectionReport.findUnique({ where: { id }, include: withImages });
  },

  // Reports don't have a direct userId column (created_by is implied through
  // the Visit, not a separate field per 07_Database_Architecture.md) -
  // "Current User Reports" (08_API_Specification.md) means reports whose
  // Visit belongs to the requester.
  findAllByUser(userId: string) {
    return prisma.inspectionReport.findMany({
      where: { visit: { userId } },
      include: withImages,
      orderBy: { createdAt: 'desc' },
    });
  },

  updateAfterAnalysis(
    id: string,
    data: { status: InspectionReportStatus; priority?: InspectionPriority },
  ) {
    return prisma.inspectionReport.update({ where: { id }, data });
  },
};
