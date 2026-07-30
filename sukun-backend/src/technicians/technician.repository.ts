import {
  Prisma,
  UserRole,
  TechnicianStatus,
  RepairStatus,
  ReportStatus,
  ReportRepairStatus,
} from '@prisma/client';
import { ACTIVE_REPORT_STATUSES } from '../reports/report.types';
import { prisma } from '../config/prisma';

const withUser = { user: true, _count: { select: { repairs: true } } } as const;

export const technicianRepository = {
  findById(id: string) {
    return prisma.technician.findUnique({ where: { id }, include: withUser });
  },

  findByUserId(userId: string) {
    return prisma.technician.findUnique({ where: { userId } });
  },

  findByUserIdWithUser(userId: string) {
    return prisma.technician.findUnique({ where: { userId }, include: withUser });
  },

  updateStatus(id: string, status: TechnicianStatus) {
    return prisma.technician.update({ where: { id }, data: { status }, include: withUser });
  },

  // Invitation acceptance: password + status commit together, same rationale
  // as homeownerRepository.activateAtomically - a failure partway through
  // must never leave a technician ACTIVATED with no usable password, or a
  // password set with the invitation token still unconsumed.
  activateWithPassword(userId: string, technicianId: string, passwordHash: string) {
    return prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.technician.update({
        where: { id: technicianId },
        data: { status: TechnicianStatus.ACTIVATED },
        include: withUser,
      }),
    ]);
  },

  findAllByProject(projectId: string) {
    return prisma.technician.findMany({ where: { projectId }, include: withUser });
  },

  // Creates the User (role=TECHNICIAN) and Technician record together -
  // Flow 11 treats "Technician Information" and "Assign Project" as one step.
  createWithUser(input: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    projectId: string;
    specialty: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash: input.passwordHash,
          role: UserRole.TECHNICIAN,
        },
      });

      return tx.technician.create({
        data: { projectId: input.projectId, userId: user.id, specialty: input.specialty },
        include: withUser,
      });
    });
  },

  // ---------------------------------------------------------------------
  // Task 5 (RE5): company-wide technician management additions.
  // ---------------------------------------------------------------------

  // decisions.md F11: projectId is now optional - when omitted, scopes by
  // Technician.project.companyId instead (same company-ownership check
  // every other list endpoint uses).
  async findAllByCompany(
    companyId: string,
    filters: { projectId?: string; q?: string; status?: TechnicianStatus },
    sort: 'newest' | 'name' | 'rating' | 'completed',
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.TechnicianWhereInput = {
      project: { companyId, ...(filters.projectId ? { id: filters.projectId } : {}) },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q
        ? {
            user: {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { email: { contains: filters.q, mode: 'insensitive' } },
                { phone: { contains: filters.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    // 'rating' has no backing data (decisions.md F12) - falls back to
    // newest-first honestly rather than faking a rating sort.
    const orderBy: Prisma.TechnicianOrderByWithRelationInput =
      sort === 'name' ? { user: { name: 'asc' } } : sort === 'completed' ? { repairs: { _count: 'desc' } } : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      prisma.technician.findMany({
        where,
        include: withUser,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.technician.count({ where }),
    ]);

    return { items, total };
  },

  // GET /api/technicians/summary (RE5's 6 KPI cards) - real counts by
  // status, plus real repair-duration/open-count numbers scoped to this
  // company's technicians. Rating stays null (decisions.md F12) - no model.
  async companySummary(companyId: string) {
    const [total, available, busy, openRepairs, completedRepairs] = await Promise.all([
      prisma.technician.count({ where: { project: { companyId } } }),
      prisma.technician.count({ where: { project: { companyId }, status: TechnicianStatus.AVAILABLE } }),
      prisma.technician.count({ where: { project: { companyId }, status: TechnicianStatus.BUSY } }),
      prisma.repair.count({
        where: { technician: { project: { companyId } }, status: { not: RepairStatus.COMPLETED } },
      }),
      prisma.repair.findMany({
        where: { technician: { project: { companyId } }, status: RepairStatus.COMPLETED },
        select: { startedAt: true, completedAt: true },
      }),
    ]);

    const durations = completedRepairs
      .filter((r) => r.startedAt && r.completedAt)
      .map((r) => (r.completedAt!.getTime() - r.startedAt!.getTime()) / 86_400_000);
    const averageRepairDurationDays =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    // Task 8 (decisions.md I14): canonical post-ownership numbers, computed
    // alongside - never summed with - the legacy pre-ownership ones above.
    const [canonicalOpen, canonicalApproved, ratingAgg] = await Promise.all([
      prisma.report.count({
        where: {
          project: { companyId },
          assignedTechnicianId: { not: null },
          status: { in: ACTIVE_REPORT_STATUSES },
        },
      }),
      prisma.reportRepair.findMany({
        where: {
          technician: { project: { companyId } },
          status: ReportRepairStatus.APPROVED,
        },
        select: { durationMinutes: true },
      }),
      prisma.reportReview.aggregate({
        where: { technician: { project: { companyId } } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const canonicalDurations = canonicalApproved
      .map((r) => r.durationMinutes)
      .filter((d): d is number => d != null);
    const averageRepairDurationMinutes =
      canonicalDurations.length > 0
        ? Math.round(canonicalDurations.reduce((a, b) => a + b, 0) / canonicalDurations.length)
        : null;

    return {
      totalTechnicians: total,
      availableCount: available,
      busyCount: busy,
      openRepairsCount: canonicalOpen,
      completedRepairsCount: canonicalApproved.length,
      averageRepairDurationMinutes,
      // Honest null (never 0) when no review exists yet - F12's discipline,
      // now backed by a real model rather than by an absent one.
      averageRating:
        ratingAgg._count._all > 0 ? Number((ratingAgg._avg.rating ?? 0).toFixed(2)) : null,
      reviewsCount: ratingAgg._count._all,
      legacy: {
        openRepairsCount: openRepairs,
        completedRepairsCount: completedRepairs.length,
        averageRepairDurationDays,
      },
      /** @deprecated kept so the pre-Task-8 field name still resolves. */
      averageRepairDurationDays,
    };
  },

  // email/phone live on the related User row (technician.userId), not on
  // Technician itself - specialty is the only field this actually owns.
  // Found and fixed via Task 5's live browser-verification pass: the
  // mocked-repository unit tests never caught this because they never hit
  // real Prisma schema validation.
  updateContact(id: string, data: { email?: string; phone?: string; specialty?: string }) {
    return prisma.$transaction(async (tx) => {
      const technician = await tx.technician.findUniqueOrThrow({ where: { id } });
      if (data.email !== undefined || data.phone !== undefined) {
        await tx.user.update({
          where: { id: technician.userId },
          data: { email: data.email, phone: data.phone },
        });
      }
      return tx.technician.update({
        where: { id },
        data: { specialty: data.specialty },
        include: withUser,
      });
    });
  },

  updateProject(id: string, projectId: string) {
    return prisma.technician.update({ where: { id }, data: { projectId }, include: withUser });
  },

  // decisions.md F9: shared active-repair guard for both transfer and
  // deactivation - any legacy Repair not yet COMPLETED, PLUS (Task 8,
  // decisions.md I14) any canonical post-ownership report still assigned to
  // this technician and not yet CLOSED.
  //
  // Adding the canonical half is a real correctness fix, not cosmetic: without
  // it, a technician holding an in-flight canonical repair could be transferred
  // or deactivated and their work orphaned - exactly what F9 exists to prevent.
  // The two counts are summed only for this guard; every *statistic* keeps them
  // strictly separate (I14).
  async countActiveRepairs(technicianId: string) {
    const [legacy, canonical] = await Promise.all([
      prisma.repair.count({
        where: { technicianId, status: { not: RepairStatus.COMPLETED } },
      }),
      prisma.report.count({
        where: { assignedTechnicianId: technicianId, status: { not: ReportStatus.CLOSED } },
      }),
    ]);
    return legacy + canonical;
  },

  // Legacy, technician-scoped pre-ownership stats (InspectionReport-side
  // `Repair` pipeline). Task 8 keeps this exactly as it was and surfaces it
  // under an explicit `legacy` key - the canonical post-ownership equivalent
  // is reportRepository.technicianStats (decisions.md I14).
  async findLegacyStats(technicianId: string) {
    const repairs = await prisma.repair.findMany({
      where: { technicianId },
      select: { status: true, startedAt: true, completedAt: true },
    });
    const open = repairs.filter((r) => r.status !== RepairStatus.COMPLETED).length;
    const completed = repairs.filter((r) => r.status === RepairStatus.COMPLETED);
    const durations = completed
      .filter((r) => r.startedAt && r.completedAt)
      .map((r) => (r.completedAt!.getTime() - r.startedAt!.getTime()) / 86_400_000);
    const averageRepairDurationDays =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    return { openRepairsCount: open, completedRepairsCount: completed.length, averageRepairDurationDays };
  },
};
