import {
  Prisma,
  ReportActorType,
  ReportPriority,
  ReportRepairStatus,
  ReportStatus,
  ReportTimelineEventType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ACTIVE_REPORT_STATUSES } from './report.types';

/**
 * Every write in this module runs inside the caller's transaction
 * (decisions.md I2/I8: "every state mutation is transactional and audited"),
 * so each method takes an optional client. Defaulting to the shared `prisma`
 * keeps read paths simple.
 */
export type Db = Prisma.TransactionClient | typeof prisma;

export const reportInclude = {
  homeowner: { select: { id: true, name: true, email: true, phone: true, status: true } },
  unit: { select: { id: true, number: true, floor: true, type: true } },
  building: { select: { id: true, name: true, number: true } },
  project: { select: { id: true, name: true, city: true, district: true, companyId: true } },
  assignedTechnician: {
    include: { user: { select: { id: true, name: true, email: true, phone: true, status: true } } },
  },
  media: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
  repair: true,
  review: true,
} satisfies Prisma.ReportInclude;

export type ReportWithRelations = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

export interface ReportListFilters {
  projectId?: string;
  unitId?: string;
  homeownerId?: string;
  technicianId?: string;
  status?: ReportStatus[];
  /** Task 9 (decisions.md J8): PM1's priority filter, on the ONE canonical query. */
  priority?: ReportPriority[];
  /** Matches a report number (with or without a leading '#') or the problem text. */
  search?: string;
}

