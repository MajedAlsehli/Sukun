import { UnitStatus } from '@prisma/client';
import { projectRepository } from './project.repository';
import { workspaceRepository } from './workspace.repository';
import { computeProjectHealth } from './project-health';
import { toProjectDto } from './project.mapper';
import { isPubliclyVisible } from './project.types';
import { toActivityEntryDto } from '../shared/activity.mapper';
import { normalizeToLatinDigits } from '../shared/arabicDigits';
import { AuthorizationError, NotFoundError } from '../shared/errors';
import { UserRole } from '../shared/roles';
import { ListProjectUnitsQueryDto } from './workspace.dto';

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

// RE3's workspace is a Company-only surface (unlike the plain project detail
// route, which HS/HO can also browse) - the breadcrumb/hero/tabs/inline-edit
// controls it exposes are all company-management affordances.
async function requireOwnedProject(id: string, requester: Requester) {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  const project = await projectRepository.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }
  if (project.companyId !== requester.companyId) {
    // Drafts/other-company projects are invisible to this requester -
    // report 404, not 403, same rule project.service.ts already uses.
    if (!isPubliclyVisible(project.status)) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }
    throw new AuthorizationError('You do not own this project.');
  }
  return project;
}

function occupancyLabel(status: UnitStatus): string {
  const labels: Record<UnitStatus, string> = {
    AVAILABLE: 'شاغرة',
    RESERVED: 'محجوزة',
    DELIVERED: 'شاغرة',
    OCCUPIED: 'مشغولة',
  };
  return labels[status];
}

function warrantyState(warranty: { endDate: Date } | null): { state: 'ACTIVE' | 'EXPIRED' | 'NONE' } {
  if (!warranty) return { state: 'NONE' };
  return { state: warranty.endDate.getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED' };
}

export const workspaceService = {
  // GET /api/projects/{id}/workspace - RE3's single load-bearing endpoint:
  // project + real server-computed KPIs/health + timeline + settings.
  // Registered/activated-homeowner and satisfaction figures are honest
  // zero/null where no backing data exists yet (decisions.md E8).
  async getWorkspace(projectId: string, requester: Requester) {
    const project = await requireOwnedProject(projectId, requester);

    const [unitsCount, health, kpis, timeline] = await Promise.all([
      projectRepository.countUnits(projectId),
      computeProjectHealth(projectId),
      workspaceRepository.kpis(projectId),
      workspaceRepository.timeline(projectId),
    ]);

    const occupiedPercent = kpis.unitsCount > 0 ? Math.round((kpis.occupiedCount / kpis.unitsCount) * 100) : 0;
    const vacantCount = kpis.unitsCount - kpis.occupiedCount;
    const warrantyCoveragePercent =
      kpis.occupiedCount > 0 ? Math.round((kpis.warrantyActiveCount / kpis.occupiedCount) * 100) : null;

    return {
      project: toProjectDto(project, unitsCount),
      health,
      kpis: {
        buildingsCount: kpis.buildingsCount,
        unitsCount: kpis.unitsCount,
        occupiedCount: kpis.occupiedCount,
        occupiedPercent,
        vacantCount,
        // Task 8 (decisions.md I14/I15): canonical post-ownership reports only.
        // RE3's reports tab itself reads the canonical `GET /api/reports?projectId=`
        // with the company role scope - there is deliberately no second,
        // project-specific report list endpoint or query.
        openReportsCount: health.openReportsCount,
        criticalReportsCount: health.criticalReportsCount,
        // Kept visible but clearly separate, never summed into the number above.
        legacyOpenReportsCount:
          health.legacy.openInspectionReportsCount + health.legacy.openWarrantyReportsCount,
        // No rating/review model exists anywhere in the schema (decisions.md
        // E8) - honest null, not a fabricated average.
        satisfaction: null as number | null,
        warrantyCoveragePercent,
      },
      timeline: {
        createdAt: project.createdAt,
        firstHandoverAt: timeline.firstHandoverAt,
        warrantyActivatedAt: timeline.warrantyActivatedAt,
        lastUpdatedAt: project.updatedAt,
      },
      settings: {
        managerId: project.projectManager?.id ?? null,
        primaryContractorId: project.primaryContractorId,
        status: project.status,
        isActive: project.isActive,
        lastUpdatedAt: project.updatedAt,
        createdAt: project.createdAt,
      },
    };
  },

  // GET /api/projects/{id}/units?buildingId&q&occupancy&page&pageSize (RE3 tab 3)
  async listUnits(projectId: string, requester: Requester, query: ListProjectUnitsQueryDto) {
    await requireOwnedProject(projectId, requester);

    const status = query.occupancy === 'ALL' ? undefined : (query.occupancy as UnitStatus);
    const number = query.q ? normalizeToLatinDigits(query.q) : undefined;

    const { items, total } = await workspaceRepository.findUnitsByProject(
      projectId,
      { buildingId: query.buildingId, number, status },
      query.page,
      query.pageSize,
    );

    return {
      items: items.map((u) => ({
        id: u.id,
        number: u.number,
        floor: u.floor,
        type: u.type,
        area: u.area,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        parkingSpots: u.parkingSpots,
        status: u.status,
        occupancyLabel: occupancyLabel(u.status),
        buildingId: u.building.id,
        buildingName: u.building.name,
        currentOwnerName: u.ownerships[0]?.user.name ?? null,
        warranty: warrantyState(u.warranty),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  },

  // GET /api/projects/{id}/homeowners (RE3 tab 4) - real Ownership/
  // HomeownerActivation data (Task 3 models). Full management (transfer,
  // resend, status change) is Task 5's RE4 job - this is read-only.
  async listHomeowners(projectId: string, requester: Requester) {
    await requireOwnedProject(projectId, requester);

    const { ownerships, activations } = await workspaceRepository.findHomeownerRows(projectId);

    const activeUnitIds = new Set(ownerships.map((o) => o.unitId));
    const latestActivationByUnit = new Map<string, (typeof activations)[number]>();
    for (const a of activations) {
      if (!latestActivationByUnit.has(a.unitId)) latestActivationByUnit.set(a.unitId, a);
    }

    const rows = [
      ...ownerships.map((o) => ({
        unitId: o.unitId,
        unitNumber: o.unit.number,
        buildingName: o.unit.building.name,
        ownerName: o.user.name,
        ownerEmail: o.user.email,
        ownerPhone: o.user.phone,
        invitationState: 'ACTIVE' as const,
      })),
      ...activations
        .filter((a) => !activeUnitIds.has(a.unitId) && latestActivationByUnit.get(a.unitId)?.id === a.id)
        .map((a) => ({
          unitId: a.unitId,
          unitNumber: a.unit.number,
          buildingName: a.unit.building.name,
          ownerName: a.user.name,
          ownerEmail: a.user.email,
          ownerPhone: a.user.phone,
          invitationState: (a.status === 'PENDING' ? 'PENDING' : 'NOT_ACTIVATED') as 'PENDING' | 'NOT_ACTIVATED',
        })),
    ];

    return { items: rows, total: rows.length };
  },

  // GET /api/projects/{id}/activity (RE3 "آخر النشاطات") - real audit data only.
  async listActivity(projectId: string, requester: Requester, limit = 20) {
    await requireOwnedProject(projectId, requester);

    const buildings = await workspaceRepository.buildingIdsByProject(projectId);
    const entries = await workspaceRepository.projectActivity(
      projectId,
      buildings.map((b) => b.id),
      limit,
    );

    return { items: entries.map(toActivityEntryDto) };
  },
};
