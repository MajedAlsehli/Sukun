import { AIResult, File, InspectionImage } from '@prisma/client';
import { InspectionReportEntity } from './inspection-report.types';

export interface InspectionReportDto {
  id: string;
  visitId: string;
  unitId: string;
  searchJourneyId: string;
  status: string;
  priority: string | null;
  location: string;
  notes: string | null;
  images: { id: string; order: number; url: string; mimeType: string }[];
  // 08_API_Specification.md: GET /{id} "Returns Report, AI Analysis, Repair
  // Timeline". AI Analysis is real (this task); Repair Timeline stays empty
  // until Task 009 (Repair module) exists.
  aiAnalysis: {
    id: string;
    model: string;
    version: string;
    confidence: number;
    prediction: string;
    priority: string | null;
    suggestedRepair: string | null;
    createdAt: Date;
  }[];
  repairTimeline: never[];
  createdAt: Date;
  updatedAt: Date;
}

type ReportWithDetails = InspectionReportEntity & {
  images: (InspectionImage & { file: File })[];
  aiResults?: AIResult[];
};

export function toInspectionReportDto(entity: ReportWithDetails): InspectionReportDto {
  return {
    id: entity.id,
    visitId: entity.visitId,
    unitId: entity.unitId,
    searchJourneyId: entity.searchJourneyId,
    status: entity.status,
    priority: entity.priority,
    location: entity.location,
    notes: entity.notes,
    images: entity.images
      .sort((a, b) => a.order - b.order)
      .map((img) => ({ id: img.id, order: img.order, url: img.file.url, mimeType: img.file.mimeType })),
    aiAnalysis: (entity.aiResults ?? []).map((r) => ({
      id: r.id,
      model: r.model,
      version: r.version,
      confidence: r.confidence,
      prediction: r.prediction,
      priority: r.priority,
      suggestedRepair: r.suggestedRepair,
      createdAt: r.createdAt,
    })),
    repairTimeline: [],
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
