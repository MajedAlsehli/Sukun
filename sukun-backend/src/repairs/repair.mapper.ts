import { File, RepairImage } from '@prisma/client';
import { RepairEntity } from './repair.types';

export interface RepairDto {
  id: string;
  reportId: string;
  technicianId: string;
  status: string;
  beforeImages: { id: string; url: string }[];
  afterImages: { id: string; url: string }[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type RepairWithImages = RepairEntity & { images: (RepairImage & { file: File })[] };

export function toRepairDto(entity: RepairWithImages): RepairDto {
  return {
    id: entity.id,
    reportId: entity.reportId,
    technicianId: entity.technicianId,
    status: entity.status,
    beforeImages: entity.images
      .filter((i) => i.type === 'BEFORE')
      .map((i) => ({ id: i.id, url: i.file.url })),
    afterImages: entity.images
      .filter((i) => i.type === 'AFTER')
      .map((i) => ({ id: i.id, url: i.file.url })),
    startedAt: entity.startedAt,
    completedAt: entity.completedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
