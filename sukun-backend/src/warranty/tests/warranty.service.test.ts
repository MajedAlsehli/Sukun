import { warrantyService } from '../warranty.service';
import { warrantyRepository } from '../warranty.repository';
import { homeownerRepository } from '../../homeowners/homeowner.repository';
import { fileRepository } from '../../files/file.repository';
import { aiGatewayPort } from '../../ai/ai-gateway.port';
import { WarrantyReportStatus } from '../warranty.types';

jest.mock('../warranty.repository');
jest.mock('../../homeowners/homeowner.repository');
jest.mock('../../files/file.repository');
jest.mock('../../ai/ai-gateway.port');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedWarranty = warrantyRepository as jest.Mocked<typeof warrantyRepository>;
const mockedHomeowners = homeownerRepository as jest.Mocked<typeof homeownerRepository>;
const mockedFiles = fileRepository as jest.Mocked<typeof fileRepository>;
const mockedAiGateway = aiGatewayPort as jest.Mocked<typeof aiGatewayPort>;

const activeOwnership = { id: 'ownership-1', unitId: 'unit-1', userId: 'homeowner-1', startDate: new Date(), endDate: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };

const activeWarranty = {
  id: 'warranty-1',
  unitId: 'unit-1',
  startDate: new Date(Date.now() - 86_400_000),
  endDate: new Date(Date.now() + 365 * 86_400_000),
  coverage: 'Standard',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const dto = { unitId: 'unit-1', category: 'Plumbing', location: 'Bathroom', images: ['file-1'] };

describe('warrantyService.getByUnit', () => {
  it('hides warranty details from a non-owner', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue({
      ...activeOwnership,
      userId: 'someone-else',
    } as never);

    await expect(warrantyService.getByUnit('unit-1', 'homeowner-1')).rejects.toMatchObject({
      errorCode: 'WARRANTY_NOT_FOUND',
    });
  });

  it('returns the server-computed overall status and structured per-category breakdown (H10)', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(activeOwnership as never);
    mockedWarranty.findByUnitId.mockResolvedValue(activeWarranty);

    const result = await warrantyService.getByUnit('unit-1', 'homeowner-1');

    expect(result.isActive).toBe(true);
    expect(result.daysRemaining).toBeGreaterThan(0);
    expect(result.rulesVersion).toBeTruthy();
    expect(result.categories).toHaveLength(6);
    expect(result.categories.map((c) => c.key)).toEqual(
      expect.arrayContaining(['STRUCTURE', 'PLUMBING', 'ELECTRICAL', 'DOORS_WINDOWS', 'PAINT_FINISHING', 'MISUSE_EXCLUSION']),
    );
    const misuse = result.categories.find((c) => c.key === 'MISUSE_EXCLUSION')!;
    expect(misuse).toMatchObject({ covered: false, reasonCode: 'EXCLUDED' });
  });

  it('reports the overall warranty as expired with no per-category dates hidden or overridden by any client input', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(activeOwnership as never);
    mockedWarranty.findByUnitId.mockResolvedValue({
      ...activeWarranty,
      startDate: new Date(Date.now() - 20 * 365 * 86_400_000),
      endDate: new Date(Date.now() - 86_400_000),
    });

    const result = await warrantyService.getByUnit('unit-1', 'homeowner-1');

    expect(result.isActive).toBe(false);
    expect(result.daysRemaining).toBeNull();
    // A 20-year-old start date means every timed category has also lapsed -
    // computed purely from server-held dates, nothing here is client-suppliable.
    const structure = result.categories.find((c) => c.key === 'STRUCTURE')!;
    expect(structure.reasonCode).toBe('EXPIRED');
  });
});

describe('warrantyService.createReport', () => {
  it('rejects a claim on an expired warranty (WAR-003/015)', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(activeOwnership as never);
    mockedWarranty.findByUnitId.mockResolvedValue({
      ...activeWarranty,
      endDate: new Date(Date.now() - 1000),
    });

    await expect(
      warrantyService.createReport(dto, 'homeowner-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'WARRANTY_EXPIRED' });
  });

  it('rejects an overlapping active claim (WAR-016)', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(activeOwnership as never);
    mockedWarranty.findByUnitId.mockResolvedValue(activeWarranty);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([
      {
        id: 'existing-report',
        warrantyId: 'warranty-1',
        unitId: 'unit-1',
        homeownerId: 'homeowner-1',
        referenceNumber: 'WR-AAAA0000',
        status: WarrantyReportStatus.ASSIGNED,
        priority: null,
        category: 'Plumbing',
        location: 'Kitchen',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        images: [],
        aiResults: [],
      },
    ] as never);

    await expect(
      warrantyService.createReport(dto, 'homeowner-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'OVERLAPPING_WARRANTY_CLAIM' });
  });

  it('creates the report and routes it through the AI Gateway', async () => {
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(activeOwnership as never);
    mockedWarranty.findByUnitId.mockResolvedValue(activeWarranty);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);
    mockedFiles.findManyByIds.mockResolvedValue([
      { id: 'file-1', storageKey: 'x', url: '/files/x', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockedWarranty.createReport.mockResolvedValue({
      id: 'report-1',
      warrantyId: 'warranty-1',
      unitId: 'unit-1',
      homeownerId: 'homeowner-1',
      referenceNumber: 'WR-DEADBEEF',
      status: WarrantyReportStatus.AI_ANALYSIS,
      priority: null,
      category: 'Plumbing',
      location: 'Bathroom',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [],
      aiResults: [],
    });

    const result = await warrantyService.createReport(dto, 'homeowner-1', { ipAddress: null });

    expect(result.status).toBe('AI_ANALYSIS');
    expect(result.referenceNumber).toMatch(/^WR-/);
    expect(mockedAiGateway.enqueueWarrantyAnalysis).toHaveBeenCalledWith('report-1');
  });
});
