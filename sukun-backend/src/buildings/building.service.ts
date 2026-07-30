import { buildingRepository } from './building.repository';
import { toBuildingDto } from './building.mapper';
import {
  assertArchivable,
  assertCanToggleActive,
  assertValidTransition,
  BuildingStatus,
  isEditable as isBuildingEditable,
  isPubliclyVisible as isBuildingPubliclyVisible,
} from './building.types';
import {
  isEditable as isProjectEditable,
  isPubliclyVisible as isProjectPubliclyVisible,
} from '../projects/project.types';
import { projectRepository } from '../projects/project.repository';
import { AuthorizationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { UserRole } from '../shared/roles';
import { CreateBuildingDto, UpdateBuildingDto } from './building.dto';

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

// Shared by list/get: a project invisible to this requester means its
// buildings must also stay invisible - never leak existence via a 403.
async function requireVisibleProject(projectId: string, requester: Requester) {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }
  const owner = isOwningCompany(project.companyId, requester);
  if (!owner && !isProjectPubliclyVisible(project.status)) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }
  return { project, isOwner: owner };
}

async function requireOwnedBuilding(buildingId: string, requester: Requester) {
  const building = await buildingRepository.findById(buildingId);
  if (!building) {
    throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
  }
  const project = await projectRepository.findById(building.projectId);
  if (!project || !isOwningCompany(project.companyId, requester)) {
    throw new AuthorizationError('You do not own this building.');
  }
  return building;
}

export const buildingService = {
  // GET /api/projects/{id}/buildings - Task 6 closeout correction
  // (decisions.md G17): the route is now Company-only (`companyOnly`), so
  // requester.role is always COMPANY here; the isOwner/isPubliclyVisible
  // fallback below is unchanged (company object-level scoping preserved
  // exactly as it was), same reasoning as project.service.ts's G16 correction.
  async list(projectId: string, requester: Requester) {
    const { isOwner } = await requireVisibleProject(projectId, requester);
    const buildings = await buildingRepository.findAllByProject(projectId);

    const visible = isOwner
      ? buildings
      : buildings.filter((b) => isBuildingPubliclyVisible(b.status));

    return visible.map(toBuildingDto);
  },

  async getById(buildingId: string, requester: Requester) {
    const building = await buildingRepository.findById(buildingId);
    if (!building) {
      throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
    }

    const { isOwner } = await requireVisibleProject(building.projectId, requester);
    if (!isOwner && !isBuildingPubliclyVisible(building.status)) {
      throw new NotFoundError('Building not found', 'BUILDING_NOT_FOUND');
    }

    return toBuildingDto(building);
  },

  // POST /api/projects/{id}/buildings - Company only, own project
  async create(
    projectId: string,
    dto: CreateBuildingDto,
    requester: Requester,
    ctx: RequestContext,
  ) {
    if (requester.role !== UserRole.COMPANY || !requester.companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }
    if (project.companyId !== requester.companyId) {
      throw new AuthorizationError('You do not own this project.');
    }
    if (!isProjectEditable(project.status)) {
      throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
    }

    // COM-007: unique building number, scoped per-project.
    const existing = await buildingRepository.findByProjectAndNumber(projectId, dto.number);
    if (existing) {
      throw new BusinessError('Building number already in use for this project', 'BUILDING_NUMBER_ALREADY_EXISTS');
    }

    const building = await buildingRepository.create({ projectId, ...dto });

    await writeAuditLog({
      userId: requester.id,
      action: 'BUILDING_CREATED',
      entity: 'Building',
      entityId: building.id,
      ipAddress: ctx.ipAddress,
    });

    return toBuildingDto(building);
  },

  async update(
    buildingId: string,
    dto: UpdateBuildingDto,
    requester: Requester,
    ctx: RequestContext,
  ) {
    const building = await requireOwnedBuilding(buildingId, requester);

    if (!isBuildingEditable(building.status)) {
      throw new BusinessError('Archived buildings are read-only', 'BUILDING_ARCHIVED');
    }

    if (dto.number && dto.number !== building.number) {
      const existing = await buildingRepository.findByProjectAndNumber(
        building.projectId,
        dto.number,
      );
      if (existing) {
        throw new BusinessError(
          'Building number already in use for this project',
          'BUILDING_NUMBER_ALREADY_EXISTS',
        );
      }
    }

    const updated = await buildingRepository.update(buildingId, dto);

    await writeAuditLog({
      userId: requester.id,
      action: 'BUILDING_UPDATED',
      entity: 'Building',
      entityId: buildingId,
      ipAddress: ctx.ipAddress,
      metadata: dto,
    });

    return toBuildingDto(updated);
  },

  async publish(buildingId: string, requester: Requester, ctx: RequestContext) {
    const building = await requireOwnedBuilding(buildingId, requester);
    assertValidTransition(building.status, BuildingStatus.ACTIVE);

    const updated = await buildingRepository.updateStatus(buildingId, BuildingStatus.ACTIVE);

    await writeAuditLog({
      userId: requester.id,
      action: 'BUILDING_PUBLISHED',
      entity: 'Building',
      entityId: buildingId,
      ipAddress: ctx.ipAddress,
    });

    return toBuildingDto(updated);
  },

  // PATCH /api/buildings/{id}/status ({active: bool}) - replaces the
  // forbidden `DELETE /api/buildings/{id}` (D5/A7). Task 4 (decisions.md E1):
  // toggles the reversible isActive flag only - same decoupling as Project.
  async updateStatus(buildingId: string, active: boolean, requester: Requester, ctx: RequestContext) {
    const building = await requireOwnedBuilding(buildingId, requester);
    assertCanToggleActive(building.status);

    const updated = await buildingRepository.updateIsActive(buildingId, active);

    await writeAuditLog({
      userId: requester.id,
      action: active ? 'BUILDING_REACTIVATED' : 'BUILDING_DEACTIVATED',
      entity: 'Building',
      entityId: buildingId,
      ipAddress: ctx.ipAddress,
    });

    return toBuildingDto(updated);
  },

  // PATCH /api/buildings/{id}/archive - one-way, terminal (decisions.md E1).
  async archive(buildingId: string, requester: Requester, ctx: RequestContext) {
    const building = await requireOwnedBuilding(buildingId, requester);
    assertArchivable(building.status);

    const updated = await buildingRepository.archive(buildingId);

    await writeAuditLog({
      userId: requester.id,
      action: 'BUILDING_ARCHIVED',
      entity: 'Building',
      entityId: buildingId,
      ipAddress: ctx.ipAddress,
    });

    return toBuildingDto(updated);
  },
};
