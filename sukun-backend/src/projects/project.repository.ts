import { prisma } from '../config/prisma';
import { Prisma, ProjectManagerStatus, ProjectReadiness, ProjectStatus } from '@prisma/client';

export const projectRepository = {
  findByCode(code: string) {
    return prisma.project.findUnique({ where: { code } });
  },

  // Task 6 (decisions.md G2): visit booking must validate the project is a
  // real, currently-discoverable project - the minimum fields needed for
  // that check, not the full internal DTO.
  findDiscoverabilityFields(id: string) {
    return prisma.project.findUnique({
      where: { id },
      select: { status: true, isActive: true, company: { select: { status: true } } },
    });
  },

  findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { buildings: true } }, projectManager: { select: { id: true } } },
    });
  },

  async findMany(
    where: Prisma.ProjectWhereInput,
    page: number,
    pageSize: number,
    orderBy: Prisma.ProjectOrderByWithRelationInput = { createdAt: 'desc' },
  ) {
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: { _count: { select: { buildings: true } }, projectManager: { select: { id: true } } },
      }),
      prisma.project.count({ where }),
    ]);
    return { items, total };
  },

  create(input: {
    companyId: string;
    name: string;
    code: string;
    city: string;
    district?: string;
    description?: string;
    primaryContractorId?: string;
  }) {
    return prisma.project.create({ data: input });
  },

  update(
    id: string,
    data: {
      name?: string;
      city?: string;
      district?: string;
      description?: string;
      primaryContractorId?: string;
      coverImageKey?: string;
      coverImageUrl?: string;
      readiness?: ProjectReadiness;
      amenities?: string[];
    },
  ) {
    return prisma.project.update({ where: { id }, data });
  },

  updateStatus(id: string, status: ProjectStatus) {
    return prisma.project.update({ where: { id }, data: { status } });
  },

  updateIsActive(id: string, isActive: boolean) {
    return prisma.project.update({ where: { id }, data: { isActive } });
  },

  archive(id: string) {
    return prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ARCHIVED, isActive: false },
    });
  },

  // Project -> Building -> Unit is a two-hop relation, so this can't ride
  // along on Prisma's single-hop `_count` (used above for buildingsCount) -
  // a separate indexed count query instead.
  countUnits(projectId: string) {
    return prisma.unit.count({ where: { building: { projectId } } });
  },

  // Task 4 (docs/integration/decisions.md, "Transactional project creation"):
  // one DB transaction for project + buildings + generated units + manager
  // assignment + primary-contractor assignment + audit events. All business
  // validation (manager/contractor eligibility, generation limits, duplicate
  // numbers) happens in project.service.ts before this is ever called - this
  // method only executes already-validated, already-shaped data. Same
  // transaction-in-repository pattern as homeowner.repository.ts#activateAtomically.
  async createWithBuildings(input: {
    companyId: string;
    name: string;
    code: string;
    city: string;
    district?: string;
    description?: string;
    primaryContractorId: string;
    managerId: string;
    buildings: Array<{
      name: string;
      number: string;
      floors: number;
      units: Array<{
        number: string;
        floor: number;
        type: string;
        price?: number;
        area: number;
        bedrooms: number;
        bathrooms: number;
        parkingSpots: number;
      }>;
    }>;
    auditUserId: string;
    auditIpAddress: string | null;
    totalUnitsCount: number;
  }): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          companyId: input.companyId,
          name: input.name,
          code: input.code,
          city: input.city,
          district: input.district,
          description: input.description,
          primaryContractorId: input.primaryContractorId,
        },
      });

      for (const b of input.buildings) {
        const building = await tx.building.create({
          data: { projectId: project.id, name: b.name, number: b.number, floors: b.floors },
        });
        if (b.units.length > 0) {
          await tx.unit.createMany({
            data: b.units.map((u) => ({ ...u, buildingId: building.id })),
          });
        }
      }

      await tx.projectManager.update({
        where: { id: input.managerId },
        data: { projectId: project.id, status: ProjectManagerStatus.ACTIVE },
      });

      await tx.auditLog.create({
        data: {
          userId: input.auditUserId,
          action: 'PROJECT_CREATED',
          entity: 'Project',
          entityId: project.id,
          ipAddress: input.auditIpAddress,
          metadata: { buildingsCount: input.buildings.length, unitsCount: input.totalUnitsCount } as never,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: input.auditUserId,
          action: 'PROJECT_MANAGER_ASSIGNED',
          entity: 'Project',
          entityId: project.id,
          ipAddress: input.auditIpAddress,
          metadata: { managerId: input.managerId } as never,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: input.auditUserId,
          action: 'PRIMARY_CONTRACTOR_ASSIGNED',
          entity: 'Project',
          entityId: project.id,
          ipAddress: input.auditIpAddress,
          metadata: { contractorId: input.primaryContractorId } as never,
        },
      });

      return project.id;
    });
  },

  // Manager reassignment: outgoing manager returns to the unassigned pool
  // (preserves history - the row is never deleted), incoming manager is
  // assigned, one audit event. One transaction so a mid-way failure never
  // leaves a project with zero or two managers.
  async reassignManager(input: {
    projectId: string;
    outgoingManagerId: string | null;
    incomingManagerId: string;
    auditUserId: string;
    auditIpAddress: string | null;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (input.outgoingManagerId) {
        await tx.projectManager.update({
          where: { id: input.outgoingManagerId },
          data: { projectId: null, status: ProjectManagerStatus.ACTIVATED },
        });
      }
      await tx.projectManager.update({
        where: { id: input.incomingManagerId },
        data: { projectId: input.projectId, status: ProjectManagerStatus.ACTIVE },
      });
      await tx.auditLog.create({
        data: {
          userId: input.auditUserId,
          action: 'PROJECT_MANAGER_REASSIGNED',
          entity: 'Project',
          entityId: input.projectId,
          ipAddress: input.auditIpAddress,
          metadata: {
            managerId: input.incomingManagerId,
            previousManagerId: input.outgoingManagerId,
          } as never,
        },
      });
    });
  },
};
