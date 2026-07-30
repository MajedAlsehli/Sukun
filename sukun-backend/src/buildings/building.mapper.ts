import { BuildingEntity } from './building.types';

export interface BuildingDto {
  id: string;
  projectId: string;
  name: string;
  number: string;
  status: string;
  isActive: boolean;
  unitsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type BuildingWithCounts = BuildingEntity & { _count?: { units: number } };

export function toBuildingDto(entity: BuildingWithCounts): BuildingDto {
  return {
    id: entity.id,
    projectId: entity.projectId,
    name: entity.name,
    number: entity.number,
    status: entity.status,
    isActive: entity.isActive,
    unitsCount: entity._count?.units ?? 0,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
