import { ReportCategory, ReportPriority, ReportStatus } from '@prisma/client';
import { ReportSlaState } from '../reports/report.types';
import { PmAlert, PmAlertRules, PmTechnicianLoad, PmTechnicianMembership } from './pm.types';

// ---------------------------------------------------------------------------
// Task 9 (docs/integration/decisions.md J4/J9/J10): the PM response shapes.
//
// The PM is supervisory and read-only, so NOTHING here carries a permission
// flag, an action, or a mutable handle - there is no PM endpoint that could
// honour one. Contact and identity data is filtered here so a call site cannot
// forget to (the same reason report.mapper.ts filters homeowner contacts).
// ---------------------------------------------------------------------------

export interface PmProjectDto {
  id: string;
  name: string;
  code: string;
  city: string;
  district: string | null;
  status: string;
  isActive: boolean;
}

/** decisions.md J4 - the six KPIs, all canonical post-ownership, all server-computed. */
export interface PmKpisDto {
  /** Filed, nobody has started: ROUTING_PENDING + ROUTED. Disjoint from the next two. */
  openReports: number;
  inProgress: number;
  awaitingOwnerApproval: number;
  closedThisMonth: number;
  /** Null (never 0, never 100) when no report has a determined SLA outcome. */
  slaCompliancePercent: number | null;
  /** Filing -> closure. Null when nothing has closed. NOT repair duration. */
  averageResolutionTimeMinutes: number | null;
}

export interface PmOverviewDto {
  /** False for a manager in E3's unassigned pool - an honest state, not an error. */
  assigned: boolean;
  project: PmProjectDto | null;
  kpis: PmKpisDto;
  /** The server-resolved month window, so no client re-derives it in its own timezone. */
  period: { start: Date; end: Date };
  /** Makes the compliance percentage auditable instead of opaque. */
  sla: {
    eligibleCount: number;
    metCount: number;
    breachedCount: number;
    rulesVersion: string;
    atRiskPolicy: { configured: boolean; fraction: number | null; version: string };
  };
  totalActiveReports: number;
  generatedAt: Date;
}

export interface PmAlertDto {
  id: string;
  type: string;
  severity: string;
  reportId: string;
  reportNumber: number;
  problemText: string;
  priority: ReportPriority;
  status: ReportStatus;
  reasonCode: string | null;
  ageHours: number | null;
  technicianId: string | null;
  technicianName: string | null;
  occurredAt: Date;
  target: { type: 'report'; id: string };
}

export interface PmAlertsDto {
  assigned: boolean;
  items: PmAlertDto[];
  total: number;
  /**
   * decisions.md J6: null means the rule is NOT CONFIGURED and its alert type
   * was not generated - so the UI can say so honestly rather than implying the
   * condition was checked and found clean.
   */
  rules: PmAlertRules;
  generatedAt: Date;
}

export function toAlertDto(alert: PmAlert): PmAlertDto {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    reportId: alert.reportId,
    reportNumber: alert.reportNumber,
    problemText: alert.problemText,
    priority: alert.priority,
    status: alert.status,
    reasonCode: alert.reasonCode,
    ageHours: alert.ageHours,
    technicianId: alert.technicianId,
    technicianName: alert.technicianName,
    occurredAt: alert.occurredAt,
    target: alert.target,
  };
}

// ---------------------------------------------------------------------------
// Activity (J7)
// ---------------------------------------------------------------------------

export interface PmActivityItemDto {
  id: string;
  /** Source enum value. The frontend maps it to Arabic copy, as it does every other enum. */
  type: string;
  source: 'REPORT_TIMELINE' | 'TECHNICIAN_AUDIT';
  actorType: string;
  actorName: string | null;
  occurredAt: Date;
  target: { type: 'report' | 'technician'; id: string; label: string } | null;
}

export interface PmActivityDto {
  assigned: boolean;
  items: PmActivityItemDto[];
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// PM3 (J9/J10)
// ---------------------------------------------------------------------------

export interface PmContractorStatsDto {
  openReportsCount: number;
  completedReportsCount: number;
  /** Mean ReportRepair.durationMinutes over approved repairs IN THIS PROJECT. */
  averageRepairDurationMinutes: number | null;
  /** Honest null - never 0 - when this technician has no reviews (F12/I13). */
  averageRating: number | null;
  reviewsCount: number;
  /** Null on an empty denominator. Same formula as the project figure (J5). */
  slaCompliancePercent: number | null;
  slaEligibleCount: number;
}

export interface PmContractorCardDto {
  technicianId: string;
  name: string;
  specialty: string | null;
  technicianStatus: string;
  /** CURRENT roster vs. a transferred-out technician whose work here is real (J9). */
  membership: PmTechnicianMembership;
  load: PmTechnicianLoad;
  stats: PmContractorStatsDto;
}

export interface PmContractorsDto {
  assigned: boolean;
  kpis: {
    totalTechnicians: number;
    available: number;
    busy: number;
    /** Across the current roster; null when the project has no reviews at all. */
    averageRating: number | null;
    averageRepairDurationMinutes: number | null;
    /** Reports routed but not yet started - PM3's "بانتظار البدء" tile. */
    awaitingStartReports: number;
    historicalTechnicians: number;
  };
  items: PmContractorCardDto[];
  generatedAt: Date;
}

export interface PmContractorReportRefDto {
  id: string;
  reportNumber: number;
  status: ReportStatus;
  priority: ReportPriority;
  category: ReportCategory;
  problemText: string;
  createdAt: Date;
  closedAt: Date | null;
  slaState: ReportSlaState;
  durationMinutes: number | null;
}

export interface PmContractorReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  homeownerName: string;
  reportId: string;
  reportNumber: number;
  category: string;
}

/**
 * decisions.md J10 - the PM-safe technician profile.
 *
 * A distinct DTO, not a filtered `TechnicianProfileDto`. It OMITS, structurally:
 * email, invitation state / invitationPreview, the assigned manager's identity,
 * cross-project counts, and the legacy pre-ownership statistics block. Phone is
 * retained because I12 already grants a PM an assigned technician's phone in
 * the report DTO - withholding it here alone would be theatre, not policy.
 *
 * There is no `permissions` field because there is no PM mutation to permit.
 */
export interface PmContractorProfileDto {
  technicianId: string;
  name: string;
  phone: string;
  specialty: string | null;
  technicianStatus: string;
  membership: PmTechnicianMembership;
  load: PmTechnicianLoad;
  projectId: string;
  stats: PmContractorStatsDto;
  recentReports: PmContractorReportRefDto[];
  reviews: PmContractorReviewDto[];
  /** Read-only, always. Present so the UI cannot guess otherwise. */
  readOnly: true;
  generatedAt: Date;
}
