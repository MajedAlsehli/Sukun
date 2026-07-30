import { authRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password.util';
import { generateOpaqueToken, hashOpaqueToken, signAccessToken, ttlToDate } from './token.util';
import { toSessionResponseDto, toSessionUserDto } from './auth.mapper';
import { resolveAccountState } from './accountState';
import { AuthTokens } from './auth.types';
import { technicianRepository } from '../technicians/technician.repository';
import { AuthenticationError, BusinessError, ValidationError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { UserRole, UserStatus, TechnicianStatus } from '@prisma/client';
import { env } from '../config/env';
import { LoginDto, RegisterDto } from './auth.dto';

const RESET_TOKEN_TTL = '30m';

// Fixed bcrypt hash used only to burn realistic compare time when an email
// doesn't exist (see login()) - not a real credential, never checked against.
const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO0j2h5cQY2WHRz9jMHZbz8k0P4kX7f9K';

interface RequestContext {
  ipAddress: string | null;
}

async function issueTokenPair(
  userId: string,
  role: UserRole,
  companyId: string | null,
): Promise<AuthTokens> {
  const accessToken = signAccessToken(userId, role, companyId);
  const { raw, hash } = generateOpaqueToken();

  await authRepository.createRefreshToken({
    userId,
    tokenHash: hash,
    expiresAt: ttlToDate(env.jwt.refreshTtl),
  });

  return { accessToken, refreshToken: raw };
}

// Deactivated accounts must fail login/refresh outright (Task 3 lifecycle
// rules). Technicians additionally have their own INACTIVE status (a Company
// action, independent of User.status) - a deactivated technician must also
// be unable to authenticate or refresh, even if the underlying User row is
// still ACTIVE.
async function assertAccountUsable(user: { id: string; status: UserStatus; role: UserRole }) {
  if (user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  }
  if (user.role === UserRole.TECHNICIAN) {
    const technician = await technicianRepository.findByUserId(user.id);
    if (technician?.status === TechnicianStatus.INACTIVE) {
      throw new AuthenticationError('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }
  }
}

export const authService = {
  // Flow 1 (06_Business_Flows.md): validation -> create user -> create active
  // search journey -> (send verification, deferred to Task 012 Notifications) -> tokens.
  async register(dto: RegisterDto, ctx: RequestContext) {
    const [byEmail, byPhone] = await Promise.all([
      authRepository.findUserByEmail(dto.email),
      authRepository.findUserByPhone(dto.phone),
    ]);

    // USR-001 / USR-002: one email, one phone per account.
    if (byEmail) throw new BusinessError('Email already registered', 'EMAIL_ALREADY_EXISTS');
    if (byPhone) throw new BusinessError('Phone already registered', 'PHONE_ALREADY_EXISTS');

    const passwordHash = await hashPassword(dto.password);
    const user = await authRepository.createUserWithActiveSearchJourney({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
    });

    const tokens = await issueTokenPair(user.id, user.role, user.companyId);
    const accountState = await resolveAccountState(user);

    await writeAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: user.id,
      ipAddress: ctx.ipAddress,
    });

    return {
      session: toSessionResponseDto(user, accountState, tokens.accessToken),
      refreshToken: tokens.refreshToken,
    };
  },

  // SEC-007: repeated failed logins trigger a temporary lock.
  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await authRepository.findUserByEmail(dto.email);
    if (!user) {
      // Run a dummy bcrypt compare so a non-existent email takes roughly the
      // same time as a wrong-password rejection below - otherwise the two
      // cases are distinguishable by response time (email enumeration).
      await verifyPassword(dto.password, DUMMY_PASSWORD_HASH);
      throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthenticationError(
        'Account temporarily locked due to repeated failed attempts',
        'ACCOUNT_LOCKED',
      );
    }

    const passwordValid = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= env.login.maxAttempts;
      await authRepository.incrementFailedAttempts(
        user.id,
        locked ? 0 : attempts,
        locked ? new Date(Date.now() + env.login.lockoutMinutes * 60_000) : null,
      );
      throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Checked after credentials so a wrong password on a deactivated account
    // still reports INVALID_CREDENTIALS, not ACCOUNT_DEACTIVATED - avoids
    // leaking account-status information to someone who doesn't already
    // know the correct password.
    await assertAccountUsable(user);

    await authRepository.resetFailedAttempts(user.id);
    const tokens = await issueTokenPair(user.id, user.role, user.companyId);
    const accountState = await resolveAccountState(user);

    // SEC-008 / AUD-001: every login is logged.
    await writeAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: ctx.ipAddress,
    });

    return {
      session: toSessionResponseDto(user, accountState, tokens.accessToken),
      refreshToken: tokens.refreshToken,
    };
  },

  // SEC-009: every logout is logged.
  //
  // Task 10: `userId` is now optional. Logout has to work when the access
  // token has already expired (a tab left open past the 15-minute access
  // TTL), or the refresh token is left live in the database and the "logged
  // out" user is silently restored on their next page load. When no access
  // token identifies the caller, the presented refresh-token record does -
  // and revocation is by token hash in both paths, so nothing is revoked that
  // the caller did not present.
  async logout(refreshToken: string | undefined, userId: string | undefined, ctx: RequestContext) {
    let subjectId = userId;

    if (refreshToken) {
      const tokenHash = hashOpaqueToken(refreshToken);
      if (!subjectId) {
        const record = await authRepository.findRefreshTokenByHash(tokenHash);
        subjectId = record?.userId;
      }
      await authRepository.revokeRefreshTokenByHash(tokenHash);
    }

    if (!subjectId) {
      // Nothing identified the caller and nothing was revoked. The response is
      // still a success - a logout with no session is not an error - but there
      // is no subject to attribute an audit entry to.
      return;
    }

    await writeAuditLog({
      userId: subjectId,
      action: 'USER_LOGOUT',
      entity: 'User',
      entityId: subjectId,
      ipAddress: ctx.ipAddress,
    });
  },

  // SEC-003: refresh tokens may only be used once - rotate on every use.
  async refresh(refreshToken: string) {
    const tokenHash = hashOpaqueToken(refreshToken);
    const record = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!record) {
      throw new AuthenticationError('Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    // Reuse detection: a token that was already rotated out (usedAt set)
    // being presented again means either a replay of an intercepted token or
    // a client bug racing two refreshes - either way, the safest response is
    // to burn every other live session for this user, not just this token.
    if (record.usedAt) {
      await authRepository.revokeAllRefreshTokens(record.userId);
      await writeAuditLog({
        userId: record.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entity: 'User',
        entityId: record.userId,
        ipAddress: null,
      });
      throw new AuthenticationError('Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    if (record.revokedAt || record.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    const user = await authRepository.findUserById(record.userId);
    if (!user) {
      throw new AuthenticationError('Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    // Token claims alone (the old access token) can't be trusted to still
    // reflect the account's current standing - re-check on every refresh so
    // a deactivation is enforced within, at most, one access-token TTL.
    await assertAccountUsable(user);

    await authRepository.markRefreshTokenUsed(record.id);
    const tokens = await issueTokenPair(user.id, user.role, user.companyId);
    const accountState = await resolveAccountState(user);

    return {
      session: toSessionResponseDto(user, accountState, tokens.accessToken),
      refreshToken: tokens.refreshToken,
    };
  },

  // GET /auth/me - session restoration / role-routing check for an already
  //-valid access token. Re-derives account state fresh (not from token
  // claims) so a role change or activation completed elsewhere is reflected
  // immediately, without waiting for the next refresh.
  async me(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
    }
    await assertAccountUsable(user);
    const accountState = await resolveAccountState(user);
    return toSessionUserDto(user, accountState);
  },

  // Deliberately does not reveal whether the email exists (standard practice
  // against account enumeration; not explicitly stated in the docs).
  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) return;

    const { raw, hash } = generateOpaqueToken();
    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: hash,
      expiresAt: ttlToDate(RESET_TOKEN_TTL),
    });

    // Actual delivery wired up in Task 012 (Notifications). For now the raw
    // token is only available server-side via this log - see report Pending Work.
    await writeAuditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'User',
      entityId: user.id,
      ipAddress: null,
      metadata: { resetTokenPreview: raw.slice(0, 8) },
    });
  },

  // SEC-006: sessions are invalidated after password reset.
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashOpaqueToken(token);
    const record = await authRepository.findPasswordResetTokenByHash(tokenHash);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updatePassword(record.userId, passwordHash);
    await authRepository.markPasswordResetTokenUsed(record.id);
    await authRepository.revokeAllRefreshTokens(record.userId);

    await writeAuditLog({
      userId: record.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'User',
      entityId: record.userId,
      ipAddress: null,
    });
  },
};
