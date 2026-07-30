import {
  ReportCategory,
  ReportMediaStage,
  ReportPriority,
  ReportPrioritySource,
  ReportRepairStatus,
  ReportRoutingState,
  ReportStatus,
  ReportWarrantyVerdict,
} from '@prisma/client';
import { ReportWithRelations } from './report.repository';
import {
  computeSlaState,
  ReportSlaState,
  REPORT_SLA_RULES_VERSION,
  resolveAtRiskFraction,
} from './report.types';
import { env } from '../config/env';

/**
 * decisions.md J5a: resolved once, from configuration. Null in this
 * environment, so no AT_RISK label is produced anywhere - a report reads
 * ON_TIME until it genuinely BREACHES.
 */
export const CONFIGURED_AT_RISK_FRACTION = resolveAtRiskFraction(env.reportSla.atRiskFractionRaw);

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md I12/I15): ONE canonical report shape,
// projected per viewer.
//
// The same six screens (H9, C1, C2, C3, PM2, and the company's read-only view)
// read this DTO - there is no second report shape anywhere. What differs
// between roles is what the *server* puts in it, never what the client chooses
// to render: hiding a control in the UI is not authorization.
// ---------------------------------------------------------------------------

export type ReportViewerScope = 'HOMEOWNER' | 'TECHNICIAN' | 'PM' | 'COMPANY';

export interface ReportViewer {
  scope: ReportViewerScope;
  userId: string;
  /** Set only for TECHNICIAN - their own `Technician.id`, never a client value. */
  technicianId?: string | null;
}

export type ReportStatusGroup = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'CLOSED';

/**
 * H9's four filter chips (مفتوحة / قيد التنفيذ / بانتظار موافقتك / مغلقة) map
 * 1:1 onto these groups. ROUTING_PENDING and ROUTED both read as "open"
 * because in both a technician has yet to touch the report - which is exactly
 * what the reference's own "مفتوحة" bucket means.
 */
export function statusGroupOf(status: ReportStatus): ReportStatusGroup {
  switch (status) {
    case ReportStatus.ROUTING_PENDING:
    case ReportStatus.ROUTED:
      return 'OPEN';
    case ReportStatus.IN_PROGRESS:
      return 'IN_PROGRESS';
    case ReportStatus.AWAITING_OWNER_APPROVAL:
      return 'AWAITING_APPROVAL';
    case ReportStatus.CLOSED:
      return 'CLOSED';
  }
}

