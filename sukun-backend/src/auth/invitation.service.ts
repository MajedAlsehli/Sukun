import { InvitationPurpose, TechnicianStatus } from '@prisma/client';
import { invitationRepository } from './invitation.repository';
import { authRepository } from './auth.repository';
import { hashPassword } from './password.util';
import { generateOpaqueToken, hashOpaqueToken, signAccessToken, ttlToDate } from './token.util';
import { toSafeUser } from './auth.mapper';
import { technicianRepository } from '../technicians/technician.repository';
import { AuthenticationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { reportRoutingService } from '../reports/report.routing';
import { UserRole } from '../shared/roles';
import { env } from '../config/env';

const INVITATION_TTL_DAYS = 7;

interface RequestContext {
  ipAddress: string | null;
}

/**
 * Purpose-bound invitation-token foundation (Task 3 integration prompt).
 * Only TECHNICIAN_ACTIVATION is wired end-to-end - the homeowner ownership
 * invitation's foundation is the pre-existing HomeownerActivation model
 * (code+QR), intentionally not duplicated here; see decisions.md.
 */
export const invitationService = {
  // Called by technician.service#register. Revokes any still-outstanding
  // invitation for the same user+purpose first (single active invitation,
  // same "resend expires the previous one" rule HomeownerActivation already
  // follows) so an old leaked link can never be used after a new one issues.
  async issue(userId: string, purpose: InvitationPurpose): Promise<{ raw: string; expiresAt: Date }> {
    await invitationRepository.revokeActiveForUser(userId, purpose);
    const { raw, hash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
    await invitationRepository.create({ userId, purpose, tokenHash: hash, expiresAt });
    return { raw, expiresAt };
  },

  // POST /api/auth/invitations/accept - public (the person isn't logged in
  // yet; the token itself is the credential, same trust model as
  // POST /api/homeowners/activate).
  async accept(token: string, password: string, ctx: RequestContext) {
    const tokenHash = hashOpaqueToken(token);
    const record = await invitationRepository.findByHash(tokenHash);

    if (!record || record.revokedAt) {
      throw new BusinessError('Invalid or revoked invitation token', 'INVALID_INVITATION_TOKEN');
    }
    // EDG: cannot be reused after acceptance - checked before expiry so a
    // used-but-now-also-expired token still reports the more specific error.
    if (record.usedAt) {
      throw new BusinessError('This invitation has already been used', 'INVITATION_ALREADY_USED');
    }
    if (record.expiresAt < new Date()) {
      throw new BusinessError('This invitation has expired - request a new one', 'INVITATION_EXPIRED');
    }

    if (record.purpose === InvitationPurpose.TECHNICIAN_ACTIVATION) {
      return this.acceptTechnicianActivation(record.id, record.userId, password, ctx);
    }

    // Exhaustive per current InvitationPurpose enum - throws only if a future
    // purpose is added to the schema without a matching branch here.
    throw new BusinessError('Unsupported invitation purpose', 'INVALID_INVITATION_TOKEN');
  },

  async acceptTechnicianActivation(
    invitationId: string,
    userId: string,
    password: string,
    ctx: RequestContext,
  ) {
    const technician = await technicianRepository.findByUserId(userId);
    if (!technician) {
      throw new NotFoundError('Technician profile not found', 'TECHNICIAN_NOT_FOUND');
    }
    // A technician can only ever leave INVITED via this path (see
    // technician.service.ts's self-service transition table, which excludes
    // INVITED->anything except via this endpoint) - already-activated means
    // the token's holder is retrying a consumed link.
    if (technician.status !== TechnicianStatus.INVITED) {
      throw new BusinessError(
        'This technician account has already been activated',
        'ALREADY_ACTIVATED',
      );
    }

    const passwordHash = await hashPassword(password);
    await technicianRepository.activateWithPassword(userId, technician.id, passwordHash);
    await invitationRepository.markUsed(invitationId);

    const user = await authRepository.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') {
      // Defense-in-depth: a company could deactivate the User row between
      // invitation issue and acceptance. Don't hand out tokens for a
      // deactivated account.
      throw new AuthenticationError('This account is deactivated', 'ACCOUNT_DEACTIVATED');
    }

    const accessToken = signAccessToken(userId, UserRole.TECHNICIAN, null);
    const { raw: refreshToken, hash: refreshHash } = generateOpaqueToken();
    await authRepository.createRefreshToken({
      userId,
      tokenHash: refreshHash,
      expiresAt: ttlToDate(env.jwt.refreshTtl),
    });

    await writeAuditLog({
      userId,
      action: 'TECHNICIAN_ACTIVATED',
      entity: 'Technician',
      entityId: technician.id,
      ipAddress: ctx.ipAddress,
    });

    // Task 8 (decisions.md I9): a newly-activated technician may be the first
    // eligible assignee for reports sitting in ROUTING_PENDING on their
    // project. Fire-and-forget - activation must never fail or hang because a
    // background retry sweep did.
    reportRoutingService.scheduleRetry(technician.projectId);

    return { user: toSafeUser(user), accessToken, refreshToken };
  },
};
