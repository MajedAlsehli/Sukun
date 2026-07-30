import { prisma } from '../config/prisma';
import { AIAnalysisType, InspectionPriority } from '@prisma/client';

export const aiResultRepository = {
  create(input: {
    type: AIAnalysisType;
    inspectionReportId?: string;
    repairId?: string;
    warrantyReportId?: string;
    requestId: string;
    model: string;
    version: string;
    confidence: number;
    prediction: string;
    priority?: InspectionPriority;
    suggestedRepair?: string;
    processingTimeMs: number;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.aIResult.create({ data: input as never });
  },
};
