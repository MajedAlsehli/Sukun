import { repairService } from '../repair.service';
import { repairRepository } from '../repair.repository';
import { inspectionReportRepository } from '../../inspection-reports/inspection-report.repository';
import { visitRepository } from '../../visits/visit.repository';
import { unitRepository } from '../../units/unit.repository';
import { buildingRepository } from '../../buildings/building.repository';
import { technicianRepository } from '../../technicians/technician.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { fileRepository } from '../../files/file.repository';
import { aiGatewayPort } from '../../ai/ai-gateway.port';
import { RepairStatus } from '../repair.types';
import { InspectionReportStatus } from '../../inspection-reports/inspection-report.types';
import { VisitStatus } from '../../visits/visit.types';
import { BuildingStatus } from '../../buildings/building.types';
import { UnitStatus } from '../../units/unit.types';

jest.mock('../repair.repository');
jest.mock('../../inspection-reports/inspection-report.repository');
jest.mock('../../visits/visit.repository');
jest.mock('../../units/unit.repository');
jest.mock('../../buildings/building.repository');
jest.mock('../../technicians/technician.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../files/file.repository');
jest.mock('../../ai/ai-gateway.port');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

const mockedRepairs = repairRepository as jest.Mocked<typeof repairRepository>;
const mockedReports = inspectionReportRepository as jest.Mocked<typeof inspectionReportRepository>;
const mockedVisits = visitRepository as jest.Mocked<typeof visitRepository>;
const mockedUnits = unitRepository as jest.Mocked<typeof unitRepository>;
const mockedBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockedTechnicians = technicianRepository as jest.Mocked<typeof technicianRepository>;
const mockedPMs = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const mockedFiles = fileRepository as jest.Mocked<typeof fileRepository>;
const mockedAiGateway = aiGatewayPort as jest.Mocked<typeof aiGatewayPort>;

const pm = { id: 'pm-1', projectId: 'project-1', userId: 'pm-user', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
const technician = { id: 'tech-1', projectId: 'project-1', userId: 'tech-user', status: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() };

const assignedReport = {
  id: 'report-1',
  visitId: 'visit-1',
  unitId: 'unit-1',
  searchJourneyId: 'journey-1',
  status: InspectionReportStatus.ASSIGNED,
  priority: 'HIGH',
  location: 'Kitchen',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [],
  aiResults: [],
};

const unit = { id: 'unit-1', buildingId: 'building-1', number: '101', floor: 1, type: 'Apartment', status: UnitStatus.AVAILABLE, createdAt: new Date(), updatedAt: new Date() };
const building = { id: 'building-1', projectId: 'project-1', name: 'Tower A', number: '1', status: BuildingStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date(), _count: { units: 1 } };

function repairFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'repair-1',
    reportId: 'report-1',
    technicianId: 'tech-1',
    status: RepairStatus.ASSIGNED,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
    ...overrides,
  } as never;
}

