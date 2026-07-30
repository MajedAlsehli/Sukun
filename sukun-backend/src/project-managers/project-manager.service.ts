import { projectManagerRepository } from './project-manager.repository';
import { toManagerDto } from './project-manager.mapper';
import { AuthorizationError } from '../shared/errors';
import { UserRole } from '../shared/roles';

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

function requireLinkedCompany(requester: Requester): string {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  return requester.companyId;
}

export const managerService = {
  // GET /api/managers?q - RE2 wizard step 4 picker. Only the unassigned,
  // activated pool (decisions.md E3) - no PM-management screen exists or is
  // implied by this endpoint.
  async list(requester: Requester, q: string | undefined, page: number, pageSize: number) {
    const companyId = requireLinkedCompany(requester);
    const { items, total } = await projectManagerRepository.findUnassigned(companyId, q, page, pageSize);
    return { items: items.map(toManagerDto), page, pageSize, total };
  },
};
