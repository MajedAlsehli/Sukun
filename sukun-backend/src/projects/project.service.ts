import crypto from 'crypto';
import { ProjectManagerStatus } from '@prisma/client';
import { projectRepository } from './project.repository';
import { toProjectDto } from './project.mapper';
import {
  assertArchivable,
  assertCanToggleActive,
  assertValidTransition,
  isEditable,
  isPubliclyVisible,
  ProjectStatus,
} from './project.types';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { contractorRepository } from '../contractors/contractor.repository';
import { computeProjectHealth } from './project-health';
import { mapInBatches } from '../shared/batch';
import { coverStorage } from './cover-storage';
import { decodeAndValidateImage, extensionForMimeType } from '../reports/report-media-storage';
import { AuthorizationError, BusinessError, NotFoundError, ValidationError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { logger } from '../shared/logger';
import { UserRole } from '../shared/roles';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  ReassignContractorDto,
  ReassignManagerDto,
  UpdateProjectDto,
  UploadCoverDto,
  MAX_TOTAL_UNITS_PER_PROJECT,
} from './project.dto';

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

interface RequestContext {
  ipAddress: string | null;
}

// COM-001/PER-004: only a Company can create/manage projects, scoped to its own.
function requireLinkedCompany(requester: Requester): string {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  return requester.companyId;
}

async function requireOwnedProject(id: string, requester: Requester) {
  const companyId = requireLinkedCompany(requester);
  const project = await projectRepository.findById(id);
  if (!project) {
    throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
  }
  if (project.companyId !== companyId) {
    throw new AuthorizationError('You do not own this project.');
  }
  return project;
}

// unitsCount needs its own query (two-hop relation - see project.repository.ts
// #countUnits), so every DTO-returning path goes through this instead of
// calling toProjectDto directly, to avoid ever showing a stale "0".
async function withUnitsCount(project: Parameters<typeof toProjectDto>[0]) {
  const unitsCount = await projectRepository.countUnits(project.id);
  return { ...toProjectDto(project, unitsCount), health: await computeProjectHealth(project.id) };
}

// decisions.md E4: RE2's wizard never collects a project code - the server
// generates a short, stable, unique one instead of inventing a UI field for
// it. Retries on the (rare) collision rather than failing the whole create.
function slugify(name: string): string {
  const latin = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  return latin || 'PRJ';
}

async function generateUniqueProjectCode(name: string): Promise<string> {
  const prefix = slugify(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `${prefix}-${suffix}`;
    const existing = await projectRepository.findByCode(code);
    if (!existing) return code;
  }
  throw new BusinessError('Could not generate a unique project code, please retry', 'PROJECT_CODE_GENERATION_FAILED');
}

async function requireEligibleManager(managerId: string, companyId: string) {
  const manager = await projectManagerRepository.findById(managerId);
  if (!manager) {
    throw new BusinessError('Project manager not found', 'MANAGER_NOT_FOUND');
  }
  if (manager.user.companyId !== companyId) {
    throw new AuthorizationError('This project manager does not belong to your company.');
  }
  if (manager.projectId) {
    throw new BusinessError('This project manager is already assigned to a project', 'MANAGER_NOT_ELIGIBLE');
  }
  if (manager.status !== ProjectManagerStatus.ACTIVATED) {
    throw new BusinessError('This project manager has not completed activation', 'MANAGER_NOT_ELIGIBLE');
  }
  return manager;
}

async function requireEligibleContractor(contractorId: string, companyId: string) {
  const contractor = await contractorRepository.findById(contractorId);
  if (!contractor) {
    throw new BusinessError('Contractor organization not found', 'CONTRACTOR_NOT_FOUND');
  }
  if (contractor.companyId !== companyId) {
    throw new AuthorizationError('This contractor organization does not belong to your company.');
  }
  if (!contractor.isActive) {
    throw new BusinessError('This contractor organization is not active', 'CONTRACTOR_NOT_ELIGIBLE');
  }
  return contractor;
}

