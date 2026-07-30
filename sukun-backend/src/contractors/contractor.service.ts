import { contractorRepository } from './contractor.repository';
import { toContractorDto } from './contractor.mapper';
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

export const contractorService = {
  // GET /api/contractors?q - RE2 wizard step 5 picker. Active-only,
  // company-scoped, no cross-company leakage (decisions.md E2).
  async list(requester: Requester, q: string | undefined, page: number, pageSize: number) {
    const companyId = requireLinkedCompany(requester);
    const { items, total } = await contractorRepository.findMany(companyId, q, page, pageSize);
    return { items: items.map(toContractorDto), page, pageSize, total };
  },
};
