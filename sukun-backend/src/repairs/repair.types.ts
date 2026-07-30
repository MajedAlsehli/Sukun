import { Repair, RepairStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type RepairEntity = Repair;
export { RepairStatus };

// 11_State_Machines.md #REPAIR. ACCEPTED is modeled for fidelity but
// unreachable: Task 009's endpoint list has only "Start" (no separate
// "Accept"), so /start collapses ASSIGNED -> ACCEPTED -> IN_PROGRESS into one
// action - same "modeled but not currently reachable" pattern used elsewhere.
const FORWARD_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  ASSIGNED: [RepairStatus.ACCEPTED, RepairStatus.IN_PROGRESS],
  ACCEPTED: [RepairStatus.IN_PROGRESS],
  IN_PROGRESS: [RepairStatus.WAITING_VALIDATION],
  WAITING_VALIDATION: [RepairStatus.WAITING_CUSTOMER_APPROVAL],
  WAITING_CUSTOMER_APPROVAL: [RepairStatus.COMPLETED, RepairStatus.REJECTED],
  REJECTED: [RepairStatus.IN_PROGRESS],
  COMPLETED: [],
};

// REP-020: closed (completed) repairs become read-only.
export function isImmutable(status: RepairStatus): boolean {
  return status === RepairStatus.COMPLETED;
}

export function canUploadImages(status: RepairStatus): boolean {
  return status === RepairStatus.IN_PROGRESS;
}

export function assertValidTransition(current: RepairStatus, next: RepairStatus): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Repair from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}
