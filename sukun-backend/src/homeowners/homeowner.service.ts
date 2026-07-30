import crypto from 'crypto';
import { homeownerRepository } from './homeowner.repository';
import {
  deriveHomeownerStatus,
  toHomeownerActivationDto,
  toHomeownerProfileDto,
  toHomeownerRecordDto,
  toMyHomeDto,
} from './homeowner.mapper';
import { authRepository } from '../auth/auth.repository';
import { hashPassword } from '../auth/password.util';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  ttlToDate,
} from '../auth/token.util';
import { toSessionResponseDto } from '../auth/auth.mapper';
import { resolveAccountState } from '../auth/accountState';
import { unitRepository } from '../units/unit.repository';
import { assertValidTransition as assertUnitTransition, UnitStatus } from '../units/unit.types';
import { buildingRepository } from '../buildings/building.repository';
import { projectRepository } from '../projects/project.repository';
import { searchJourneyRepository } from '../search-journeys/search-journey.repository';
import { searchJourneyService } from '../search-journeys/search-journey.service';
import { PRE_PURCHASE_STATUSES, SearchJourneyStatus } from '../search-journeys/search-journey.types';
import { warrantyRepository } from '../warranty/warranty.repository';
import { reportRepository } from '../reports/report.repository';
import { statusGroupOf } from '../reports/report.mapper';
import { notificationService } from '../notifications/notification.service';
import { AuthenticationError, AuthorizationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { UserRole } from '../shared/roles';
import { env } from '../config/env';
import {
  ActivateHomeownerDto,
  CreateHomeownerDto,
  ExportHomeownersQueryDto,
  ListHomeownersQueryDto,
  TransferHomeownerDto,
  UpdateHomeownerDto,
} from './homeowner.dto';

const ACTIVATION_CODE_TTL_DAYS = 7;

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

function requireLinkedCompany(requester: Requester): string {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  return requester.companyId;
}

// decisions.md F5/F14: object-level scoping for every user-id-keyed RE4
// endpoint - confirms the target user is on this company's roster before any
// read/mutation proceeds. 404s (not 403) to avoid revealing whether a given
// user id belongs to some *other* company's roster.
async function requireCompanyHomeowner(userId: string, requester: Requester) {
  const companyId = requireLinkedCompany(requester);
  const user = await homeownerRepository.findUserById(userId);
  if (!user) {
    throw new NotFoundError('Homeowner not found', 'HOMEOWNER_NOT_FOUND');
  }
  const belongs = await homeownerRepository.belongsToCompany(userId, companyId);
  if (!belongs) {
    throw new NotFoundError('Homeowner not found', 'HOMEOWNER_NOT_FOUND');
  }
  return { user, companyId };
}

interface RequestContext {
  ipAddress: string | null;
}

function generateActivationCode(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
  return { raw, hash: hashOpaqueToken(raw) };
}

// Task 7 (H6, decisions.md H6): logs every rejected activation attempt
// without ever including the submitted code/password - `reason` is always
// one of the same errorCode constants the thrown error itself uses.
async function logActivationFailure(
  activation: { id: string; userId: string } | null,
  reason: string,
  ctx: RequestContext,
): Promise<void> {
  await writeAuditLog({
    userId: activation?.userId ?? null,
    action: 'HOMEOWNER_ACTIVATION_FAILED',
    entity: 'HomeownerActivation',
    entityId: activation?.id ?? null,
    ipAddress: ctx.ipAddress,
    metadata: { reason },
  });
}

async function requireOwnedUnit(unitId: string, companyId: string) {
  const unit = await unitRepository.findById(unitId);
  if (!unit) {
    throw new NotFoundError('Unit not found', 'UNIT_NOT_FOUND');
  }
  const building = await buildingRepository.findById(unit.buildingId);
  const project = building ? await projectRepository.findById(building.projectId) : null;
  if (!project || project.companyId !== companyId) {
    throw new AuthorizationError('You do not own this unit.');
  }
  return unit;
}

export const homeownerService = {
  // POST /api/homeowners (Company only) - Flow 12
  async register(dto: CreateHomeownerDto, requesterId: string, companyId: string | null, ctx: RequestContext) {
    if (!companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }

    await requireOwnedUnit(dto.unitId, companyId);

    // EDG-006: unit already owned -> rejected.
    const existingOwnership = await homeownerRepository.findActiveOwnershipByUnit(dto.unitId);
    if (existingOwnership) {
      throw new BusinessError('This unit already has an active owner', 'UNIT_ALREADY_OWNED');
    }

    // decisions.md F6: duplicate national ID (a *different* person already
    // holds it) is checked before any user-matching logic below.
    //
    // `nationalId` is optional as of the pre-event change (it is collected in no
    // end-user journey). EVERY national-ID rule below is therefore conditional
    // on a value actually being supplied: with none, there is nothing to
    // conflict with, nothing to look up, and nothing is written to the column.
    // The uniqueness guarantee is unchanged for a supplied value — both this
    // check and the `@unique` index still hold.
    const suppliedNationalId = dto.nationalId?.trim() || null;
    const byNationalId = suppliedNationalId
      ? await homeownerRepository.findByNationalId(suppliedNationalId)
      : null;

    const [byEmail, byPhone] = await Promise.all([
      authRepository.findUserByEmail(dto.email),
      authRepository.findUserByPhone(dto.phone),
    ]);
    const existingUser = byEmail ?? byPhone;

    if (byNationalId && byNationalId.id !== existingUser?.id) {
      throw new BusinessError('This national ID is already registered to a different account', 'NATIONAL_ID_ALREADY_EXISTS');
    }

    let userId: string;
    if (existingUser) {
      if (existingUser.role !== UserRole.HOME_SEEKER && existingUser.role !== UserRole.HOMEOWNER) {
        throw new BusinessError(
          'This person cannot be activated as a homeowner',
          'INVALID_USER_FOR_HOMEOWNER_ACTIVATION',
        );
      }
      // decisions.md F6: the same person already has a national ID on file
      // that conflicts with the one just submitted - a real data-integrity
      // problem (two identities describing what should be one account), not
      // silently overwritten.
      // Only a SUPPLIED national ID can contradict the one on file. With none
      // supplied there is no claim to contradict, so an existing stored value is
      // left exactly as it is — never cleared, never overwritten.
      if (suppliedNationalId && existingUser.nationalId && existingUser.nationalId !== suppliedNationalId) {
        throw new BusinessError(
          'This person already has a different national ID on file',
          'IDENTITY_MISMATCH',
        );
      }
      // decisions.md F6: a second pending invitation for this exact
      // user+unit pair would leave two live codes for one unit outstanding
      // at once - reject rather than silently issuing a second one.
      const latestActivation = await homeownerRepository.findLatestActivationByUserId(existingUser.id);
      if (
        latestActivation &&
        latestActivation.unitId === dto.unitId &&
        latestActivation.status === 'PENDING' &&
        latestActivation.expiresAt > new Date()
      ) {
        throw new BusinessError(
          'An activation is already pending for this person and unit',
          'ACTIVATION_ALREADY_PENDING',
        );
      }
      userId = existingUser.id;
      // First time this person's national ID is recorded - fills it in
      // without disturbing anything else about the existing account. Runs only
      // when one was actually supplied: with none, the column keeps whatever it
      // already held (including NULL) rather than being written a placeholder.
      if (suppliedNationalId && !existingUser.nationalId) {
        await homeownerRepository.setNationalId(userId, suppliedNationalId);
      }
    } else {
      // Brand new person (external buyer who never used Sakn) - USR-003/004:
      // still one account for life, created fresh here rather than skipping
      // straight to a Homeowner-only record with no Search Journey history.
      const temporaryPassword = crypto.randomBytes(9).toString('base64url');
      const passwordHash = await hashPassword(temporaryPassword);
      const created = await authRepository.createUserWithActiveSearchJourney({
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        // `undefined` (not `''`, not a generated number) when none was supplied,
        // so Prisma omits the column and it stays NULL — which the `@unique`
        // index permits for any number of rows.
        nationalId: suppliedNationalId ?? undefined,
      });
      userId = created.id;
    }

    const { raw, hash } = generateActivationCode();
    const activation = await homeownerRepository.createActivation({
      unitId: dto.unitId,
      userId,
      codeHash: hash,
      expiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_DAYS * 86_400_000),
    });

    await writeAuditLog({
      userId: requesterId,
      action: 'HOMEOWNER_ACTIVATION_CREATED',
      entity: 'HomeownerActivation',
      entityId: activation.id,
      ipAddress: ctx.ipAddress,
    });

    // NOT-004: invitation sends a notification (best-effort in-app - the
    // account may have no verified way to reach the person yet; the raw
    // code is also returned directly to the Company - see homeowner.mapper.ts).
    await notificationService.send(
      userId,
      'You have been invited to activate your homeowner account',
      'Contact the real estate company for your activation code.',
    );
    return toHomeownerActivationDto(activation, raw);
  },

  // POST /api/homeowners/activate - public (no JWT yet - the customer is
  // mid-activation, not necessarily logged in with a valid session).
  //
  // Task 7 (H6, decisions.md H5/H6): every rejection branch below also
  // writes an audit log entry (HOMEOWNER_ACTIVATION_FAILED, reason only -
  // the submitted code/password is never logged) so repeated failed
  // attempts are visible without ever persisting the secret itself.
  async activate(dto: ActivateHomeownerDto, ctx: RequestContext) {
    const codeHash = hashOpaqueToken(dto.code);
    const activation = await homeownerRepository.findActivationByCodeHash(codeHash);

    // EDG-009: invalid code.
    if (!activation) {
      await logActivationFailure(null, 'INVALID_ACTIVATION_CODE', ctx);
      throw new BusinessError('Invalid activation code', 'INVALID_ACTIVATION_CODE');
    }
    // EDG-010: QR/code already consumed.
    if (activation.status === 'ACTIVATED') {
      await logActivationFailure(activation, 'ACTIVATION_CODE_ALREADY_USED', ctx);
      throw new BusinessError('This activation code has already been used', 'ACTIVATION_CODE_ALREADY_USED');
    }
    // EDG-008: expired invitation.
    if (activation.expiresAt < new Date()) {
      await logActivationFailure(activation, 'ACTIVATION_CODE_EXPIRED', ctx);
      throw new BusinessError(
        'This activation code has expired - request a new one',
        'ACTIVATION_CODE_EXPIRED',
      );
    }

    // Task 7 (H6, decisions.md H5): a deactivated account (ARCHIVED by a
    // Company - see setStatus below) must not be able to redeem a still-live
    // activation code just because the code itself hasn't expired. Checked
    // before any mutation, same "reject cleanly, no side effects" discipline
    // as the unit-transition check below.
    const user = await authRepository.findUserById(activation.userId);
    if (!user || user.status !== 'ACTIVE') {
      await logActivationFailure(activation, 'ACCOUNT_DEACTIVATED', ctx);
      throw new AuthenticationError('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    // EDG-006 re-checked here to close a race between two pending activations.
    const existingOwnership = await homeownerRepository.findActiveOwnershipByUnit(activation.unitId);
    if (existingOwnership) {
      await logActivationFailure(activation, 'UNIT_ALREADY_OWNED', ctx);
      throw new BusinessError('This unit already has an active owner', 'UNIT_ALREADY_OWNED');
    }

    // Validated BEFORE any mutation below: this used to run after the
    // password/role/ownership/activation writes had already committed, so a
    // rejection here (e.g. the unit is already OCCUPIED - which the HOM-001
    // race just above can produce for a second concurrent activation) used to
    // burn the one-time code and create a duplicate Ownership row while still
    // returning an error with no tokens to the client. Checking first makes
    // this a clean, side-effect-free rejection instead.
    const unit = await unitRepository.findById(activation.unitId);
    if (unit) {
      try {
        assertUnitTransition(unit.status, UnitStatus.OCCUPIED);
      } catch (err) {
        await logActivationFailure(activation, 'INVALID_STATE_TRANSITION', ctx);
        throw err;
      }
    }

    const passwordHash = await hashPassword(dto.password);
    await authRepository.updatePassword(activation.userId, passwordHash);
    // Atomic: role promotion + ownership creation + code consumption commit
    // together or not at all (previously three independent awaits).
    const [, ownership] = await homeownerRepository.activateAtomically(
      activation.id,
      activation.unitId,
      activation.userId,
    );

    if (unit) {
      await unitRepository.updateStatus(activation.unitId, UnitStatus.OCCUPIED);
    }

    // Task 010: Warranty coverage starts now - no policy-configuration
    // endpoint exists anywhere in the docs, so this activation moment is the
    // trigger, with a default term (see warranty.repository.ts#createDefault).
    // Task 7 (decisions.md H1): startDate is pinned to the *same* moment as
    // the Ownership row just created above (not a second, independent
    // `new Date()` read a few lines later) - this is also the authoritative
    // "handover date" H7 displays.
    const existingWarranty = await warrantyRepository.findByUnitId(activation.unitId);
    if (!existingWarranty) {
      await warrantyRepository.createDefault(activation.unitId, ownership.startDate);
    }

    // Flow: Purchase -> Homeowner Activation -> the journey that led here closes.
    const journey = await searchJourneyRepository.findActiveByUserId(activation.userId);
    if (journey && PRE_PURCHASE_STATUSES.includes(journey.status)) {
      await searchJourneyService.advanceStatus(journey.id, SearchJourneyStatus.PURCHASED, ctx);
      await searchJourneyService.advanceStatus(journey.id, SearchJourneyStatus.CLOSED, ctx);
    }

    await writeAuditLog({
      userId: activation.userId,
      action: 'HOMEOWNER_ACTIVATED',
      entity: 'User',
      entityId: activation.userId,
      ipAddress: ctx.ipAddress,
    });

    // NOT-005: activation sends a notification.
    await notificationService.send(
      activation.userId,
      'Homeowner account activated',
      'Your account has been activated. You now have access to warranty and homeowner services.',
    );

    const accessToken = signAccessToken(activation.userId, UserRole.HOMEOWNER, null);
    const { raw: refreshToken, hash: refreshHash } = generateOpaqueToken();
    await authRepository.createRefreshToken({
      userId: activation.userId,
      tokenHash: refreshHash,
      expiresAt: ttlToDate(env.jwt.refreshTtl),
    });

    // Re-fetch: `user` above was read before the role-promoting transaction
    // committed, so its `role` is still stale (HOME_SEEKER) - the session
    // response must reflect the just-promoted HOMEOWNER role/account state.
    const promotedUser = await authRepository.findUserById(activation.userId);
    const accountState = await resolveAccountState(promotedUser!);
    return { session: toSessionResponseDto(promotedUser!, accountState, accessToken), refreshToken };
  },

  // Not itemized with its own path in 08_API_Specification.md, but "Resend
  // Invitation" is explicit in Task 011's DoD and EDG-008 requires it.
  async resend(activationId: string, requesterId: string, companyId: string | null, ctx: RequestContext) {
    if (!companyId) {
      throw new AuthorizationError('This account is not linked to a company.');
    }

    const activation = await homeownerRepository.findActivationById(activationId);
    if (!activation) {
      throw new NotFoundError('Activation not found', 'ACTIVATION_NOT_FOUND');
    }
    await requireOwnedUnit(activation.unitId, companyId);

    if (activation.status === 'ACTIVATED') {
      throw new BusinessError('This homeowner has already been activated', 'ALREADY_ACTIVATED');
    }

    const { raw, hash } = generateActivationCode();
    const updated = await homeownerRepository.reissueCode(
      activationId,
      hash,
      new Date(Date.now() + ACTIVATION_CODE_TTL_DAYS * 86_400_000),
    );

    await writeAuditLog({
      userId: requesterId,
      action: 'HOMEOWNER_ACTIVATION_RESENT',
      entity: 'HomeownerActivation',
      entityId: activationId,
      ipAddress: ctx.ipAddress,
    });

    return toHomeownerActivationDto(updated, raw);
  },

  // GET /api/homeowners/me - added for the My Home frontend page: no
  // endpoint anywhere resolved "which unit does this Homeowner own" before
  // this, and GET /api/warranty requires the unitId as a query param, so the
  // frontend had no way to discover it.
  //
  // Task 7 (H7, decisions.md H7): extended to also carry the warranty
  // summary and an honest reports-summary boundary, so My Home needs exactly
  // one request, not a second round-trip the docs never resolved a shape
  // for. Never another homeowner's unit - scoped entirely by `userId`.
  async getMyHome(userId: string) {
    const ownership = await homeownerRepository.findActiveOwnershipByUserId(userId);
    if (!ownership) {
      throw new NotFoundError('No active home found for this account', 'NO_ACTIVE_OWNERSHIP');
    }
    const [warranty, openReportsCount] = await Promise.all([
      warrantyRepository.findByUnitId(ownership.unitId),
      // Task 8 (decisions.md I15): H7's reports strip is real now. Same
      // canonical scope predicate GET /api/reports uses for a homeowner - not
      // a second, divergent definition of "open".
      reportRepository.countOpen({ homeownerId: userId }),
    ]);
    return toMyHomeDto(ownership, warranty, openReportsCount);
  },

  // ---------------------------------------------------------------------
  // Task 5 (RE4): company-wide homeowner management.
  // ---------------------------------------------------------------------

  // GET /api/homeowners?q&status&page&pageSize (Company only)
  async list(requester: Requester, query: ListHomeownersQueryDto) {
    const companyId = requireLinkedCompany(requester);
    const { all, page, pageSize } = await homeownerRepository.findCompanyHomeowners(
      companyId,
      { q: query.q, status: query.status },
      query.page,
      query.pageSize,
    );

    const mapped = all.map((user) =>
      toHomeownerRecordDto(user, user.homeownerActivations[0] ?? null, user.ownerships[0] ?? null),
    );
    const filtered = query.status ? mapped.filter((h) => h.status === query.status) : mapped;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, page, pageSize, total };
  },

  // GET /api/homeowners/{id} (Company only) - id = User.id (decisions.md F5)
  async getProfile(userId: string, requester: Requester) {
    const { user } = await requireCompanyHomeowner(userId, requester);

    const [allActivations, allOwnerships, activeOwnership] = await Promise.all([
      homeownerRepository.findAllActivationsByUserId(userId),
      homeownerRepository.findAllOwnershipsByUserId(userId),
      homeownerRepository.findActiveOwnershipByUserIdWithContext(userId),
    ]);

    const currentUnitId = activeOwnership?.unitId ?? allActivations[0]?.unitId ?? null;
    const warranty = currentUnitId ? await warrantyRepository.findByUnitId(currentUnitId) : null;

    // Task 8 (decisions.md I15): RE4's report section is real canonical data
    // now, not the legacy WarrantyReport count F12/B1 had to settle for. Both
    // the count and the rows come from the canonical repository, scoped to this
    // homeowner - the company's own scope is already enforced above by
    // requireCompanyHomeowner, so this cannot leak across companies.
    const homeownerScope = { homeownerId: userId };
    const [openReportsCount, recentReports] = await Promise.all([
      reportRepository.countOpen(homeownerScope),
      reportRepository.list(homeownerScope, {}, 1, 10),
    ]);

    return toHomeownerProfileDto({
      user,
      latestActivation: allActivations[0] ?? null,
      activeOwnership,
      allActivations,
      allOwnerships,
      warranty: warranty ? { coverage: warranty.coverage, startDate: warranty.startDate, endDate: warranty.endDate } : null,
      openReportsCount,
      reports: recentReports.items.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        status: r.status,
        statusGroup: statusGroupOf(r.status),
        category: r.category,
        priority: r.priority,
        problemText: r.problemText,
        warrantyVerdict: r.warrantyVerdict,
        technicianName: r.assignedTechnician?.user.name ?? null,
        createdAt: r.createdAt,
        closedAt: r.closedAt,
      })),
    });
  },

  // GET /api/homeowners/by-unit/{unitNumber} (Company only) - decisions.md
  // F13: unit numbers are unique only per-building, this is a best-effort,
  // most-recent-match lookup, documented as such, not a precise guarantee.
  async getByUnit(unitNumber: string, requester: Requester) {
    const companyId = requireLinkedCompany(requester);
    const match = await homeownerRepository.findMostRecentByUnitNumberForCompany(companyId, unitNumber);
    if (!match) {
      throw new NotFoundError('No homeowner found for this unit', 'HOMEOWNER_NOT_FOUND');
    }
    return this.getProfile(match.userId, requester);
  },

  // PATCH /api/homeowners/{id} (Company only) - mobile/email only, per
  // decisions.md F1: nationalId/project/building/unit have no path here at
  // all (unit changes exclusively via /transfer).
  async update(userId: string, dto: UpdateHomeownerDto, requester: Requester, ctx: RequestContext) {
    await requireCompanyHomeowner(userId, requester);

    if (dto.email) {
      const existing = await authRepository.findUserByEmail(dto.email);
      if (existing && existing.id !== userId) {
        throw new BusinessError('Email already registered', 'EMAIL_ALREADY_EXISTS');
      }
    }
    if (dto.phone) {
      const existing = await authRepository.findUserByPhone(dto.phone);
      if (existing && existing.id !== userId) {
        throw new BusinessError('Phone already registered', 'PHONE_ALREADY_EXISTS');
      }
    }

    await homeownerRepository.updateContact(userId, { email: dto.email, phone: dto.phone });

    await writeAuditLog({
      userId: requester.id,
      action: 'HOMEOWNER_CONTACT_UPDATED',
      entity: 'User',
      entityId: userId,
      ipAddress: ctx.ipAddress,
      metadata: { email: dto.email, phone: dto.phone },
    });

    return this.getProfile(userId, requester);
  },

  // POST /api/homeowners/{id}/resend-invitation (Company only) - decisions.md
  // F5: resolves the user's latest activation internally, then reuses the
  // exact same reissue logic `resend()` (keyed by activation id) already has.
  async resendInvitationForUser(userId: string, requester: Requester, ctx: RequestContext) {
    const { companyId } = await requireCompanyHomeowner(userId, requester);
    const latest = await homeownerRepository.findLatestActivationByUserId(userId);
    if (!latest) {
      throw new NotFoundError('No activation found for this homeowner', 'ACTIVATION_NOT_FOUND');
    }
    return this.resend(latest.id, requester.id, companyId, ctx);
  },

  // POST /api/homeowners/{id}/transfer (Company only) - decisions.md F7.
  async transfer(userId: string, dto: TransferHomeownerDto, requester: Requester, ctx: RequestContext) {
    const { user, companyId } = await requireCompanyHomeowner(userId, requester);

    if (user.status !== 'ACTIVE') {
      throw new BusinessError('Deactivated homeowners cannot be transferred - reactivate first', 'HOMEOWNER_DEACTIVATED');
    }

    await requireOwnedUnit(dto.unitId, companyId);
    const occupied = await homeownerRepository.findActiveOwnershipByUnit(dto.unitId);
    if (occupied) {
      throw new BusinessError('This unit already has an active owner', 'UNIT_ALREADY_OWNED');
    }

    const activeOwnership = await homeownerRepository.findActiveOwnershipByUserIdWithContext(userId);

    if (activeOwnership) {
      // Verified, active homeowner - direct ownership transfer, no re-invitation.
      if (activeOwnership.unitId === dto.unitId) {
        throw new BusinessError('This homeowner already owns the target unit', 'ALREADY_OWNS_UNIT');
      }
      await homeownerRepository.transferActiveOwnership({
        oldOwnershipId: activeOwnership.id,
        oldUnitId: activeOwnership.unitId,
        newUnitId: dto.unitId,
        userId,
      });
      await writeAuditLog({
        userId: requester.id,
        action: 'HOMEOWNER_TRANSFERRED',
        entity: 'User',
        entityId: userId,
        ipAddress: ctx.ipAddress,
        metadata: { fromUnitId: activeOwnership.unitId, toUnitId: dto.unitId },
      });
    } else {
      // Still-pending homeowner - retarget the not-yet-redeemed activation,
      // no code/expiry reissue (decisions.md F7).
      const latest = await homeownerRepository.findLatestActivationByUserId(userId);
      if (!latest || latest.status !== 'PENDING') {
        throw new NotFoundError('No transferable assignment found for this homeowner', 'NO_TRANSFERABLE_ASSIGNMENT');
      }
      await homeownerRepository.reassignPendingActivationUnit(latest.id, dto.unitId);
      await writeAuditLog({
        userId: requester.id,
        action: 'HOMEOWNER_PENDING_UNIT_REASSIGNED',
        entity: 'HomeownerActivation',
        entityId: latest.id,
        ipAddress: ctx.ipAddress,
        metadata: { fromUnitId: latest.unitId, toUnitId: dto.unitId },
      });
    }

    return this.getProfile(userId, requester);
  },

  // PATCH /api/homeowners/{id}/status (Company only) - decisions.md F8:
  // reuses User.status, never touches Ownership.
  async setStatus(userId: string, active: boolean, requester: Requester, ctx: RequestContext) {
    await requireCompanyHomeowner(userId, requester);

    await homeownerRepository.setUserStatus(userId, active ? 'ACTIVE' : 'ARCHIVED');

    await writeAuditLog({
      userId: requester.id,
      action: active ? 'HOMEOWNER_REACTIVATED' : 'HOMEOWNER_DEACTIVATED',
      entity: 'User',
      entityId: userId,
      ipAddress: ctx.ipAddress,
    });

    return this.getProfile(userId, requester);
  },

  // GET /api/homeowners/export (Company only) - decisions.md F13. Returns
  // plain records; CSV formatting/escaping lives in homeowner.csv.ts so the
  // security-sensitive escaping logic has one, independently testable home.
  async listForExport(requester: Requester, query: ExportHomeownersQueryDto) {
    const companyId = requireLinkedCompany(requester);
    const { all } = await homeownerRepository.findCompanyHomeowners(companyId, query, 1, Number.MAX_SAFE_INTEGER);
    const mapped = all.map((user) =>
      toHomeownerRecordDto(user, user.homeownerActivations[0] ?? null, user.ownerships[0] ?? null),
    );
    return query.status ? mapped.filter((h) => h.status === query.status) : mapped;
  },
};
