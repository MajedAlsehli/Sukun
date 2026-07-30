import { unitRepository } from './unit.repository';
import { toUnitDto, toVacantUnitDto } from './unit.mapper';
import { isEditable as isUnitEditable } from './unit.types';
import {
  isEditable as isBuildingEditable,
  isPubliclyVisible as isBuildingPubliclyVisible,
} from '../buildings/building.types';
import { buildingRepository } from '../buildings/building.repository';
import { isPubliclyVisible as isProjectPubliclyVisible } from '../projects/project.types';
import { projectRepository } from '../projects/project.repository';
import { AuthorizationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { UserRole } from '../shared/roles';
import { CreateUnitDto, ListVacantUnitsQueryDto, UpdateUnitDto } from './unit.dto';

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

interface RequestContext {
  ipAddress: string | null;
}

function isOwningCompany(projectCompanyId: string, requester: Requester): boolean {
  return requester.role === UserRole.COMPANY && requester.companyId === projectCompanyId;
}

// Cascades visibility: Unit -> Building -> Project. A viewer must be the
// owning company, or every ancestor must be publicly visible.
async function requireVisibleBuilding(buildingId: string, requester: Requester) {
  const building = await buildingRepository.findById(buildingId);
  if (!building) {
    throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
  }

  const project = await projectRepository.findById(building.projectId);
  if (!project) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }

  const owner = isOwningCompany(project.companyId, requester);
  if (!owner && (!isProjectPubliclyVisible(project.status) || !isBuildingPubliclyVisible(building.status))) {
    throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
  }

  return { building, project, isOwner: owner };
}

async function requireOwnedUnit(unitId: string, requester: Requester) {
  const unit = await unitRepository.findById(unitId);
  if (!unit) {
    throw new NotFoundError('Unit not found', 'UNIT_NOT_FOUND');
  }
  const building = await buildingRepository.findById(unit.buildingId);
  const project = building ? await projectRepository.findById(building.projectId) : null;
  if (!project || !isOwningCompany(project.companyId, requester)) {
    throw new AuthorizationError('You do not own this unit.');
  }
  return unit;
}

export const unitService = {
  // GET /api/units/vacant?projectId&buildingId (Company only) - RE4 wizard
  // step 2's vacant-unit picker.
  async listVacant(requester: Requester, query: ListVacantUnitsQueryDto) {
    if (requester.role !== UserRole.COMPANY || !requester.companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }
    const units = await unitRepository.findVacant(requester.companyId, query);
    return units.map(toVacantUnitDto);
  },

  // GET /api/buildings/{id}/units - Task 6 closeout correction (decisions.md
  // G17): the route is now Company-only (`companyOnly`); requireVisibleBuilding's
  // isOwner/isPubliclyVisible fallback is unchanged (object-level scoping
  // preserved exactly as it was), same reasoning as G16.
  async list(buildingId: string, requester: Requester) {
    await requireVisibleBuilding(buildingId, requester);
    const units = await unitRepository.findAllByBuilding(buildingId);
    return units.map(toUnitDto);
  },

  // GET /api/units/{id} - "Returns Unit Details, Owner, Warranty, Inspection History"
  async getById(unitId: string, requester: Requester) {
    const unit = await unitRepository.findById(unitId);
    if (!unit) {
      throw new NotFoundError('Unit not found', 'UNIT_NOT_FOUND');
    }
    await requireVisibleBuilding(unit.buildingId, requester);
    return toUnitDto(unit);
  },

  // POST /api/units (per 13_Frontend_Backend_Mapping.md) - Company only, own building
  async create(buildingId: string, dto: CreateUnitDto, requester: Requester, ctx: RequestContext) {
    if (requester.role !== UserRole.COMPANY || !requester.companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }

    const building = await buildingRepository.findById(buildingId);
    if (!building) {
      throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
    }
    const project = await projectRepository.findById(building.projectId);
    if (!project || project.companyId !== requester.companyId) {
      throw new AuthorizationError('You do not own this building.');
    }
    if (!isBuildingEditable(building.status)) {
      throw new BusinessError('Archived buildings are read-only', 'BUILDING_ARCHIVED');
    }

    // COM-008: unique unit number, scoped per-building.
    const existing = await unitRepository.findByBuildingAndNumber(buildingId, dto.number);
    if (existing) {
      throw new BusinessError('Unit number already in use for this building', 'UNIT_NUMBER_ALREADY_EXISTS');
    }

    const unit = await unitRepository.create({ buildingId, ...dto });

    await writeAuditLog({
      userId: requester.id,
      action: 'UNIT_CREATED',
      entity: 'Unit',
      entityId: unit.id,
      ipAddress: ctx.ipAddress,
    });

    return toUnitDto(unit);
  },

  async update(unitId: string, dto: UpdateUnitDto, requester: Requester, ctx: RequestContext) {
    const unit = await requireOwnedUnit(unitId, requester);

    if (!isUnitEditable(unit.status)) {
      throw new BusinessError(
        'Unit details are locked once reserved, delivered, or occupied',
        'UNIT_LOCKED',
      );
    }

    if (dto.number && dto.number !== unit.number) {
      const existing = await unitRepository.findByBuildingAndNumber(unit.buildingId, dto.number);
      if (existing) {
        throw new BusinessError('Unit number already in use for this building', 'UNIT_NUMBER_ALREADY_EXISTS');
      }
    }

    const updated = await unitRepository.update(unitId, dto);

    await writeAuditLog({
      userId: requester.id,
      action: 'UNIT_UPDATED',
      entity: 'Unit',
      entityId: unitId,
      ipAddress: ctx.ipAddress,
      metadata: dto,
    });

    return toUnitDto(updated);
  },
};
