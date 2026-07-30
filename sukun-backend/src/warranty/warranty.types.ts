import { Warranty, WarrantyReport, WarrantyReportStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type WarrantyEntity = Warranty;
export type WarrantyReportEntity = WarrantyReport;
export { WarrantyReportStatus };

// 11_State_Machines.md #WARRANTY REPORT (Created/Eligibility Validation
// collapsed - see schema.prisma comment on the enum).
const FORWARD_TRANSITIONS: Record<WarrantyReportStatus, WarrantyReportStatus[]> = {
  AI_ANALYSIS: [WarrantyReportStatus.ASSIGNED, WarrantyReportStatus.WAITING_MANUAL_REVIEW],
  WAITING_MANUAL_REVIEW: [WarrantyReportStatus.ASSIGNED],
  ASSIGNED: [WarrantyReportStatus.REPAIR_IN_PROGRESS],
  REPAIR_IN_PROGRESS: [WarrantyReportStatus.WAITING_HOMEOWNER],
  WAITING_HOMEOWNER: [WarrantyReportStatus.CLOSED, WarrantyReportStatus.REJECTED],
  REJECTED: [WarrantyReportStatus.REPAIR_IN_PROGRESS],
  CLOSED: [],
};

// WAR-020: closed warranty reports become immutable.
export function isImmutable(status: WarrantyReportStatus): boolean {
  return status === WarrantyReportStatus.CLOSED;
}

export function assertValidTransition(
  current: WarrantyReportStatus,
  next: WarrantyReportStatus,
): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Warranty Report from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

// WAR-014/015: expiration checked automatically, expired = ineligible.
// `now` is overridable only for deterministic testing (warranty.rules.ts's
// computeCategoryState follows the same pattern) - every real caller uses
// server time via the default.
export function isWarrantyActive(warranty: WarrantyEntity, now: Date = new Date()): boolean {
  return warranty.endDate > now;
}
