import { Unit, UnitStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type UnitEntity = Unit;
export { UnitStatus };

// 11_State_Machines.md #UNIT - forward-only occupancy lifecycle. Reserved/
// Delivered have no documented trigger anywhere in the 16 docs (no endpoint,
// no flow) - only Homeowner Activation (Task 011) completing is a real,
// grounded trigger, and it can legitimately happen from whichever stage the
// unit happens to be sitting in. Widened to allow AVAILABLE/RESERVED/DELIVERED
// all -> OCCUPIED directly, rather than blocking a real flow on unreachable
// intermediate steps (same reasoning as Search Journey's VISITING widening
// in Task 006).
const FORWARD_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  AVAILABLE: [UnitStatus.RESERVED, UnitStatus.OCCUPIED],
  RESERVED: [UnitStatus.DELIVERED, UnitStatus.OCCUPIED, UnitStatus.AVAILABLE],
  DELIVERED: [UnitStatus.OCCUPIED],
  OCCUPIED: [],
};

export function isEditable(status: UnitStatus): boolean {
  // Once a unit moves past AVAILABLE, its core details (number/floor/type)
  // are locked - by then it may already be referenced by a reservation/
  // ownership record. Not stated explicitly in the docs; a data-integrity
  // safeguard, flagged in the task report.
  return status === UnitStatus.AVAILABLE;
}

export function assertValidTransition(current: UnitStatus, next: UnitStatus): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Unit from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}
