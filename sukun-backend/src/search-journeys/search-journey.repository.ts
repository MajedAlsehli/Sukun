import { prisma } from '../config/prisma';
import { SearchJourneyStatus, TERMINAL_STATUSES } from './search-journey.types';

export const searchJourneyRepository = {
  findActiveByUserId(userId: string) {
    return prisma.searchJourney.findFirst({
      where: { userId, status: { notIn: TERMINAL_STATUSES } },
      orderBy: { startedAt: 'desc' },
    });
  },

  findAllByUserId(userId: string) {
    return prisma.searchJourney.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.searchJourney.findFirst({ where: { id, userId } });
  },

  // Unscoped lookup for trusted server-side callers (other modules advancing
  // a journey's stage as a side effect of their own workflow) - never exposed
  // directly to a client-supplied request.
  findById(id: string) {
    return prisma.searchJourney.findUnique({ where: { id } });
  },

  // API_Specification.md: "POST /api/search-journey ... Previous journey
  // automatically closed." - both writes happen in one transaction so a
  // partial failure never leaves two journeys active at once (SEA-002).
  async closeActiveAndCreateNew(userId: string) {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.searchJourney.findFirst({
        where: { userId, status: { notIn: TERMINAL_STATUSES } },
      });

      if (previous) {
        await tx.searchJourney.update({
          where: { id: previous.id },
          data: { status: SearchJourneyStatus.CLOSED, closedAt: new Date() },
        });
      }

      const created = await tx.searchJourney.create({
        data: { userId, status: SearchJourneyStatus.CREATED },
      });

      return { previous, created };
    });
  },

  updateStatus(id: string, status: SearchJourneyStatus, closedAt: Date | null = null) {
    return prisma.searchJourney.update({ where: { id }, data: { status, closedAt } });
  },
};