export const reportRepository = {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  findById(reportId: string, db: Db = prisma) {
    return db.report.findUnique({ where: { id: reportId }, include: reportInclude });
  },

  findByIdBasic(reportId: string, db: Db = prisma) {
    return db.report.findUnique({ where: { id: reportId }, include: { repair: true } });
  },

  /**
   * The single canonical list query. Every caller (GET /api/reports, RE3's
   * reports tab, RE4's homeowner profile, H7's open count) goes through this
   * one `where` builder - decisions.md I15's "no duplicate report queries".
   *
   * `scope` is built from the authenticated principal by the service and is
   * ALWAYS intersected with, never replaced by, the client's filters.
   */
  buildWhere(scope: Prisma.ReportWhereInput, filters: ReportListFilters): Prisma.ReportWhereInput {
    const and: Prisma.ReportWhereInput[] = [scope];

    if (filters.projectId) and.push({ projectId: filters.projectId });
    if (filters.unitId) and.push({ unitId: filters.unitId });
    if (filters.homeownerId) and.push({ homeownerId: filters.homeownerId });
    if (filters.technicianId) and.push({ assignedTechnicianId: filters.technicianId });
    if (filters.status?.length) and.push({ status: { in: filters.status } });
    if (filters.priority?.length) and.push({ priority: { in: filters.priority } });

    if (filters.search) {
      const raw = filters.search.trim().replace(/^#/, '');
      const asNumber = Number.parseInt(raw, 10);
      const or: Prisma.ReportWhereInput[] = [
        { problemText: { contains: filters.search.trim(), mode: 'insensitive' } },
      ];
      if (Number.isFinite(asNumber) && String(asNumber) === raw) {
        or.push({ reportNumber: asNumber });
      }
      and.push({ OR: or });
    }

    return { AND: and };
  },

  async list(
    scope: Prisma.ReportWhereInput,
    filters: ReportListFilters,
    page: number,
    pageSize: number,
    db: Db = prisma,
  ) {
    const where = reportRepository.buildWhere(scope, filters);
    const [items, total] = await Promise.all([
      db.report.findMany({
        where,
        include: reportInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.report.count({ where }),
    ]);
    return { items, total };
  },

  countByStatus(scope: Prisma.ReportWhereInput, db: Db = prisma) {
    return db.report.groupBy({ by: ['status'], where: scope, _count: { _all: true } });
  },

  countOpen(scope: Prisma.ReportWhereInput, db: Db = prisma) {
    return db.report.count({ where: { AND: [scope, { status: { in: ACTIVE_REPORT_STATUSES } }] } });
  },

  count(where: Prisma.ReportWhereInput, db: Db = prisma) {
    return db.report.count({ where });
  },

  // -------------------------------------------------------------------------
  // Timeline - APPEND ONLY (decisions.md I5).
  // There is deliberately no update and no delete method here, and none must
  // ever be added: the timeline is the audit trail the six report screens read.
  // -------------------------------------------------------------------------

  appendTimelineEvent(
    input: {
      reportId: string;
      type: ReportTimelineEventType;
      actorType: ReportActorType;
      actorId?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
    db: Db = prisma,
  ) {
    return db.reportTimelineEvent.create({
      data: {
        reportId: input.reportId,
        type: input.type,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        metadata: input.metadata,
      },
    });
  },

  listTimeline(reportId: string, db: Db = prisma) {
    return db.reportTimelineEvent.findMany({
      where: { reportId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
  },

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  createMedia(data: Prisma.ReportMediaCreateManyInput[], db: Db = prisma) {
    return db.reportMedia.createMany({ data });
  },

  countMedia(reportId: string, stage: 'HOMEOWNER' | 'BEFORE' | 'AFTER', db: Db = prisma) {
    return db.reportMedia.count({ where: { reportId, stage } });
  },

  maxMediaSortOrder(reportId: string, stage: 'HOMEOWNER' | 'BEFORE' | 'AFTER', db: Db = prisma) {
    return db.reportMedia.aggregate({ where: { reportId, stage }, _max: { sortOrder: true } });
  },

  // -------------------------------------------------------------------------
  // Repair
  // -------------------------------------------------------------------------

  findActiveRepairByTechnician(technicianId: string, db: Db = prisma) {
    return db.reportRepair.findFirst({
      where: { technicianId, status: ReportRepairStatus.IN_PROGRESS },
      include: { report: { select: { id: true, reportNumber: true, problemText: true } } },
    });
  },

  createRepair(data: Prisma.ReportRepairUncheckedCreateInput, db: Db = prisma) {
    return db.reportRepair.create({ data });
  },

  updateRepair(repairId: string, data: Prisma.ReportRepairUpdateInput, db: Db = prisma) {
    return db.reportRepair.update({ where: { id: repairId }, data });
  },

  listRepairHistory(technicianId: string, page: number, pageSize: number, db: Db = prisma) {
    const where: Prisma.ReportRepairWhereInput = {
      technicianId,
      status: ReportRepairStatus.APPROVED,
    };
    return Promise.all([
      db.reportRepair.findMany({
        where,
        include: {
          review: true,
          report: { include: reportInclude },
        },
        orderBy: [{ homeownerDecisionAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.reportRepair.count({ where }),
    ]);
  },

  // -------------------------------------------------------------------------
  // Review
  // -------------------------------------------------------------------------

  createReview(data: Prisma.ReportReviewUncheckedCreateInput, db: Db = prisma) {
    return db.reportReview.create({ data });
  },

  listReviewsByTechnician(technicianId: string, take: number, db: Db = prisma) {
    return db.reportReview.findMany({
      where: { technicianId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: {
        homeowner: { select: { id: true, name: true } },
        report: { select: { id: true, reportNumber: true, category: true, closedAt: true } },
      },
    });
  },

  // -------------------------------------------------------------------------
  // Canonical technician statistics (decisions.md I14) - post-ownership only,
  // never summed with the legacy `Repair` (pre-ownership) pipeline.
  // -------------------------------------------------------------------------

  async technicianStats(technicianId: string, db: Db = prisma) {
    const [openCount, approved, ratingAgg] = await Promise.all([
      db.report.count({
        where: { assignedTechnicianId: technicianId, status: { in: ACTIVE_REPORT_STATUSES } },
      }),
      db.reportRepair.findMany({
        where: { technicianId, status: ReportRepairStatus.APPROVED },
        select: { durationMinutes: true },
      }),
      db.reportReview.aggregate({
        where: { technicianId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const durations = approved.map((r) => r.durationMinutes).filter((d): d is number => d != null);
    const averageRepairDurationMinutes =
      durations.length > 0
        ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
        : null;

    return {
      openReportsCount: openCount,
      completedRepairsCount: approved.length,
      averageRepairDurationMinutes,
      // Honest null (never 0) when a technician has no reviews yet - F12's
      // discipline, now finally backed by a real model.
      averageRating: ratingAgg._count._all > 0 ? Number(ratingAgg._avg.rating?.toFixed(2)) : null,
      reviewsCount: ratingAgg._count._all,
    };
  },

  /**
   * Bulk variant of the open-report count, for the RE5 technician *list*
   * (one query instead of N). Returns a map of technicianId -> open count.
   */
  async openReportCountsByTechnician(technicianIds: string[], db: Db = prisma) {
    if (technicianIds.length === 0) return new Map<string, number>();
    const rows = await db.report.groupBy({
      by: ['assignedTechnicianId'],
      where: {
        assignedTechnicianId: { in: technicianIds },
        status: { in: ACTIVE_REPORT_STATUSES },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.assignedTechnicianId as string, r._count._all]));
  },
};
