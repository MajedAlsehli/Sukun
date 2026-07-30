import crypto from 'crypto';
import { InvitationPurpose, TechnicianStatus } from '@prisma/client';
import { technicianRepository } from './technician.repository';
import {
  toTechnicianDto,
  TechnicianInvitationInfo,
  TechnicianProfileDto,
  TechnicianReviewsDto,
  TechnicianSummaryDto,
} from './technician.mapper';
import { authRepository } from '../auth/auth.repository';
import { hashPassword } from '../auth/password.util';
import { invitationService } from '../auth/invitation.service';
import { reportRoutingService } from '../reports/report.routing';
import { reportRepository } from '../reports/report.repository';
import { invitationRepository } from '../auth/invitation.repository';
import { projectRepository } from '../projects/project.repository';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { notificationService } from '../notifications/notification.service';
import { AuthorizationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { UserRole } from '../shared/roles';
import { env } from '../config/env';
import {
  ListTechniciansQueryDto,
  RegisterTechnicianDto,
  TransferTechnicianDto,
  UpdateOwnStatusDto,
  UpdateTechnicianDto,
} from './technician.dto';

// 11_State_Machines.md #TECHNICIAN. Self-service transitions only - moving
// to/from INACTIVE is a Company action and isn't exposed here (no such
// Company-side endpoint exists yet either; see IMPROVEMENT_PROGRESS.md).
const ALLOWED_SELF_TRANSITIONS: Record<TechnicianStatus, TechnicianStatus[]> = {
  INVITED: [TechnicianStatus.ACTIVATED],
  ACTIVATED: [TechnicianStatus.AVAILABLE],
  AVAILABLE: [TechnicianStatus.BUSY],
  BUSY: [TechnicianStatus.AVAILABLE],
  INACTIVE: [],
};

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

interface RequestContext {
  ipAddress: string | null;
}

function requireLinkedCompany(requester: Requester): string {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  return requester.companyId;
}

// Object-level scoping for every technician-id-keyed RE5 endpoint (same
// pattern as homeowner.service.ts's requireCompanyHomeowner) - 404s rather
// than 403s so a cross-company id never confirms a technician exists.
async function requireCompanyTechnician(technicianId: string, requester: Requester) {
  const companyId = requireLinkedCompany(requester);
  const technician = await technicianRepository.findById(technicianId);
  if (!technician) {
    throw new NotFoundError('Technician not found', 'TECHNICIAN_NOT_FOUND');
  }
  const project = await projectRepository.findById(technician.projectId);
  if (!project || project.companyId !== companyId) {
    throw new NotFoundError('Technician not found', 'TECHNICIAN_NOT_FOUND');
  }
  return { technician, project, companyId };
}

// decisions.md F9: shared guard for both transfer and deactivate - a
// technician with any not-yet-COMPLETED repair must not be silently moved
// or locked out mid-job.
async function requireNoActiveRepair(technicianId: string) {
  const count = await technicianRepository.countActiveRepairs(technicianId);
  if (count > 0) {
    throw new BusinessError(
      'This technician has an active repair - resolve or reassign it before continuing',
      'TECHNICIAN_HAS_ACTIVE_REPAIR',
    );
  }
}

export const technicianService = {
  // POST /api/technicians (Company only) - Flow 11
  async register(dto: RegisterTechnicianDto, requester: Requester, ctx: RequestContext) {
    const companyId = requireLinkedCompany(requester);

    const project = await projectRepository.findById(dto.projectId);
    if (!project || project.companyId !== companyId) {
      throw new AuthorizationError('You do not own this project.');
    }

    const [byEmail, byPhone] = await Promise.all([
      authRepository.findUserByEmail(dto.email),
      authRepository.findUserByPhone(dto.phone),
    ]);
    if (byEmail) throw new BusinessError('Email already registered', 'EMAIL_ALREADY_EXISTS');
    if (byPhone) throw new BusinessError('Phone already registered', 'PHONE_ALREADY_EXISTS');

    // No usable password is ever set at creation time - the account can only
    // become usable through the invitation-acceptance flow below, so a
    // random unrevealed hash (never logged, never returned) is safe here.
    const unusablePasswordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));

    const technician = await technicianRepository.createWithUser({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      passwordHash: unusablePasswordHash,
      projectId: dto.projectId,
      specialty: dto.specialty,
    });

    await writeAuditLog({
      userId: requester.id,
      action: 'TECHNICIAN_REGISTERED',
      entity: 'Technician',
      entityId: technician.id,
      ipAddress: ctx.ipAddress,
    });

    // Purpose-bound, single-use, time-limited invitation token (Task 3) -
    // only its hash is ever persisted (invitation.repository.ts) and it is
    // never logged (writeAuditLog above carries no token material).
    // POST /api/auth/invitations/accept redeems it to set a real password
    // and activate the technician.
    const { raw: rawInvitationToken, expiresAt } = await invitationService.issue(
      technician.userId,
      InvitationPurpose.TECHNICIAN_ACTIVATION,
    );

    // NOT-004: invitation sends a notification. Honest about delivery status
    // - see notification.service.ts, no real Push/Email/SMS provider exists
    // anywhere in this environment, so 'not_configured' is the only truthful
    // value; never claim 'sent' for a delivery that didn't happen.
    await notificationService.send(
      technician.userId,
      'You have been registered as a technician',
      'Contact your company for your activation link.',
    );

    const invitation: TechnicianInvitationInfo = {
      expiresAt,
      recipientEmail: dto.email,
      deliveryStatus: 'not_configured',
      // Production must never expose the raw token or a token-bearing URL
      // merely because no delivery provider is configured - only a
      // non-production environment gets a preview to exercise the flow
      // without a real inbox.
      ...(env.nodeEnv !== 'production' ? { invitationPreview: rawInvitationToken } : {}),
    };

    return toTechnicianDto(technician, invitation);
  },

  // GET /api/technicians?projectId&q&status&sort&page&pageSize (decisions.md
  // F11: projectId is now optional - omitted means company-wide, RE5's list).
  async list(requester: Requester, query: ListTechniciansQueryDto) {
    const companyId = requireLinkedCompany(requester);

    if (query.projectId) {
      const project = await projectRepository.findById(query.projectId);
      if (!project || project.companyId !== companyId) {
        throw new AuthorizationError('You do not own this project.');
      }
    }

    const { items, total } = await technicianRepository.findAllByCompany(
      companyId,
      { projectId: query.projectId, q: query.q, status: query.status as TechnicianStatus | undefined },
      query.sort,
      query.page,
      query.pageSize,
    );

    return {
      items: items.map((technician) => toTechnicianDto(technician)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  },

  // GET /api/technicians/summary (Company only) - RE5's 6 KPI cards. Task 8
  // (decisions.md I14): the headline numbers are canonical post-ownership;
  // the legacy pre-ownership ones stay visible under `legacy`.
  async summary(requester: Requester): Promise<TechnicianSummaryDto> {
    const companyId = requireLinkedCompany(requester);
    return technicianRepository.companySummary(companyId);
  },

  // GET /api/technicians/{id} (Company only) - full RE5 profile: real stats,
  // manager name, honest null rating (decisions.md F12).
  async getById(technicianId: string, requester: Requester): Promise<TechnicianProfileDto> {
    const { technician, project } = await requireCompanyTechnician(technicianId, requester);

    const [manager, legacyStats, canonicalStats] = await Promise.all([
      projectManagerRepository.findByProjectIdWithUser(technician.projectId),
      technicianRepository.findLegacyStats(technicianId),
      // Task 8 (decisions.md I15): real canonical statistics through the one
      // canonical repository - not a second, divergent aggregation.
      reportRepository.technicianStats(technicianId),
    ]);

    return {
      ...toTechnicianDto(technician),
      projectName: project.name,
      managerName: manager?.user.name ?? null,
      openRepairsCount: canonicalStats.openReportsCount,
      completedRepairsCount: canonicalStats.completedRepairsCount,
      averageRepairDurationMinutes: canonicalStats.averageRepairDurationMinutes,
      averageRating: canonicalStats.averageRating,
      reviewsCount: canonicalStats.reviewsCount,
      legacy: legacyStats,
    };
  },

  // GET /technicians/me (Technician only) - self profile for the Contractor
  // Dashboard/Performance pages.
  async getMe(requester: Requester) {
    if (requester.role !== UserRole.TECHNICIAN) {
      throw new AuthorizationError('Only technicians have a technician profile.');
    }
    const technician = await technicianRepository.findByUserIdWithUser(requester.id);
    if (!technician) {
      throw new NotFoundError('Technician profile not found', 'TECHNICIAN_NOT_FOUND');
    }
    return toTechnicianDto(technician);
  },

  // PATCH /technicians/me/status (Technician only) - self-service status
  // update, restricted to ALLOWED_SELF_TRANSITIONS.
  async updateMyStatus(requester: Requester, dto: UpdateOwnStatusDto) {
    if (requester.role !== UserRole.TECHNICIAN) {
      throw new AuthorizationError('Only technicians can update their own status.');
    }
    const technician = await technicianRepository.findByUserId(requester.id);
    if (!technician) {
      throw new NotFoundError('Technician profile not found', 'TECHNICIAN_NOT_FOUND');
    }

    const allowed = ALLOWED_SELF_TRANSITIONS[technician.status];
    if (!allowed.includes(dto.status as TechnicianStatus)) {
      throw new BusinessError(
        `Cannot move from ${technician.status} to ${dto.status}`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const updated = await technicianRepository.updateStatus(
      technician.id,
      dto.status as TechnicianStatus,
    );

    await writeAuditLog({
      userId: requester.id,
      action: 'TECHNICIAN_STATUS_UPDATED',
      entity: 'Technician',
      entityId: technician.id,
      ipAddress: null,
    });

    return toTechnicianDto(updated);
  },

  // PATCH /api/technicians/{id} (Company only) - mobile/email/specialty only
  // (decisions.md F2) - project changes exclusively via /transfer.
  async update(technicianId: string, dto: UpdateTechnicianDto, requester: Requester, ctx: RequestContext) {
    const { technician } = await requireCompanyTechnician(technicianId, requester);

    if (dto.email) {
      const existing = await authRepository.findUserByEmail(dto.email);
      if (existing && existing.id !== technician.userId) {
        throw new BusinessError('Email already registered', 'EMAIL_ALREADY_EXISTS');
      }
    }
    if (dto.phone) {
      const existing = await authRepository.findUserByPhone(dto.phone);
      if (existing && existing.id !== technician.userId) {
        throw new BusinessError('Phone already registered', 'PHONE_ALREADY_EXISTS');
      }
    }

    await technicianRepository.updateContact(technicianId, {
      email: dto.email,
      phone: dto.phone,
      specialty: dto.specialty,
    });

    await writeAuditLog({
      userId: requester.id,
      action: 'TECHNICIAN_CONTACT_UPDATED',
      entity: 'Technician',
      entityId: technicianId,
      ipAddress: ctx.ipAddress,
      metadata: { email: dto.email, phone: dto.phone, specialty: dto.specialty },
    });

    return this.getById(technicianId, requester);
  },

  // POST /api/technicians/{id}/resend-invitation (Company only) - only
  // meaningful while still INVITED; reuses invitationService.issue, which
  // already revokes the previous outstanding token for this user+purpose.
  async resendInvitation(technicianId: string, requester: Requester, ctx: RequestContext) {
    const { technician } = await requireCompanyTechnician(technicianId, requester);

    if (technician.status !== TechnicianStatus.INVITED) {
      throw new BusinessError(
        'This technician has already been activated',
        'ALREADY_ACTIVATED',
      );
    }

    const { raw: rawInvitationToken, expiresAt } = await invitationService.issue(
      technician.userId,
      InvitationPurpose.TECHNICIAN_ACTIVATION,
    );

    await writeAuditLog({
      userId: requester.id,
      action: 'TECHNICIAN_INVITATION_RESENT',
      entity: 'Technician',
      entityId: technicianId,
      ipAddress: ctx.ipAddress,
    });

    await notificationService.send(
      technician.userId,
      'Your activation link has been resent',
      'Contact your company for your activation link.',
    );

    const invitation: TechnicianInvitationInfo = {
      expiresAt,
      recipientEmail: technician.user.email,
      deliveryStatus: 'not_configured',
      ...(env.nodeEnv !== 'production' ? { invitationPreview: rawInvitationToken } : {}),
    };

    return { ...(await this.getById(technicianId, requester)), invitation };
  },

  // POST /api/technicians/{id}/transfer (Company only) - decisions.md F9:
  // an active repair blocks the move; history/associations on past repairs
  // are structurally untouched by this (F3), only future eligibility moves.
  async transfer(technicianId: string, dto: TransferTechnicianDto, requester: Requester, ctx: RequestContext) {
    const { technician, companyId } = await requireCompanyTechnician(technicianId, requester);

    if (technician.status === TechnicianStatus.INACTIVE) {
      throw new BusinessError('Deactivated technicians cannot be transferred - reactivate first', 'TECHNICIAN_DEACTIVATED');
    }

    const targetProject = await projectRepository.findById(dto.projectId);
    if (!targetProject || targetProject.companyId !== companyId) {
      throw new AuthorizationError('You do not own this project.');
    }
    if (technician.projectId === dto.projectId) {
      throw new BusinessError('This technician is already assigned to this project', 'ALREADY_ON_PROJECT');
    }

    await requireNoActiveRepair(technicianId);

    await technicianRepository.updateProject(technicianId, dto.projectId);

    await writeAuditLog({
      userId: requester.id,
      action: 'TECHNICIAN_TRANSFERRED',
      entity: 'Technician',
      entityId: technicianId,
      ipAddress: ctx.ipAddress,
      metadata: { fromProjectId: technician.projectId, toProjectId: dto.projectId },
    });

    // Task 8 (decisions.md I9): the destination project may have reports
    // stuck in ROUTING_PENDING that this technician is now eligible for.
    reportRoutingService.scheduleRetry(dto.projectId);

    return this.getById(technicianId, requester);
  },

  // PATCH /api/technicians/{id}/status (Company only) - decisions.md F9/F10.
  async setStatus(technicianId: string, active: boolean, requester: Requester, ctx: RequestContext) {
    const { technician } = await requireCompanyTechnician(technicianId, requester);

    if (active) {
      if (technician.status !== TechnicianStatus.INACTIVE) {
        throw new BusinessError('This technician is not deactivated', 'NOT_DEACTIVATED');
      }
      const everAccepted = await invitationRepository.hasEverAccepted(
        technician.userId,
        InvitationPurpose.TECHNICIAN_ACTIVATION,
      );
      await technicianRepository.updateStatus(
        technicianId,
        everAccepted ? TechnicianStatus.ACTIVATED : TechnicianStatus.INVITED,
      );
    } else {
      if (technician.status === TechnicianStatus.INACTIVE) {
        throw new BusinessError('This technician is already deactivated', 'ALREADY_DEACTIVATED');
      }
      await requireNoActiveRepair(technicianId);
      await technicianRepository.updateStatus(technicianId, TechnicianStatus.INACTIVE);
    }

    await writeAuditLog({
      userId: requester.id,
      action: active ? 'TECHNICIAN_REACTIVATED' : 'TECHNICIAN_DEACTIVATED',
      entity: 'Technician',
      entityId: technicianId,
      ipAddress: ctx.ipAddress,
    });

    // Task 8 (decisions.md I9): reactivation can unblock pending routing.
    // Deactivation deliberately triggers nothing - it only ever removes
    // eligibility, and it is already blocked outright while the technician
    // holds in-flight work (F9, extended to canonical repairs in I14).
    if (active) {
      reportRoutingService.scheduleRetry(technician.projectId);
    }

    return this.getById(technicianId, requester);
  },

  // GET /api/technicians/{id}/reviews (Company only). Task 8 (decisions.md
  // I13/I15): real now - one review per closed canonical report, written by the
  // report's own homeowner at approval. F12's honest-null discipline still
  // holds: a technician with no reviews returns `[]` and `averageRating: null`,
  // never `0` and never a fabricated row. Visit feedback is NOT reused here.
  async reviews(technicianId: string, requester: Requester): Promise<TechnicianReviewsDto> {
    await requireCompanyTechnician(technicianId, requester);
    const [rows, stats] = await Promise.all([
      reportRepository.listReviewsByTechnician(technicianId, 50),
      reportRepository.technicianStats(technicianId),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        homeownerName: r.homeowner.name,
        reportId: r.report.id,
        reportNumber: r.report.reportNumber,
        category: r.report.category,
      })),
      averageRating: stats.averageRating,
      total: stats.reviewsCount,
    };
  },
};
