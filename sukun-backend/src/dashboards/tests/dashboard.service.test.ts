import { dashboardService } from '../dashboard.service';
import { dashboardRepository } from '../dashboard.repository';
import { technicianRepository } from '../../technicians/technician.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { notificationRepository } from '../../notifications/notification.repository';

jest.mock('../dashboard.repository');
jest.mock('../../technicians/technician.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../notifications/notification.repository');

const mockedDashboards = dashboardRepository as jest.Mocked<typeof dashboardRepository>;
const mockedTechnicians = technicianRepository as jest.Mocked<typeof technicianRepository>;
const mockedPMs = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const mockedNotifications = notificationRepository as jest.Mocked<typeof notificationRepository>;

describe('dashboardService.companyDashboard', () => {
  it('rejects an account with no linked company', async () => {
    await expect(dashboardService.companyDashboard(null)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('returns KPIs, projects, and technicians', async () => {
    mockedDashboards.companyPortfolio.mockResolvedValue({
      projectsCount: 2,
      buildingsCount: 3,
      unitsCount: 10,
      techniciansCount: 4,
      homeownersCount: 5,
      openInspectionReports: 1,
      openWarrantyReports: 1,
      projects: [{ id: 'p1', name: 'Sedra', code: 'SED-1', status: 'ACTIVE' } as never],
    });
    mockedDashboards.technicians.mockResolvedValue([
      { id: 't1', status: 'AVAILABLE', user: { name: 'Ahmed' } } as never,
    ]);

    const result = await dashboardService.companyDashboard('company-1');

    expect(result.kpis.projectsCount).toBe(2);
    expect(result.projects).toHaveLength(1);
    expect(result.technicians[0].name).toBe('Ahmed');
  });
});

describe('dashboardService.pmDashboard', () => {
  it('rejects a user with no PM record', async () => {
    mockedPMs.findByUserId.mockResolvedValue(null);

    await expect(dashboardService.pmDashboard('user-1')).rejects.toMatchObject({
      httpStatus: 403,
    });
  });
});

describe('dashboardService.technicianDashboard', () => {
  it('rejects a user with no technician record', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue(null);

    await expect(dashboardService.technicianDashboard('user-1')).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('splits repairs into assigned vs history', async () => {
    mockedTechnicians.findByUserId.mockResolvedValue({ id: 'tech-1' } as never);
    mockedDashboards.technicianAssignedRepairs.mockResolvedValue([
      { id: 'r1', reportId: 'rep1', status: 'IN_PROGRESS', completedAt: null } as never,
      { id: 'r2', reportId: 'rep2', status: 'COMPLETED', completedAt: new Date() } as never,
    ]);

    const result = await dashboardService.technicianDashboard('user-1');

    expect(result.assignedRepairs).toHaveLength(1);
    expect(result.repairHistory).toHaveLength(1);
  });
});

describe('dashboardService.homeownerDashboard', () => {
  it('returns ownerships and recent notifications', async () => {
    mockedDashboards.homeownerOwnerships.mockResolvedValue([
      { id: 'o1', unitId: 'unit-1', startDate: new Date(), unit: { number: '101' } } as never,
    ]);
    mockedNotifications.findAllByUser.mockResolvedValue([]);

    const result = await dashboardService.homeownerDashboard('user-1');

    expect(result.ownerships).toHaveLength(1);
    expect(result.ownerships[0].unitNumber).toBe('101');
  });
});
