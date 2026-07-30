import { Building, BuildingStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type BuildingEntity = Building;
export { BuildingStatus };

// 11_State_Machines.md #BUILDING - same forward-only shape as Project.
const FORWARD_TRANSITIONS: Record<BuildingStatus, BuildingStatus[]> = {
  DRAFT: [BuildingStatus.ACTIVE, BuildingStatus.ARCHIVED],
  ACTIVE: [BuildingStatus.ARCHIVED],
  ARCHIVED: [],
};

export function isEditable(status: BuildingStatus): boolean {
  return status !== BuildingStatus.ARCHIVED;
}

export function isPubliclyVisible(status: BuildingStatus): boolean {
  return status !== BuildingStatus.DRAFT;
}

export function assertValidTransition(current: BuildingStatus, next: BuildingStatus): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Building from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

// Task 4 (decisions.md E1): same isActive/status decoupling as Project.
export function assertCanToggleActive(status: BuildingStatus): void {
  if (status === BuildingStatus.ARCHIVED) {
    throw new BusinessError('Archived buildings are read-only', 'BUILDING_ARCHIVED');
  }
  if (status === BuildingStatus.DRAFT) {
    throw new BusinessError(
      'A draft building must be published before it can be activated or deactivated',
      'BUILDING_NOT_PUBLISHED',
    );
  }
}

export function assertArchivable(status: BuildingStatus): void {
  assertValidTransition(status, BuildingStatus.ARCHIVED);
}

export function isOperationallyActive(status: BuildingStatus, isActive: boolean): boolean {
  return status === BuildingStatus.ACTIVE && isActive;
}
