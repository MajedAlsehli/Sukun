import { prisma } from '../config/prisma';
import { InvitationPurpose } from '@prisma/client';

export const invitationRepository = {
  create(input: { userId: string; purpose: InvitationPurpose; tokenHash: string; expiresAt: Date }) {
    return prisma.invitationToken.create({ data: input });
  },

  findByHash(tokenHash: string) {
    return prisma.invitationToken.findUnique({ where: { tokenHash } });
  },

  markUsed(id: string) {
    return prisma.invitationToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  // Resend semantics: an old outstanding invitation for the same user+purpose
  // must stop working once a new one is issued (single active invitation),
  // same pattern as HomeownerActivation's reissueCode.
  revokeActiveForUser(userId: string, purpose: InvitationPurpose) {
    return prisma.invitationToken.updateMany({
      where: { userId, purpose, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  // Task 5 (decisions.md F10): technician reactivation must not silently
  // bypass an unaccepted/expired invitation - this answers "has this user
  // ever actually completed invitation acceptance," without a new column.
  async hasEverAccepted(userId: string, purpose: InvitationPurpose): Promise<boolean> {
    const match = await prisma.invitationToken.findFirst({
      where: { userId, purpose, usedAt: { not: null } },
      select: { id: true },
    });
    return !!match;
  },
};
