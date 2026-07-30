import { Prisma, ReportRepairStatus, ReportStatus, ReportTimelineEventType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ACTIVE_REPORT_STATUSES } from '../reports/report.types';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md J15): every read here is either a
// grouped aggregate or a column-projected bounded query.
//
// The Supabase session pool caps this project at 15 clients, so there is
// deliberately NO per-technician and NO per-report query anywhere in this file:
// PM3's cards come from four groupBys, not from N round-trips.
//
// Nothing here reads the legacy pre-ownership InspectionReport/Repair pipeline
// (decisions.md I14/J9).
// ---------------------------------------------------------------------------

export const pmRepository = {
  /** The PM's own project. Identity comes from the principal, never a query param (J2). */
  findManagedProject(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, code: true, city: true, district: true, status: true, isActive: true, companyId: true },
    });
  },

  // -------------------------------------------------------------------------
  // Overview KPIs (J4) - two aggregates, not six queries.
  // -------------------------------------------------------------------------

  async statusCounts(projectId: string) {
    const rows = await prisma.report.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, count: r._count._all }));
  },

  countClosedInPeriod(projectId: string, periodStart: Date, periodEnd: Date) {
    return prisma.report.count({
      where: {
        projectId,
        status: ReportStatus.CLOSED,
        // Half-open [start, end) - a report closed at exactly midnight on the
        // 1st belongs to the new month, counted exactly once.
        closedAt: { gte: periodStart, lt: periodEnd },
      },
    });
  },

  /**
   * Resolution time = filing -> closure (J4). Deliberately NOT
   * `ReportRepair.durationMinutes` (first start -> approval), which is a
   * different real number that C3/RE5 already show. Column-projected: two
   * timestamps per closed report, never a hydrated row.
   */
  closedResolutionTimestamps(projectId: string) {
    return prisma.report.findMany({
      where: { projectId, status: ReportStatus.CLOSED, closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    });
  },

  /**
   * decisions.md J15's ONE documented per-row scan. It is bounded hard: only
   * reports with a configured SLA target are selected, and today only HIGH
   * priority reports have one (I10), so this is a small subset of one project's
   * reports - five projected columns, no relations hydrated.
   */
  slaEvaluableReports(projectId: string) {
    return prisma.report.findMany({
      where: { projectId, slaStartDueAt: { not: null } },
      select: {
        id: true,
        createdAt: true,
        slaStartDueAt: true,
        assignedTechnicianId: true,
        repair: { select: { startedAt: true } },
      },
    });
  },

  // -------------------------------------------------------------------------
  // Alerts (J6) - one bounded read over ACTIVE reports only. A closed report is
  // never alerted on, so it is not even fetched.
  // -------------------------------------------------------------------------

  alertCandidates(projectId: string, take: number) {
    return prisma.report.findMany({
      where: { projectId, status: { in: ACTIVE_REPORT_STATUSES } },
      select: {
        id: true,
        reportNumber: true,
        status: true,
        priority: true,
        problemText: true,
        createdAt: true,
        updatedAt: true,
        slaStartDueAt: true,
        reopenCount: true,
        routingReasonCode: true,
        assignedTechnicianId: true,
        assignedTechnician: { select: { user: { select: { name: true } } } },
        repair: { select: { startedAt: true, submittedAt: true, status: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
      take,
    });
  },

  // -------------------------------------------------------------------------
  // Activity (J7) - two real sources, both indexed, both bounded.
  // -------------------------------------------------------------------------

  timelineEvents(projectId: string, take: number) {
    return prisma.reportTimelineEvent.findMany({
      where: { report: { projectId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        type: true,
        actorType: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        report: { select: { id: true, reportNumber: true } },
      },
    });
  },

  technicianAuditEvents(technicianIds: string[], take: number) {
    if (technicianIds.length === 0) return Promise.resolve([]);
    return prisma.auditLog.findMany({
      where: { entity: 'Technician', entityId: { in: technicianIds } },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        action: true,
        entityId: true,
        timestamp: true,
        user: { select: { id: true, name: true } },
      },
    });
  },

  // -------------------------------------------------------------------------
  // PM3 (J9) - the roster, the historical assignees, and four groupBys.
  // -------------------------------------------------------------------------

  /** CURRENT roster: technicians whose `projectId` is this project today. */
  rosterTechnicians(projectId: string) {
    return prisma.technician.findMany({
      where: { projectId },
      select: {
        id: true,
        specialty: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, status: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  },

  /**
   * HISTORICAL assignees: technicians who hold canonical work in THIS project
   * but are no longer on its roster (transferred out, F9). One groupBy, then
   * one fetch for the ids it returns - never one query per technician.
   */
  async historicalTechnicians(projectId: string, rosterIds: string[]) {
    const rows = await prisma.report.groupBy({
      by: ['assignedTechnicianId'],
      where: {
        projectId,
        assignedTechnicianId: { not: null, notIn: rosterIds.length ? rosterIds : undefined },
      },
      _count: { _all: true },
    });
    const ids = rows
      .map((r) => r.assignedTechnicianId)
      .filter((id): id is string => id != null && !rosterIds.includes(id));
    if (ids.length === 0) return [];

    return prisma.technician.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        specialty: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, status: true } },
      },
    });
  },

  /** Open canonical reports per technician, scoped to THIS project. One query. */
  async openReportCounts(projectId: string, technicianIds: string[]) {
    if (technicianIds.length === 0) return new Map<string, number>();
    const rows = await prisma.report.groupBy({
      by: ['assignedTechnicianId'],
      where: {
        projectId,
        assignedTechnicianId: { in: technicianIds },
        status: { in: ACTIVE_REPORT_STATUSES },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.assignedTechnicianId as string, r._count._all]));
  },

  /**
   * Completed repairs + average duration per technician, scoped to THIS
   * project via a relation filter. One query, count and mean computed by
   * Postgres rather than in Node.
   */
  async completedRepairStats(projectId: string, technicianIds: string[]) {
    if (technicianIds.length === 0) {
      return new Map<string, { completed: number; averageDurationMinutes: number | null }>();
    }
    const rows = await prisma.reportRepair.groupBy({
      by: ['technicianId'],
      where: {
        technicianId: { in: technicianIds },
        status: ReportRepairStatus.APPROVED,
        report: { projectId },
      },
      _count: { _all: true },
      _avg: { durationMinutes: true },
    });
    return new Map(
      rows.map((r) => [
        r.technicianId,
        {
          completed: r._count._all,
          averageDurationMinutes:
            r._avg.durationMinutes != null ? Math.round(r._avg.durationMinutes) : null,
        },
      ]),
    );
  },

  /**
   * Ratings per technician from canonical `ReportReview` rows on reports in
   * THIS project (I13). One query. A technician with no reviews simply has no
   * row, which the mapper turns into an honest `null` - never `0` (F12).
   */
  async reviewStats(projectId: string, technicianIds: string[]) {
    if (technicianIds.length === 0) {
      return new Map<string, { averageRating: number | null; reviewsCount: number }>();
    }
    const rows = await prisma.reportReview.groupBy({
      by: ['technicianId'],
      where: { technicianId: { in: technicianIds }, report: { projectId } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      rows.map((r) => [
        r.technicianId,
        {
          averageRating:
            r._count._all > 0 && r._avg.rating != null ? Number(r._avg.rating.toFixed(2)) : null,
          reviewsCount: r._count._all,
        },
      ]),
    );
  },

  /** Which technicians currently hold an active repair. One query, ids only. */
  async technicianIdsWithActiveRepair(technicianIds: string[]) {
    if (technicianIds.length === 0) return new Set<string>();
    const rows = await prisma.reportRepair.findMany({
      where: { technicianId: { in: technicianIds }, status: ReportRepairStatus.IN_PROGRESS },
      select: { technicianId: true },
    });
    return new Set(rows.map((r) => r.technicianId));
  },

  // -------------------------------------------------------------------------
  // PM3 profile detail (J9/J10) - bounded per-technician reads, used only on
  // the single-technician endpoint, never inside a list loop.
  // -------------------------------------------------------------------------

  recentReportsForTechnician(projectId: string, technicianId: string, take: number) {
    return prisma.report.findMany({
      where: { projectId, assignedTechnicianId: technicianId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        reportNumber: true,
        status: true,
        priority: true,
        category: true,
        problemText: true,
        createdAt: true,
        closedAt: true,
        slaStartDueAt: true,
        repair: { select: { startedAt: true, durationMinutes: true } },
      },
    });
  },

  reviewsForTechnician(projectId: string, technicianId: string, take: number) {
    return prisma.reportReview.findMany({
      where: { technicianId, report: { projectId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        homeowner: { select: { id: true, name: true } },
        report: { select: { id: true, reportNumber: true, category: true, closedAt: true } },
      },
    });
  },

  slaEvaluableReportsForTechnician(projectId: string, technicianId: string) {
    return prisma.report.findMany({
      where: { projectId, assignedTechnicianId: technicianId, slaStartDueAt: { not: null } },
      select: {
        id: true,
        createdAt: true,
        slaStartDueAt: true,
        assignedTechnicianId: true,
        repair: { select: { startedAt: true } },
      },
    });
  },

  /** Does this technician hold ANY canonical work in this project? (J2 scoping.) */
  countReportsForTechnician(projectId: string, technicianId: string) {
    return prisma.report.count({ where: { projectId, assignedTechnicianId: technicianId } });
  },

  findTechnicianById(technicianId: string) {
    return prisma.technician.findUnique({
      where: { id: technicianId },
      select: {
        id: true,
        projectId: true,
        specialty: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, status: true } },
      },
    });
  },

  // -------------------------------------------------------------------------
  // Copilot grounding (J12) - today's movement, from counts only.
  // -------------------------------------------------------------------------

  async dailyCounts(projectId: string, since: Date, until: Date) {
    const where: Prisma.ReportWhereInput = { projectId };
    const [created, closed, reopened] = await Promise.all([
      prisma.report.count({ where: { ...where, createdAt: { gte: since, lt: until } } }),
      prisma.report.count({
        where: { ...where, status: ReportStatus.CLOSED, closedAt: { gte: since, lt: until } },
      }),
      // Reopens are real append-only timeline facts (I5), not a mutable
      // counter - counting the events is what actually happened today.
      prisma.reportTimelineEvent.count({
        where: {
          type: ReportTimelineEventType.HOMEOWNER_REOPENED,
          createdAt: { gte: since, lt: until },
          report: { projectId },
        },
      }),
    ]);
    return { created, closed, reopened };
  },
};
