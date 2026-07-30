import { ProjectEntity } from './project.types';
import { coverStorage } from './cover-storage';

export interface ProjectDto {
  id: string;
  companyId: string;
  name: string;
  code: string;
  city: string;
  district: string | null;
  description: string | null;
  status: string;
  isActive: boolean;
  coverImageUrl: string | null;
  // decisions.md E7: the frontend must show an explicit placeholder and
  // disable the real-upload control when this is false, never pretend a
  // local/temporary upload succeeded.
  coverStorageAvailable: boolean;
  managerId: string | null;
  primaryContractorId: string | null;
  source: string;
  buildingsCount: number;
  unitsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type ProjectWithCounts = ProjectEntity & {
  _count?: { buildings: number };
  projectManager?: { id: string } | null;
};

// unitsCount can't come from Prisma's `_count` (two-hop relation - see
// project.repository.ts#countUnits), so it's passed in explicitly by the
// service instead of being read off the entity like buildingsCount is.
export function toProjectDto(entity: ProjectWithCounts, unitsCount = 0): ProjectDto {
  return {
    id: entity.id,
    companyId: entity.companyId,
    name: entity.name,
    code: entity.code,
    city: entity.city,
    district: entity.district,
    description: entity.description,
    status: entity.status,
    isActive: entity.isActive,
    coverImageUrl: entity.coverImageUrl,
    coverStorageAvailable: coverStorage.isConfigured(),
    managerId: entity.projectManager?.id ?? null,
    primaryContractorId: entity.primaryContractorId,
    source: entity.source,
    buildingsCount: entity._count?.buildings ?? 0,
    unitsCount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
