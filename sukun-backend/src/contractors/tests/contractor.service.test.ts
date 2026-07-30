import { contractorService } from '../contractor.service';
import { contractorRepository } from '../contractor.repository';
import { UserRole } from '../../shared/roles';

jest.mock('../contractor.repository');

const mockedRepo = contractorRepository as jest.Mocked<typeof contractorRepository>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const pmRequester = { id: 'user-2', role: UserRole.PROJECT_MANAGER, companyId: null };
const technicianRequester = { id: 'user-3', role: UserRole.TECHNICIAN, companyId: null };

describe('contractorService.list', () => {
  it('rejects a non-Company role (no cross-company or role leakage)', async () => {
    await expect(contractorService.list(pmRequester, undefined, 1, 20)).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(contractorService.list(technicianRequester, undefined, 1, 20)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('rejects a Company-role user with no linked company', async () => {
    await expect(
      contractorService.list({ id: 'u', role: UserRole.COMPANY, companyId: null }, undefined, 1, 20),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('scopes the query to the requester company, active-only', async () => {
    mockedRepo.findMany.mockResolvedValue({
      items: [
        { id: 'c1', companyId: 'company-1', name: 'مقاولات الشرق', phone: '05', email: 'a@a.com', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ],
      total: 1,
    });

    const result = await contractorService.list(companyRequester, 'شرق', 1, 20);

    expect(mockedRepo.findMany).toHaveBeenCalledWith('company-1', 'شرق', 1, 20);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns an honest empty list when no contractors exist - never a mock fallback', async () => {
    mockedRepo.findMany.mockResolvedValue({ items: [], total: 0 });

    const result = await contractorService.list(companyRequester, undefined, 1, 20);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
