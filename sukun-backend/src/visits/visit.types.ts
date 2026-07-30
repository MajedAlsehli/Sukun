import { Visit, VisitStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type VisitEntity = Visit;
export { VisitStatus };

// 11_State_Machines.md #VISIT. SCHEDULED/COMPLETED are modeled for fidelity to
// the diagram but currently unreachable through any documented endpoint (see
// schema.prisma comment on VisitStatus) - bookings start at CONFIRMED, and
// checkout lands on CHECKED_OUT to match the literal endpoint response
// ("Visit Closed" - 08_API_Specification.md), not a further COMPLETED step.
const FORWARD_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  SCHEDULED: [VisitStatus.CONFIRMED, VisitStatus.CANCELLED],
  CONFIRMED: [VisitStatus.CHECKED_IN, VisitStatus.CANCELLED],
  CHECKED_IN: [VisitStatus.CHECKED_OUT],
  CHECKED_OUT: [VisitStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

// VIS-005/VIS-003: Checked-Out and Cancelled visits become read-only/final.
export function isReadOnly(status: VisitStatus): boolean {
  return status === VisitStatus.CHECKED_OUT ||
    status === VisitStatus.COMPLETED ||
    status === VisitStatus.CANCELLED;
}

// VIS-004: Inspection Reports require Visit Status = Checked-In. Exported for
// Task 007 to enforce directly against a fetched Visit.
export function canCreateInspection(status: VisitStatus): boolean {
  return status === VisitStatus.CHECKED_IN;
}

export function assertValidTransition(current: VisitStatus, next: VisitStatus): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Visit from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

// Task 6 (decisions.md G9): reschedule changes date/time, not the status enum
// - a dedicated eligibility check, not an enum transition. Valid only before
// check-in (SCHEDULED is included for schema fidelity, same "modeled but
// currently unreachable" caveat as the enum value itself).
export function assertReschedulable(status: VisitStatus): void {
  if (status !== VisitStatus.SCHEDULED && status !== VisitStatus.CONFIRMED) {
    throw new BusinessError('This visit can no longer be rescheduled', 'VISIT_NOT_RESCHEDULABLE');
  }
}

// Task 6 (decisions.md G10): notes/issues are only captured during the live
// "زيارة جارية" phase, per Sakn Visit Experience.dc.html.
export function assertInProgress(status: VisitStatus): void {
  if (status !== VisitStatus.CHECKED_IN) {
    throw new BusinessError('This visit is not currently in progress', 'VISIT_NOT_IN_PROGRESS');
  }
}

// Task 6 (decisions.md G9/G11): checkout landing on CHECKED_OUT is the
// reachable terminal state for this flow (COMPLETED stays unreachable, same
// as before this task) - feedback's "completed-visit" requirement reads as
// CHECKED_OUT, an explicit interpretation recorded in decisions.md G9.
export function assertFeedbackEligible(status: VisitStatus): void {
  if (status !== VisitStatus.CHECKED_OUT && status !== VisitStatus.COMPLETED) {
    throw new BusinessError('Feedback can only be submitted after a completed visit', 'VISIT_NOT_COMPLETED');
  }
}
