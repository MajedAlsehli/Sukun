import { managerService } from '../project-manager.service';
import { projectManagerRepository } from '../project-manager.repository';
import { UserRole } from '../../shared/roles';

jest.mock('../project-manager.repository');

const mockedRepo = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };
const homeSeekerRequester = { id: 'user-2', role: UserRole.HOME_SEEKER, companyId: null };

describe('managerService.list', () => {
  it('rejects a non-Company role', async () => {
    await expect(managerService.list(homeSeekerRequester, undefined, 1, 20)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('queries only the unassigned, activated pool scoped to the requester company', async () => {
    mockedRepo.findUnassigned.mockResolvedValue({
      items: [
        {
          id: 'pm-1',
          projectId: null,
          userId: 'u1',
          status: 'ACTIVATED',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 'u1', name: 'مدير أحمد', email: 'ahmed@example.com' } as never,
        } as never,
      ],
      total: 1,
    });

    const result = await managerService.list(companyRequester, 'أحمد', 1, 20);

    expect(mockedRepo.findUnassigned).toHaveBeenCalledWith('company-1', 'أحمد', 1, 20);
    expect(result.items).toEqual([{ id: 'pm-1', name: 'مدير أحمد', email: 'ahmed@example.com' }]);
  });

  it('returns an honest empty list when no managers exist', async () => {
    mockedRepo.findUnassigned.mockResolvedValue({ items: [], total: 0 });

    const result = await managerService.list(companyRequester, undefined, 1, 20);
    expect(result.items).toEqual([]);
  });
});
