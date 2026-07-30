import { prisma } from '../config/prisma';
import { UserRole } from '../shared/roles';

// Repositories only talk to the database - no business rules, no AI, no notifications
// (12_Backend_Implementation_Guide.md #REPOSITORY RESPONSIBILITIES).
export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserByPhone(phone: string) {
    return prisma.user.findUnique({ where: { phone } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async createUserWithActiveSearchJourney(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    // Task 5 (decisions.md F1): only set when a Company creates a homeowner
    // through POST /api/homeowners for a brand-new person - self-registration
    // via /auth/register never collects this.
    nationalId?: string;
  }) {
    // SEA-001: creating an account automatically creates one Active Search Journey.
    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
        nationalId: input.nationalId,
        role: UserRole.HOME_SEEKER,
        searchJourneys: {
          create: {},
        },
      },
      include: { searchJourneys: true },
    });
  },

  incrementFailedAttempts(userId: string, attempts: number, lockedUntil: Date | null) {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  },

  resetFailedAttempts(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  createRefreshToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.refreshToken.create({ data: input });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  markRefreshTokenUsed(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  revokeAllRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordResetToken.create({ data: input });
  },

  findPasswordResetTokenByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  markPasswordResetTokenUsed(id: string) {
    return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  },
};
