import { AIResult, File, WarrantyImage } from '@prisma/client';
import { WarrantyEntity, WarrantyReportEntity } from './warranty.types';
import { isWarrantyActive } from './warranty.types';
import {
  WARRANTY_RULES_VERSION,
  WarrantyCategoryState,
  computeAllCategoryStates,
} from './warranty.rules';

export interface WarrantyDto {
  id: string;
  unitId: string;
  startDate: Date;
  endDate: Date;
  coverage: string;
  isActive: boolean;
  // Task 7 (H10, decisions.md H2): overall remaining duration + the
  // structured per-category breakdown the reference Warranty Center screen
  // needs - computed server-side (warranty.rules.ts), never client-derived.
  daysRemaining: number | null;
  rulesVersion: string;
  categories: WarrantyCategoryState[];
}

export function toWarrantyDto(entity: WarrantyEntity, now: Date = new Date()): WarrantyDto {
  const isActive = isWarrantyActive(entity, now);
  return {
    id: entity.id,
    unitId: entity.unitId,
    startDate: entity.startDate,
    endDate: entity.endDate,
    coverage: entity.coverage,
    isActive,
    daysRemaining: isActive ? Math.ceil((entity.endDate.getTime() - now.getTime()) / 86_400_000) : null,
    rulesVersion: WARRANTY_RULES_VERSION,
    categories: computeAllCategoryStates(entity.startDate, now),
  };
}

export interface WarrantyReportDto {
  id: string;
  warrantyId: string;
  unitId: string;
  homeownerId: string;
  referenceNumber: string;
  status: string;
  priority: string | null;
  category: string;
  location: string;
  notes: string | null;
  images: { id: string; order: number; url: string }[];
  // Populated from the most recent AIResult once analysis has run (repository
  // already fetches aiResults via `withImages` - this was being silently
  // dropped by the mapper before, so the frontend had no way to show the
  // AI's actual finding even though it was persisted).
  aiAnalysis: { confidence: number; prediction: string; suggestedRepair: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
}

type ReportWithImages = WarrantyReportEntity & {
  images: (WarrantyImage & { file: File })[];
  aiResults?: AIResult[];
};

export function toWarrantyReportDto(entity: ReportWithImages): WarrantyReportDto {
  const latestAiResult = entity.aiResults?.[0];
  return {
    id: entity.id,
    warrantyId: entity.warrantyId,
    unitId: entity.unitId,
    homeownerId: entity.homeownerId,
    referenceNumber: entity.referenceNumber,
    status: entity.status,
    priority: entity.priority,
    category: entity.category,
    location: entity.location,
    notes: entity.notes,
    images: entity.images
      .sort((a, b) => a.order - b.order)
      .map((img) => ({ id: img.id, order: img.order, url: img.file.url })),
    aiAnalysis: latestAiResult
      ? {
          confidence: latestAiResult.confidence,
          prediction: latestAiResult.prediction,
          suggestedRepair: latestAiResult.suggestedRepair ?? null,
        }
      : null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
