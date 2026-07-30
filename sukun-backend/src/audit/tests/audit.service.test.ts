import { auditService } from '../audit.service';
import { auditRepository } from '../audit.repository';

jest.mock('../audit.repository');

const mockedRepo = auditRepository as jest.Mocked<typeof auditRepository>;

describe('auditService.list', () => {
  it('applies entity/action/userId filters when provided', async () => {
    mockedRepo.findMany.mockResolvedValue({ items: [], total: 0 });

    await auditService.list({ page: 1, pageSize: 20, entity: 'Repair', action: 'REPAIR_APPROVED', userId: 'user-1' });

    expect(mockedRepo.findMany).toHaveBeenCalledWith(
      { entity: 'Repair', action: 'REPAIR_APPROVED', userId: 'user-1' },
      1,
      20,
    );
  });

  it('omits filters that were not provided', async () => {
    mockedRepo.findMany.mockResolvedValue({ items: [], total: 0 });

    await auditService.list({ page: 1, pageSize: 20 });

    expect(mockedRepo.findMany).toHaveBeenCalledWith({}, 1, 20);
  });
});
