import { UnitEntity } from './unit.types';

export interface UnitDto {
  id: string;
  buildingId: string;
  number: string;
  floor: number;
  type: string;
  status: string;
  // 08_API_Specification.md's GET /api/units/{id} also documents Owner,
  // Warranty and Inspection History - null/empty until Ownership (Task 011),
  // Warranty (Task 010) and Inspection Reports (Task 007) exist.
  owner: null;
  warranty: null;
  inspectionHistory: never[];
  createdAt: Date;
  updatedAt: Date;
}

export function toUnitDto(entity: UnitEntity): UnitDto {
  return {
    id: entity.id,
    buildingId: entity.buildingId,
    number: entity.number,
    floor: entity.floor,
    type: entity.type,
    status: entity.status,
    owner: null,
    warranty: null,
    inspectionHistory: [],
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export interface VacantUnitDto {
  id: string;
  number: string;
  floor: number;
  type: string;
  buildingId: string;
  buildingName: string;
  projectId: string;
  projectName: string;
}

type VacantUnitEntity = UnitEntity & {
  building: { id: string; name: string; project: { id: string; name: string } };
};

// Task 5: RE4 wizard step 2's vacant-unit picker - flattens the
// project/building context the picker needs to render its 3-level grid.
export function toVacantUnitDto(entity: VacantUnitEntity): VacantUnitDto {
  return {
    id: entity.id,
    number: entity.number,
    floor: entity.floor,
    type: entity.type,
    buildingId: entity.building.id,
    buildingName: entity.building.name,
    projectId: entity.building.project.id,
    projectName: entity.building.project.name,
  };
}