// Deterministic sequential unit numbering: "{floor}{seq:02}" - e.g. floor 5,
// 3rd unit on that floor -> "503". Unique within a building as long as
// perFloor stays under 100 (enforced: MAX_UNITS_PER_FLOOR=60).
function generateUnitNumber(floor: number, sequenceInFloor: number): string {
  return `${floor}${String(sequenceInFloor).padStart(2, '0')}`;
}

const SORT_ORDER: Record<ListProjectsQueryDto['sort'], { createdAt?: 'asc' | 'desc'; name?: 'asc' }> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { name: 'asc' },
  // "الأكثر بلاغات" (most-reports) needs the future canonical reports model
  // (decisions.md B1, Task 8) to sort by a real report count - falls back to
  // newest-first honestly rather than faking a report-count sort today.
  mostReports: { createdAt: 'desc' },
};

export const projectService = {
  // Task 6 correction (decisions.md G16): the route calling this
  // (`GET /api/projects`) is now Company-only - requester.role is always
  // COMPANY here, enforced by project.routes.ts's `companyOnly` middleware
  // before this ever runs. The `baseWhere` ternary's non-Company branch
  // (the old "public non-Draft browse" path HOME_SEEKER/HOMEOWNER used) is
  // therefore unreachable in production; left in place rather than deleted
  // since `Requester`'s type still allows any role and this function has no
  // other reason to assume otherwise - a defensive fallback, not a live path.
  // A Company sees only its own portfolio, including Drafts. Task 4 adds
  // q/status/sort/pagination (integration-matrix.md RE2 gap).
  async list(requester: Requester, query: ListProjectsQueryDto) {
    const { q, status, sort, page, pageSize } = query;
    const baseWhere =
      requester.role === UserRole.COMPANY
        ? { companyId: requireLinkedCompany(requester) }
        : { status: { not: ProjectStatus.DRAFT } };

    const where = {
      ...baseWhere,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { city: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const { items, total } = await projectRepository.findMany(where, page, pageSize, SORT_ORDER[sort]);

    return {
      // Task 10 (decisions.md K4): bounded fan-out. `withUnitsCount` issues
      // five queries per project (one count + computeProjectHealth's four), so
      // a full page of 100 projects would have asked for 500 simultaneous
      // connections against a pooler with a documented client ceiling.
      items: await mapInBatches(items, withUnitsCount),
      page,
      pageSize,
      total,
    };
  },

  // Task 6 correction (decisions.md G16): `GET /api/projects/{id}` is now
  // Company-only (project.routes.ts's `companyOnly`) - requester.role is
  // always COMPANY by the time this runs. The isOwner/isPubliclyVisible
  // branch below is unchanged (company object-level scoping is preserved
  // exactly as it was) - it's kept as-is rather than simplified to a flat
  // ownership check, since narrowing cross-company visibility rules for
  // ACTIVE/ARCHIVED projects was not part of what this correction fixes.
  async getById(id: string, requester: Requester) {
    const project = await projectRepository.findById(id);
    if (!project) {
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    const isOwner = requester.role === UserRole.COMPANY && project.companyId === requester.companyId;
    if (!isOwner && !isPubliclyVisible(project.status)) {
      // Drafts are invisible to outsiders - report 404, not 403, to avoid
      // revealing that an unpublished project exists.
      throw new NotFoundError('Project not found', 'PROJECT_NOT_FOUND');
    }

    return withUnitsCount(project);
  },

  // POST /api/projects - transactional nested creation (prompt's required
  // contract): project + buildings + generated units + manager assignment +
  // primary-contractor assignment + audit events, one DB transaction, full
  // rollback on any failure. Starts in DRAFT (unchanged from before - RE2's
  // wizard publishes separately via the existing /publish endpoint once the
  // company is ready, same as Task 2/3's flat create already did).
  async create(dto: CreateProjectDto, requester: Requester, ctx: RequestContext) {
    const companyId = requireLinkedCompany(requester);

    const manager = await requireEligibleManager(dto.managerId, companyId);
    const contractor = await requireEligibleContractor(dto.primaryContractorId, companyId);

    // Reject duplicate building numbers within this single request upfront -
    // a friendlier, pre-transaction validation error rather than letting the
    // DB's unique constraint abort the transaction.
    const explicitNumbers = dto.buildings.map((b) => b.number).filter((n): n is string => !!n);
    if (new Set(explicitNumbers).size !== explicitNumbers.length) {
      throw new BusinessError('Duplicate building number in request', 'DUPLICATE_BUILDING_NUMBER');
    }

    const totalUnits = dto.buildings.reduce((sum, b) => sum + b.floors * b.units.perFloor, 0);
    if (totalUnits > MAX_TOTAL_UNITS_PER_PROJECT) {
      throw new BusinessError(
        `Generating ${totalUnits} units exceeds the ${MAX_TOTAL_UNITS_PER_PROJECT}-unit project limit`,
        'PROJECT_UNIT_GENERATION_LIMIT_EXCEEDED',
      );
    }

    const code = await generateUniqueProjectCode(dto.name);

    // Business logic (numbering scheme, defaulting an omitted building
    // number) lives here per this codebase's *.service.ts convention; the
    // repository's transaction executes this already-shaped, already-validated
    // data verbatim.
    const buildings = dto.buildings.map((b, index) => {
      const number = b.number ?? String(index + 1).padStart(2, '0');
      const units = [];
      for (let floor = 1; floor <= b.floors; floor += 1) {
        for (let seq = 1; seq <= b.units.perFloor; seq += 1) {
          units.push({
            number: generateUnitNumber(floor, seq),
            floor,
            // Task 6 (decisions.md G4): real, optional type/price - defaults
            // to the pre-Task-6 hardcoded 'RESIDENTIAL' when omitted.
            type: b.units.type ?? 'RESIDENTIAL',
            price: b.units.price,
            area: b.units.area,
            bedrooms: b.units.beds,
            bathrooms: b.units.baths,
            parkingSpots: b.units.parking,
          });
        }
      }
      return { name: b.name, number, floors: b.floors, units };
    });

    const projectId = await projectRepository.createWithBuildings({
      companyId,
      name: dto.name,
      code,
      city: dto.city,
      district: dto.district,
      description: dto.description,
      primaryContractorId: contractor.id,
      managerId: manager.id,
      buildings,
      auditUserId: requester.id,
      auditIpAddress: ctx.ipAddress,
      totalUnitsCount: totalUnits,
    });

    const created = await projectRepository.findById(projectId);
    return withUnitsCount(created!);
  },

  async update(id: string, dto: UpdateProjectDto, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);

    if (!isEditable(project.status)) {
      throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
    }

    const updated = await projectRepository.update(id, dto);

    await writeAuditLog({
      userId: requester.id,
      action: 'PROJECT_UPDATED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
      metadata: dto,
    });

    return withUnitsCount(updated);
  },

  // Manager reassignment preserves history: the outgoing manager's
  // ProjectManager row returns to the unassigned pool (ACTIVATED, projectId
  // null) rather than being deleted, so it remains a real, addressable
  // record; the incoming manager must independently pass the same
  // eligibility check a brand-new project's manager would.
  async reassignManager(id: string, dto: ReassignManagerDto, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    if (!isEditable(project.status)) {
      throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
    }

    const nextManager = await requireEligibleManager(dto.managerId, project.companyId);
    const outgoing = await projectManagerRepository.findByProjectId(id);

    await projectRepository.reassignManager({
      projectId: id,
      outgoingManagerId: outgoing?.id ?? null,
      incomingManagerId: nextManager.id,
      auditUserId: requester.id,
      auditIpAddress: ctx.ipAddress,
    });

    const updated = await projectRepository.findById(id);
    return withUnitsCount(updated!);
  },

  // Contractor reassignment is a plain FK swap - ContractorOrganization rows
  // are never deleted/exclusive to one project, so there is no "outgoing
  // record" to return anywhere (unlike the manager's 1:1 relation above).
  async reassignContractor(id: string, dto: ReassignContractorDto, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    if (!isEditable(project.status)) {
      throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
    }

    const contractor = await requireEligibleContractor(dto.primaryContractorId, project.companyId);

    const updated = await projectRepository.update(id, { primaryContractorId: contractor.id });

    await writeAuditLog({
      userId: requester.id,
      action: 'PRIMARY_CONTRACTOR_REASSIGNED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
      metadata: { contractorId: contractor.id },
    });

    return withUnitsCount(updated);
  },

  // POST /api/projects/{id}/cover (decisions.md E7) - honestly fails with
  // COVER_STORAGE_NOT_CONFIGURED rather than writing to Vercel-incompatible
  // local disk when no Supabase Storage credentials are configured.
  async uploadCover(id: string, dto: UploadCoverDto, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    if (!isEditable(project.status)) {
      throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
    }

    // Task 10 (decisions.md K3): the same MIME-whitelist + magic-number +
    // size validation the canonical report media path uses, reused rather than
    // reimplemented. Previously a cover was accepted on its declared mimeType
    // alone, so a renamed non-image reached the bucket.
    const { buffer, mimeType } = decodeAndValidateImage(dto);

    // Task 10: a uuid, not `Date.now()` - two covers uploaded in the same
    // millisecond used to collide onto one key.
    const key = `projects/${id}/cover-${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
    const { url } = await coverStorage.upload(key, buffer, mimeType);

    const previousKey = project.coverImageKey;
    const updated = await projectRepository.update(id, { coverImageKey: key, coverImageUrl: url });

    // Only after the new cover is committed, and never fatally: a leftover
    // object is a housekeeping problem, a lost cover is a product one.
    if (previousKey && previousKey !== key) {
      await coverStorage.remove(previousKey).catch((err) => {
        logger.warn('Superseded project cover could not be removed', {
          projectId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    await writeAuditLog({
      userId: requester.id,
      action: 'PROJECT_COVER_UPLOADED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
    });

    return withUnitsCount(updated);
  },

  // DRAFT -> ACTIVE (publish). Not documented as a distinct endpoint, but
  // Draft->Active is a real transition in 11_State_Machines.md with no other
  // trigger defined - exposed the same way Search Journey exposes /cancel.
  async publish(id: string, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    assertValidTransition(project.status, ProjectStatus.ACTIVE);

    const updated = await projectRepository.updateStatus(id, ProjectStatus.ACTIVE);

    await writeAuditLog({
      userId: requester.id,
      action: 'PROJECT_PUBLISHED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
    });

    return withUnitsCount(updated);
  },

  // PATCH /api/projects/{id}/status ({active: bool}) - replaces the forbidden
  // `DELETE /api/projects/{id}` (D5/A7). Task 4 (decisions.md E1): this now
  // toggles the reversible `isActive` flag, decoupled from the ARCHIVED
  // terminal state - it requires status=ACTIVE and never touches `status`
  // itself. Archiving is a separate, one-way action (see `archive` below).
  async updateStatus(id: string, active: boolean, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    assertCanToggleActive(project.status);

    const updated = await projectRepository.updateIsActive(id, active);

    await writeAuditLog({
      userId: requester.id,
      action: active ? 'PROJECT_REACTIVATED' : 'PROJECT_DEACTIVATED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
    });

    return withUnitsCount(updated);
  },

  // PATCH /api/projects/{id}/archive - the only path to ARCHIVED (decisions.md
  // E1). One-way, terminal, sets isActive=false at the same time. No
  // "unarchive" exists anywhere - COM-010 stays a real, enforced rule.
  async archive(id: string, requester: Requester, ctx: RequestContext) {
    const project = await requireOwnedProject(id, requester);
    assertArchivable(project.status);

    const updated = await projectRepository.archive(id);

    await writeAuditLog({
      userId: requester.id,
      action: 'PROJECT_ARCHIVED',
      entity: 'Project',
      entityId: id,
      ipAddress: ctx.ipAddress,
    });

    return withUnitsCount(updated);
  },
};
