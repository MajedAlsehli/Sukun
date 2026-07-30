import { Project, ProjectStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type ProjectEntity = Project;
export { ProjectStatus };

// 11_State_Machines.md #PROJECT - forward-only, Archived is terminal/read-only (COM-010).
const FORWARD_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: [ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED],
  ACTIVE: [ProjectStatus.ARCHIVED],
  ARCHIVED: [],
};

export function isEditable(status: ProjectStatus): boolean {
  return status !== ProjectStatus.ARCHIVED;
}

// COM-009: archived projects remain searchable/visible to the public, just read-only.
export function isPubliclyVisible(status: ProjectStatus): boolean {
  return status !== ProjectStatus.DRAFT;
}

export function assertValidTransition(current: ProjectStatus, next: ProjectStatus): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Project from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

// Task 4 (decisions.md E1): isActive is orthogonal to status, meaningful
// only while status=ACTIVE - the reversible deactivate/reactivate toggle.
// ARCHIVED stays terminal (unchanged above) and is never reachable via this
// toggle - only via assertArchivable below.
export function assertCanToggleActive(status: ProjectStatus): void {
  if (status === ProjectStatus.ARCHIVED) {
    throw new BusinessError('Archived projects are read-only', 'PROJECT_ARCHIVED');
  }
  if (status === ProjectStatus.DRAFT) {
    throw new BusinessError(
      'A draft project must be published before it can be activated or deactivated',
      'PROJECT_NOT_PUBLISHED',
    );
  }
}

// Archiving is the only path to ARCHIVED (besides DRAFT -> ARCHIVED, already
// covered by assertValidTransition) - a dedicated one-way transition, same
// shape as the existing /publish endpoint.
export function assertArchivable(status: ProjectStatus): void {
  assertValidTransition(status, ProjectStatus.ARCHIVED);
}

// The effective "operationally live" reading a screen should use - both the
// enum and the reversible toggle must agree.
export function isOperationallyActive(status: ProjectStatus, isActive: boolean): boolean {
  return status === ProjectStatus.ACTIVE && isActive;
}