export interface ReportWarrantySnapshotDto {
  verdict: ReportWarrantyVerdict;
  reasonCode: string;
  categoryKey: string | null;
  rulesVersion: string;
  evaluatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface ReportSlaDto {
  dueAt: Date | null;
  state: ReportSlaState;
  rulesVersion: string;
}

export interface ReportLocationDto {
  projectId: string;
  projectName: string;
  projectCity: string;
  projectDistrict: string | null;
  buildingId: string;
  buildingName: string;
  buildingNumber: string;
  unitId: string;
  unitNumber: string;
  unitFloor: number;
}

export interface ReportPersonDto {
  id: string;
  name: string;
  /** Present only for the viewer whose job genuinely requires it (see mapper). */
  phone: string | null;
  email: string | null;
}

export interface ReportTechnicianDto {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
}

export interface ReportRepairDto {
  status: ReportRepairStatus;
  startedAt: Date;
  submittedAt: Date | null;
  homeownerDecisionAt: Date | null;
  technicianNote: string | null;
  homeownerReopenReason: string | null;
  durationMinutes: number | null;
  reopenCount: number;
}

export interface ReportAiDto {
  suggestedCategory: ReportCategory | null;
  confidence: number | null;
  problemText: string | null;
  explanation: string | null;
  provider: string | null;
  model: string | null;
}

export interface ReportReviewDto {
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface ReportMediaDto {
  id: string;
  stage: ReportMediaStage;
  url: string;
  mimeType: string;
  sortOrder: number;
  createdAt: Date;
}

export interface ReportPermissionsDto {
  canStart: boolean;
  canSubmitRepair: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

export interface ReportSummaryDto {
  id: string;
  reportNumber: number;
  status: ReportStatus;
  statusGroup: ReportStatusGroup;
  category: ReportCategory;
  categoryConfirmedByUser: boolean;
  priority: ReportPriority;
  prioritySource: ReportPrioritySource;
  problemText: string;
  homeownerNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  reopenCount: number;
  warranty: ReportWarrantySnapshotDto;
  sla: ReportSlaDto;
  location: ReportLocationDto;
  homeowner: ReportPersonDto;
  technician: ReportTechnicianDto | null;
  repair: ReportRepairDto | null;
  review: ReportReviewDto | null;
  ai: ReportAiDto | null;
  routing: {
    state: ReportRoutingState;
    reasonCode: string | null;
    attemptCount: number;
    lastAttemptAt: Date | null;
  };
  photoCounts: { homeowner: number; before: number; after: number };
  interventionNeeded: boolean;
  interventionReasonCode: string | null;
  permissions: ReportPermissionsDto;
}

export interface ReportDetailDto extends ReportSummaryDto {
  media: ReportMediaDto[];
}

/**
 * Contact-data policy (decisions.md I12), applied here so it cannot be
 * forgotten at a call site:
 *   * the homeowner sees their own contact details;
 *   * the ASSIGNED technician sees the homeowner's name and phone - they have
 *     to reach the resident to do the repair (C2's "اتصال بالمالك");
 *   * PM and Company see the homeowner's NAME only. Supervision does not
 *     require a resident's phone number or email, so they never receive one.
 */
function mapHomeowner(report: ReportWithRelations, viewer: ReportViewer): ReportPersonDto {
  const canSeeContact =
    viewer.scope === 'HOMEOWNER' ||
    (viewer.scope === 'TECHNICIAN' &&
      !!viewer.technicianId &&
      report.assignedTechnicianId === viewer.technicianId);

  return {
    id: report.homeowner.id,
    name: report.homeowner.name,
    phone: canSeeContact ? report.homeowner.phone : null,
    email: viewer.scope === 'HOMEOWNER' ? report.homeowner.email : null,
  };
}

function mapTechnician(report: ReportWithRelations, viewer: ReportViewer): ReportTechnicianDto | null {
  if (!report.assignedTechnician) return null;
  // The technician's own phone goes to their supervisors and to themselves,
  // not to the resident - H9 shows the homeowner who is handling their report,
  // not how to ring them directly.
  const canSeePhone = viewer.scope !== 'HOMEOWNER';
  return {
    id: report.assignedTechnician.id,
    name: report.assignedTechnician.user.name,
    specialty: report.assignedTechnician.specialty,
    phone: canSeePhone ? report.assignedTechnician.user.phone : null,
  };
}

function computeIntervention(
  report: ReportWithRelations,
  slaState: ReportSlaState,
): { needed: boolean; reasonCode: string | null } {
  if (report.status === ReportStatus.CLOSED) return { needed: false, reasonCode: null };
  if (slaState === 'BREACHED') return { needed: true, reasonCode: 'SLA_BREACHED' };
  if (report.reopenCount > 0) return { needed: true, reasonCode: 'REOPENED_BY_HOMEOWNER' };
  if (report.status === ReportStatus.ROUTING_PENDING) {
    return { needed: true, reasonCode: 'ROUTING_PENDING' };
  }
  return { needed: false, reasonCode: null };
}

/**
 * Mirrors exactly what the endpoints enforce (decisions.md I12) so the UI can
 * render honest affordances - PM and Company are structurally incapable of a
 * `true` here because no canonical mutating endpoint admits their role at all.
 */
function computePermissions(report: ReportWithRelations, viewer: ReportViewer): ReportPermissionsDto {
  const none: ReportPermissionsDto = {
    canStart: false,
    canSubmitRepair: false,
    canApprove: false,
    canReopen: false,
  };

  if (viewer.scope === 'TECHNICIAN') {
    const isAssignee = !!viewer.technicianId && report.assignedTechnicianId === viewer.technicianId;
    if (!isAssignee) return none;
    const repairStatus = report.repair?.status ?? null;
    return {
      canStart:
        (report.status === ReportStatus.ROUTED && repairStatus === null) ||
        (report.status === ReportStatus.IN_PROGRESS && repairStatus === ReportRepairStatus.REOPENED),
      canSubmitRepair:
        report.status === ReportStatus.IN_PROGRESS && repairStatus === ReportRepairStatus.IN_PROGRESS,
      canApprove: false,
      canReopen: false,
    };
  }

  if (viewer.scope === 'HOMEOWNER') {
    const isOwner = report.homeownerId === viewer.userId;
    const awaiting = report.status === ReportStatus.AWAITING_OWNER_APPROVAL;
    return { ...none, canApprove: isOwner && awaiting, canReopen: isOwner && awaiting };
  }

  // PM / COMPANY: supervisory, read-only, always.
  return none;
}

export function toReportSummaryDto(
  report: ReportWithRelations,
  viewer: ReportViewer,
  now: Date = new Date(),
): ReportSummaryDto {
  const slaState = computeSlaState({
    slaStartDueAt: report.slaStartDueAt,
    createdAt: report.createdAt,
    repairStartedAt: report.repair?.startedAt ?? null,
    now,
    atRiskFraction: CONFIGURED_AT_RISK_FRACTION,
  });
  const intervention = computeIntervention(report, slaState);

  const photoCounts = { homeowner: 0, before: 0, after: 0 };
  for (const m of report.media) {
    if (m.stage === ReportMediaStage.HOMEOWNER) photoCounts.homeowner += 1;
    else if (m.stage === ReportMediaStage.BEFORE) photoCounts.before += 1;
    else photoCounts.after += 1;
  }

  return {
    id: report.id,
    reportNumber: report.reportNumber,
    status: report.status,
    statusGroup: statusGroupOf(report.status),
    category: report.category,
    categoryConfirmedByUser: report.categoryConfirmedByUser,
    priority: report.priority,
    prioritySource: report.prioritySource,
    problemText: report.problemText,
    homeownerNote: report.homeownerNote,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    closedAt: report.closedAt,
    reopenCount: report.reopenCount,
    warranty: {
      verdict: report.warrantyVerdict,
      reasonCode: report.warrantyReasonCode,
      categoryKey: report.warrantyCategoryKey,
      rulesVersion: report.warrantyRulesVersion,
      evaluatedAt: report.warrantyEvaluatedAt,
      periodStart: report.warrantyPeriodStart,
      periodEnd: report.warrantyPeriodEnd,
    },
    sla: {
      dueAt: report.slaStartDueAt,
      state: slaState,
      rulesVersion: report.slaRulesVersion || REPORT_SLA_RULES_VERSION,
    },
    location: {
      projectId: report.project.id,
      projectName: report.project.name,
      projectCity: report.project.city,
      projectDistrict: report.project.district,
      buildingId: report.building.id,
      buildingName: report.building.name,
      buildingNumber: report.building.number,
      unitId: report.unit.id,
      unitNumber: report.unit.number,
      unitFloor: report.unit.floor,
    },
    homeowner: mapHomeowner(report, viewer),
    technician: mapTechnician(report, viewer),
    repair: report.repair
      ? {
          status: report.repair.status,
          startedAt: report.repair.startedAt,
          submittedAt: report.repair.submittedAt,
          homeownerDecisionAt: report.repair.homeownerDecisionAt,
          technicianNote: report.repair.technicianNote,
          homeownerReopenReason: report.repair.homeownerReopenReason,
          durationMinutes: report.repair.durationMinutes,
          reopenCount: report.repair.reopenCount,
        }
      : null,
    review: report.review
      ? { rating: report.review.rating, comment: report.review.comment, createdAt: report.review.createdAt }
      : null,
    // Null on the manual-entry path - never back-filled with a plausible
    // confidence so PM2 can honestly render "لا يوجد تحليل آلي" (I6).
    ai: report.aiProvider
      ? {
          suggestedCategory: report.aiSuggestedCategory,
          confidence: report.aiConfidence,
          problemText: report.aiProblemText,
          explanation: report.aiExplanation,
          provider: report.aiProvider,
          model: report.aiModel,
        }
      : null,
    routing: {
      state: report.routingState,
      reasonCode: report.routingReasonCode,
      attemptCount: report.routingAttemptCount,
      lastAttemptAt: report.lastRoutingAttemptAt,
    },
    photoCounts,
    interventionNeeded: intervention.needed,
    interventionReasonCode: intervention.reasonCode,
    permissions: computePermissions(report, viewer),
  };
}

export function toReportDetailDto(
  report: ReportWithRelations,
  viewer: ReportViewer,
  now: Date = new Date(),
): ReportDetailDto {
  return {
    ...toReportSummaryDto(report, viewer, now),
    media: report.media.map((m) => ({
      id: m.id,
      stage: m.stage,
      url: m.url,
      mimeType: m.mimeType,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
    })),
  };
}

export interface ReportTimelineEventDto {
  id: string;
  type: string;
  actorType: string;
  actorName: string | null;
  metadata: unknown;
  createdAt: Date;
}

export function toTimelineEventDto(event: {
  id: string;
  type: string;
  actorType: string;
  actor: { id: string; name: string } | null;
  metadata: unknown;
  createdAt: Date;
}): ReportTimelineEventDto {
  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actorName: event.actor?.name ?? null,
    metadata: event.metadata ?? null,
    createdAt: event.createdAt,
  };
}