describe('repairService.assign', () => {
  it('rejects a non-PM account', async () => {
    mockedPMs.findByUserId.mockResolvedValue(null);

    await expect(
      repairService.assign({ reportId: 'report-1', technicianId: 'tech-1' }, 'not-a-pm', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a report outside the PM\'s project', async () => {
    mockedPMs.findByUserId.mockResolvedValue(pm as never);
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedUnits.findById.mockResolvedValue(unit as never);
    mockedBuildings.findById.mockResolvedValue({ ...building, projectId: 'other-project' } as never);

    await expect(
      repairService.assign({ reportId: 'report-1', technicianId: 'tech-1' }, 'pm-user', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a technician from a different project (TEC-001)', async () => {
    mockedPMs.findByUserId.mockResolvedValue(pm as never);
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedUnits.findById.mockResolvedValue(unit as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedTechnicians.findById.mockResolvedValue({ ...technician, projectId: 'other-project' } as never);

    await expect(
      repairService.assign({ reportId: 'report-1', technicianId: 'tech-1' }, 'pm-user', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'TECHNICIAN_PROJECT_MISMATCH' });
  });

  it('rejects an inactive technician', async () => {
    // Previously unchecked: only project match was verified, so a
    // deactivated technician could still receive new repair assignments.
    mockedPMs.findByUserId.mockResolvedValue(pm as never);
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedUnits.findById.mockResolvedValue(unit as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedTechnicians.findById.mockResolvedValue({ ...technician, status: 'INACTIVE' } as never);

    await expect(
      repairService.assign({ reportId: 'report-1', technicianId: 'tech-1' }, 'pm-user', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'TECHNICIAN_INACTIVE' });
  });

  it('assigns the repair', async () => {
    mockedPMs.findByUserId.mockResolvedValue(pm as never);
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedUnits.findById.mockResolvedValue(unit as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedTechnicians.findById.mockResolvedValue(technician as never);
    mockedRepairs.findByReportId.mockResolvedValue(null);
    mockedRepairs.create.mockResolvedValue(repairFixture());

    const result = await repairService.assign(
      { reportId: 'report-1', technicianId: 'tech-1' },
      'pm-user',
      { ipAddress: null },
    );

    expect(result.status).toBe('ASSIGNED');
  });
});

describe('repairService.start', () => {
  it('rejects a technician who does not own the repair', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(technician as never);
    mockedRepairs.findById.mockResolvedValue(repairFixture({ technicianId: 'other-tech' }));

    await expect(
      repairService.start('repair-1', 'tech-user', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'REPAIR_NOT_FOUND' });
  });

  it('starts the repair and moves the report to REPAIR_IN_PROGRESS', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(technician as never);
    mockedRepairs.findById.mockResolvedValue(repairFixture());
    mockedRepairs.updateStatus.mockResolvedValue(
      repairFixture({ status: RepairStatus.IN_PROGRESS, startedAt: new Date() }),
    );

    const result = await repairService.start('repair-1', 'tech-user', { ipAddress: null });

    expect(result.status).toBe('IN_PROGRESS');
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.REPAIR_IN_PROGRESS,
    });
  });
});

describe('repairService.complete', () => {
  it('rejects completion without before images (REP-003)', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(technician as never);
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({
        status: RepairStatus.IN_PROGRESS,
        images: [{ id: 'img-1', type: 'AFTER', fileId: 'f1' }],
      }),
    );

    await expect(
      repairService.complete('repair-1', 'tech-user', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'MISSING_BEFORE_IMAGES' });
  });

  it('rejects completion without after images (REP-004)', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(technician as never);
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({
        status: RepairStatus.IN_PROGRESS,
        images: [{ id: 'img-1', type: 'BEFORE', fileId: 'f1' }],
      }),
    );

    await expect(
      repairService.complete('repair-1', 'tech-user', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'MISSING_AFTER_IMAGES' });
  });

  it('completes and routes through the AI Gateway for validation', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(technician as never);
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({
        status: RepairStatus.IN_PROGRESS,
        images: [
          { id: 'img-1', type: 'BEFORE', fileId: 'f1' },
          { id: 'img-2', type: 'AFTER', fileId: 'f2' },
        ],
      }),
    );
    mockedRepairs.updateStatus.mockResolvedValue(
      repairFixture({ status: RepairStatus.WAITING_VALIDATION }),
    );

    const result = await repairService.complete('repair-1', 'tech-user', { ipAddress: null });

    expect(result.status).toBe('WAITING_VALIDATION');
    expect(mockedAiGateway.enqueueRepairValidation).toHaveBeenCalledWith('repair-1');
  });
});

describe('repairService.approve', () => {
  it('rejects approval from someone other than the report creator (Flow 7)', async () => {
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({ status: RepairStatus.WAITING_CUSTOMER_APPROVAL }),
    );
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'other-user',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CHECKED_OUT,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(
      repairService.approve('repair-1', true, undefined, 'requesting-user', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'REPAIR_NOT_FOUND' });
  });

  it('approves and closes the inspection report', async () => {
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({ status: RepairStatus.WAITING_CUSTOMER_APPROVAL }),
    );
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'creator-user',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CHECKED_OUT,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    mockedRepairs.updateStatus.mockResolvedValue(
      repairFixture({ status: RepairStatus.COMPLETED, completedAt: new Date() }),
    );

    const result = await repairService.approve('repair-1', true, undefined, 'creator-user', {
      ipAddress: null,
    });

    expect(result.status).toBe('COMPLETED');
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.CLOSED,
    });
  });

  it('sends a rejected repair back to the technician (REP-009)', async () => {
    mockedRepairs.findById.mockResolvedValue(
      repairFixture({ status: RepairStatus.WAITING_CUSTOMER_APPROVAL }),
    );
    mockedReports.findById.mockResolvedValue(assignedReport as never);
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'creator-user',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CHECKED_OUT,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    mockedRepairs.updateStatus.mockResolvedValue(repairFixture({ status: RepairStatus.IN_PROGRESS }));

    const result = await repairService.approve(
      'repair-1',
      false,
      'not fixed properly',
      'creator-user',
      { ipAddress: null },
    );

    expect(result.status).toBe('IN_PROGRESS');
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.REPAIR_IN_PROGRESS,
    });
  });
});
