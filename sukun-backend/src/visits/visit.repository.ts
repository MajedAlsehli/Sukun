import { prisma } from '../config/prisma';
import { VisitIssueCategory, VisitStatus, VisitSuitability } from '@prisma/client';

export const visitRepository = {
  // VIS-008: duplicate bookings for the same unit+time are prohibited.
  // Cancelled visits don't hold the slot - excluded from the conflict check.
  // excludeVisitId (Task 6, decisions.md G9): a reschedule re-runs this same
  // check and must not conflict with its own prior slot.
  findConflicting(unitId: string, date: Date, time: string, excludeVisitId?: string) {
    return prisma.visit.findFirst({
      where: {
        unitId,
        date,
        time,
        status: { not: VisitStatus.CANCELLED },
        ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
      },
    });
  },

  findById(id: string) {
    return prisma.visit.findUnique({ where: { id } });
  },

  // Task 6 (decisions.md G9/G10/G11): H5's detail screen needs the visit
  // plus denormalized project/unit display fields and its real
  // notes/issues/feedback - one query, not N+1.
  findByIdWithDetails(id: string) {
    return prisma.visit.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, city: true } },
        unit: { select: { id: true, number: true } },
        notes: { orderBy: { createdAt: 'asc' } },
        issues: { orderBy: { createdAt: 'asc' } },
        feedback: true,
      },
    });
  },

  findAllByUser(userId: string) {
    return prisma.visit.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      include: { project: { select: { name: true } }, unit: { select: { number: true } } },
    });
  },

  create(input: {
    userId: string;
    projectId: string;
    unitId: string;
    searchJourneyId: string;
    date: Date;
    time: string;
  }) {
    return prisma.visit.create({ data: input });
  },

  updateStatus(id: string, status: VisitStatus, timestamps: { checkedInAt?: Date; checkedOutAt?: Date } = {}) {
    return prisma.visit.update({ where: { id }, data: { status, ...timestamps } });
  },

  // Task 6 (decisions.md G9): reschedule - date/time change plus the
  // counter/timestamp history fields, no status change.
  reschedule(id: string, date: Date, time: string) {
    return prisma.visit.update({
      where: { id },
      data: { date, time, rescheduleCount: { increment: 1 }, lastRescheduledAt: new Date() },
    });
  },

  createNote(input: {
    visitId: string;
    userId: string;
    text?: string;
    photoUrl?: string;
    photoStorageKey?: string;
  }) {
    return prisma.visitNote.create({ data: input });
  },

  createIssue(input: {
    visitId: string;
    userId: string;
    category: VisitIssueCategory;
    description?: string;
    photoUrl?: string;
    photoStorageKey?: string;
  }) {
    return prisma.visitIssue.create({ data: input });
  },

  findFeedbackByVisitId(visitId: string) {
    return prisma.visitFeedback.findUnique({ where: { visitId } });
  },

  createFeedback(input: {
    visitId: string;
    userId: string;
    rating: number;
    comment?: string;
    suitability?: VisitSuitability;
  }) {
    return prisma.visitFeedback.create({ data: input });
  },
};
