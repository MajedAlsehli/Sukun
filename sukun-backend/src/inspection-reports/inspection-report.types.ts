import { InspectionReport, InspectionReportStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type InspectionReportEntity = InspectionReport;
export { InspectionReportStatus };

// 11_State_Machines.md #INSPECTION REPORT + INS-025's WAITING_MANUAL_REVIEW.
// DRAFT/SUBMITTED are modeled for fidelity but transient/unreached as resting
// states: the single POST endpoint creates a report and immediately routes it
// into AI_PROCESSING (INS-039: "Report cannot skip AI stage").
const FORWARD_TRANSITIONS: Record<InspectionReportStatus, InspectionReportStatus[]> = {
  DRAFT: [InspectionReportStatus.SUBMITTED],
  SUBMITTED: [InspectionReportStatus.AI_PROCESSING],
  AI_PROCESSING: [
    InspectionReportStatus.ASSIGNED,
    InspectionReportStatus.WAITING_MANUAL_REVIEW,
  ],
  WAITING_MANUAL_REVIEW: [InspectionReportStatus.ASSIGNED],
  ASSIGNED: [InspectionReportStatus.REPAIR_IN_PROGRESS],
  REPAIR_IN_PROGRESS: [InspectionReportStatus.WAITING_APPROVAL],
  WAITING_APPROVAL: [InspectionReportStatus.CLOSED, InspectionReportStatus.REJECTED],
  REJECTED: [InspectionReportStatus.REPAIR_IN_PROGRESS],
  CLOSED: [],
};

// INS-008: Inspection Reports become immutable after closure.
export function isImmutable(status: InspectionReportStatus): boolean {
  return status === InspectionReportStatus.CLOSED;
}

export function assertValidTransition(
  current: InspectionReportStatus,
  next: InspectionReportStatus,
): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Inspection Report from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}
