import { inspectionReportService } from '../inspection-report.service';
import { inspectionReportRepository } from '../inspection-report.repository';
import { visitRepository } from '../../visits/visit.repository';
import { fileRepository } from '../../files/file.repository';
import { aiGatewayPort } from '../../ai/ai-gateway.port';
import { VisitStatus } from '../../visits/visit.types';
import { InspectionReportStatus } from '../inspection-report.types';

jest.mock('../inspection-report.repository');
jest.mock('../../visits/visit.repository');
jest.mock('../../files/file.repository');
jest.mock('../../ai/ai-gateway.port');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

const mockedReports = inspectionReportRepository as jest.Mocked<typeof inspectionReportRepository>;
const mockedVisits = visitRepository as jest.Mocked<typeof visitRepository>;
const mockedFiles = fileRepository as jest.Mocked<typeof fileRepository>;
const mockedAiGateway = aiGatewayPort as jest.Mocked<typeof aiGatewayPort>;

const checkedInVisit = {
  id: 'visit-1',
  userId: 'user-1',
  projectId: 'project-1',
  unitId: 'unit-1',
  searchJourneyId: 'journey-1',
  date: new Date(),
  time: '14:00',
  status: VisitStatus.CHECKED_IN,
  checkedInAt: new Date(),
  checkedOutAt: null,
  rescheduleCount: 0,
  lastRescheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validDto = {
  visitId: 'visit-1',
  unitId: 'unit-1',
  images: ['file-1'],
  location: 'Kitchen wall',
};

describe('inspectionReportService.create', () => {
  it('rejects a visit owned by someone else (INS-023)', async () => {
    mockedVisits.findById.mockResolvedValue({ ...checkedInVisit, userId: 'other-user' });

    await expect(
      inspectionReportService.create(validDto, 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_FOUND' });
  });

  it('rejects when the visit is not Checked-In (VIS-004)', async () => {
    mockedVisits.findById.mockResolvedValue({ ...checkedInVisit, status: VisitStatus.CONFIRMED });

    await expect(
      inspectionReportService.create(validDto, 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_CHECKED_IN' });
  });

  it('rejects a unit mismatch with the visit', async () => {
    mockedVisits.findById.mockResolvedValue(checkedInVisit);

    await expect(
      inspectionReportService.create({ ...validDto, unitId: 'other-unit' }, 'user-1', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'UNIT_VISIT_MISMATCH' });
  });

  it('rejects when an image file does not exist', async () => {
    mockedVisits.findById.mockResolvedValue(checkedInVisit);
    mockedFiles.findManyByIds.mockResolvedValue([]);

    await expect(
      inspectionReportService.create(validDto, 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'FILE_NOT_FOUND' });
  });

  it('creates the report at AI_PROCESSING and routes it through the AI Gateway port', async () => {
    mockedVisits.findById.mockResolvedValue(checkedInVisit);
    mockedFiles.findManyByIds.mockResolvedValue([
      { id: 'file-1', storageKey: 'x', url: '/files/x', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockedReports.create.mockResolvedValue({
      id: 'report-1',
      visitId: 'visit-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      status: InspectionReportStatus.AI_PROCESSING,
      priority: null,
      location: 'Kitchen wall',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        {
          id: 'img-1',
          reportId: 'report-1',
          fileId: 'file-1',
          order: 0,
          createdAt: new Date(),
          file: { id: 'file-1', storageKey: 'x', url: '/files/x', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() },
        },
      ],
      aiResults: [],
    });

    const result = await inspectionReportService.create(validDto, 'user-1', { ipAddress: null });

    expect(result.status).toBe('AI_PROCESSING');
    expect(result.images).toHaveLength(1);
    expect(mockedAiGateway.enqueueInspectionAnalysis).toHaveBeenCalledWith('report-1');
  });
});

describe('inspectionReportService.getById', () => {
  it('hides a report from a non-owner', async () => {
    mockedReports.findById.mockResolvedValue({
      id: 'report-1',
      visitId: 'visit-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      status: InspectionReportStatus.AI_PROCESSING,
      priority: null,
      location: 'Kitchen wall',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [],
      aiResults: [],
    });
    mockedVisits.findById.mockResolvedValue({ ...checkedInVisit, userId: 'other-user' });

    await expect(inspectionReportService.getById('report-1', 'user-1')).rejects.toMatchObject({
      errorCode: 'REPORT_NOT_FOUND',
    });
  });
});
