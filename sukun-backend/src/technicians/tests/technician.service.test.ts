import { technicianService } from '../technician.service';
import { technicianRepository } from '../technician.repository';
import { authRepository } from '../../auth/auth.repository';
import { projectRepository } from '../../projects/project.repository';
import { projectManagerRepository } from '../../project-managers/project-manager.repository';
import { invitationRepository } from '../../auth/invitation.repository';
import { reportRepository } from '../../reports/report.repository';
import { ProjectStatus } from '../../projects/project.types';
import { UserRole } from '../../shared/roles';
import { env } from '../../config/env';

jest.mock('../technician.repository');
jest.mock('../../auth/auth.repository');
jest.mock('../../projects/project.repository');
jest.mock('../../project-managers/project-manager.repository');
jest.mock('../../auth/invitation.repository');
// Task 8 (decisions.md I14/I15): RE5's statistics and reviews now come from the
// canonical report repository; routing retry is a fire-and-forget side effect.
jest.mock('../../reports/report.repository');
jest.mock('../../reports/report.routing', () => ({
  reportRoutingService: { scheduleRetry: jest.fn() },
}));
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

// jest.mock factories are hoisted above local const declarations, so the
// expiry is a fixed literal here (not a shared variable) - re-declared
// identically below for assertions.
const INVITATION_EXPIRES_AT_ISO = '2030-01-08T00:00:00.000Z';
jest.mock('../../auth/invitation.service', () => ({
  invitationService: {
    issue: jest.fn().mockResolvedValue({
      raw: 'raw-invitation-token',
      expiresAt: new Date('2030-01-08T00:00:00.000Z'),
    }),
  },
}));

const mockedTechnicians = technicianRepository as jest.Mocked<typeof technicianRepository>;
const mockedAuth = authRepository as jest.Mocked<typeof authRepository>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedPMs = projectManagerRepository as jest.Mocked<typeof projectManagerRepository>;
const mockedInvitations = invitationRepository as jest.Mocked<typeof invitationRepository>;
const mockedReports = reportRepository as jest.Mocked<typeof reportRepository>;

/** Canonical post-ownership stats, kept strictly separate from the legacy ones (I14). */
function canonicalStats(overrides: Partial<{
  openReportsCount: number;
  completedRepairsCount: number;
  averageRepairDurationMinutes: number | null;
  averageRating: number | null;
  reviewsCount: number;
}> = {}) {
  return {
    openReportsCount: 0,
    completedRepairsCount: 0,
    averageRepairDurationMinutes: null,
    averageRating: null,
    reviewsCount: 0,
    ...overrides,
  };
}

const companyRequester = { id: 'user-1', role: UserRole.COMPANY, companyId: 'company-1' };

const ownedProject = {
  id: 'project-1',
  companyId: 'company-1',
  name: 'Sedra',
  code: 'SED-1',
  city: 'Riyadh',
  district: null,
  description: null,
  status: ProjectStatus.ACTIVE,
  isActive: true,
  coverImageKey: null,
  coverImageUrl: null,
  primaryContractorId: null,
  readiness: null,
  amenities: [],
  source: 'MANUAL',
  externalId: null,
  sourceUpdatedAt: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { buildings: 0 },
  projectManager: null,
};

const dto = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  phone: '0500000000',
  projectId: 'project-1',
  specialty: 'كهرباء' as const,
};

function mockSuccessfulCreate() {
  mockedProjects.findById.mockResolvedValue(ownedProject);
  mockedAuth.findUserByEmail.mockResolvedValue(null);
  mockedAuth.findUserByPhone.mockResolvedValue(null);
  mockedTechnicians.createWithUser.mockResolvedValue({
    id: 'tech-1',
    projectId: 'project-1',
    userId: 'user-2',
    specialty: 'كهرباء',
    status: 'INVITED',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-2',
      name: 'Ahmed',
      email: 'ahmed@example.com',
      phone: '0500000000',
      passwordHash: 'x',
      role: UserRole.TECHNICIAN,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      companyId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as never);
}

describe('technicianService.register', () => {
  it('rejects a non-company role', async () => {
    await expect(
      technicianService.register(dto, { id: 'u', role: UserRole.HOME_SEEKER, companyId: null }, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects assigning to a project the company does not own', async () => {
    mockedProjects.findById.mockResolvedValue({ ...ownedProject, companyId: 'other-company' });

    await expect(
      technicianService.register(dto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a duplicate email (USR-001 applied to technician accounts)', async () => {
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedAuth.findUserByEmail.mockResolvedValue({ id: 'existing' } as never);
    mockedAuth.findUserByPhone.mockResolvedValue(null);

    await expect(
      technicianService.register(dto, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
  });

  it('registers a technician scoped to the project', async () => {
    mockSuccessfulCreate();

    const result = await technicianService.register(dto, companyRequester, { ipAddress: null });

    expect(result.status).toBe('INVITED');
    expect(result.email).toBe('ahmed@example.com');
  });

  describe('invitation exposure (security correction)', () => {
    const originalNodeEnv = env.nodeEnv;

    afterEach(() => {
      env.nodeEnv = originalNodeEnv;
    });

    it('includes an invitationPreview + honest non-secret metadata outside production', async () => {
      env.nodeEnv = 'development';
      mockSuccessfulCreate();

      const result = await technicianService.register(dto, companyRequester, { ipAddress: null });

      expect(result.invitation?.invitationPreview).toBe('raw-invitation-token');
      expect(result.invitation?.deliveryStatus).toBe('not_configured');
      expect(result.invitation?.recipientEmail).toBe('ahmed@example.com');
      expect(result.invitation?.expiresAt).toEqual(new Date(INVITATION_EXPIRES_AT_ISO));
    });

    it('includes an invitationPreview when NODE_ENV=test (the default test runtime)', async () => {
      env.nodeEnv = 'test';
      mockSuccessfulCreate();

      const result = await technicianService.register(dto, companyRequester, { ipAddress: null });

      expect(result.invitation?.invitationPreview).toBe('raw-invitation-token');
    });

    it('never includes the raw invitation token or invitationPreview key at all in production', async () => {
      env.nodeEnv = 'production';
      mockSuccessfulCreate();

      const result = await technicianService.register(dto, companyRequester, { ipAddress: null });

      // Key must be entirely absent, not merely undefined - guards against a
      // future refactor that sets `invitationPreview: undefined` explicitly,
      // which would still leak the key's presence/shape.
      expect(result.invitation).not.toHaveProperty('invitationPreview');
      expect(JSON.stringify(result)).not.toContain('raw-invitation-token');
    });

    it('still returns honest non-secret metadata in production (expiry, recipient, delivery status)', async () => {
      env.nodeEnv = 'production';
      mockSuccessfulCreate();

      const result = await technicianService.register(dto, companyRequester, { ipAddress: null });

      expect(result.invitation?.deliveryStatus).toBe('not_configured');
      expect(result.invitation?.recipientEmail).toBe('ahmed@example.com');
      expect(result.invitation?.expiresAt).toEqual(new Date(INVITATION_EXPIRES_AT_ISO));
    });
  });
});

// ---------------------------------------------------------------------
// Task 5 (RE5): company-wide technician management.
// ---------------------------------------------------------------------

const technicianUserFixture = {
  id: 'user-2',
  name: 'Ahmed',
  email: 'ahmed@example.com',
  phone: '0500000000',
  passwordHash: 'x',
  role: UserRole.TECHNICIAN,
  status: 'ACTIVE',
  failedLoginAttempts: 0,
  lockedUntil: null,
  companyId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function technicianEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tech-1',
    projectId: 'project-1',
    userId: 'user-2',
    specialty: 'كهرباء',
    status: 'AVAILABLE',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: technicianUserFixture,
    _count: { repairs: 0 },
    ...overrides,
  };
}

describe('technicianService object-level scoping (mirrors homeowner F5/F14)', () => {
  it('404s (not 403) every id-keyed method for a technician outside the requester company', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue({ ...ownedProject, companyId: 'other-company' });

    await expect(technicianService.getById('tech-1', companyRequester)).rejects.toMatchObject({
      httpStatus: 404,
      errorCode: 'TECHNICIAN_NOT_FOUND',
    });
    await expect(
      technicianService.update('tech-1', { phone: '0599999999' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      technicianService.setStatus('tech-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the technician id does not exist at all', async () => {
    mockedTechnicians.findById.mockResolvedValue(null);

    await expect(technicianService.getById('missing', companyRequester)).rejects.toMatchObject({
      httpStatus: 404,
      errorCode: 'TECHNICIAN_NOT_FOUND',
    });
  });
});

describe('technicianService.getById (RE5 profile)', () => {
  it('assembles manager name, real stats, and an honest null rating (decisions.md F12)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue({
      id: 'pm-1',
      projectId: 'project-1',
      userId: 'pm-user-1',
      status: 'ACTIVATED',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { ...technicianUserFixture, id: 'pm-user-1', name: 'Manager Fahad' },
    } as never);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 2,
      completedRepairsCount: 5,
      averageRepairDurationDays: 3.5,
    });
    mockedReports.technicianStats.mockResolvedValue(canonicalStats());

    const result = await technicianService.getById('tech-1', companyRequester);

    expect(result.projectName).toBe('Sedra');
    expect(result.managerName).toBe('Manager Fahad');
    // Task 8 (decisions.md I14): the headline numbers are CANONICAL. The legacy
    // pre-ownership numbers are still reported, but under their own key and
    // never summed into the ones above.
    expect(result.openRepairsCount).toBe(0);
    expect(result.completedRepairsCount).toBe(0);
    expect(result.legacy).toEqual({
      openRepairsCount: 2,
      completedRepairsCount: 5,
      averageRepairDurationDays: 3.5,
    });
    // Still honestly null (never 0) when this technician has no reviews - F12's
    // discipline, now backed by a real ReportReview model (I13).
    expect(result.averageRating).toBeNull();
    expect(result.reviewsCount).toBe(0);
  });

  it('reports real canonical statistics once repairs and reviews exist (I13/I14)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });
    mockedReports.technicianStats.mockResolvedValue(
      canonicalStats({
        openReportsCount: 3,
        completedRepairsCount: 7,
        averageRepairDurationMinutes: 210,
        averageRating: 4.57,
        reviewsCount: 7,
      }),
    );

    const result = await technicianService.getById('tech-1', companyRequester);

    expect(result.openRepairsCount).toBe(3);
    expect(result.completedRepairsCount).toBe(7);
    expect(result.averageRepairDurationMinutes).toBe(210);
    expect(result.averageRating).toBe(4.57);
    expect(result.reviewsCount).toBe(7);
  });

  it('returns a null manager name when the project has no assigned manager', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });
    mockedReports.technicianStats.mockResolvedValue(canonicalStats());

    const result = await technicianService.getById('tech-1', companyRequester);

    expect(result.managerName).toBeNull();
  });
});

describe('technicianService.list', () => {
  it('rejects a non-company role', async () => {
    await expect(
      technicianService.list({ id: 'u', role: UserRole.HOME_SEEKER, companyId: null }, {
        sort: 'newest',
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('is company-wide when projectId is omitted (decisions.md F11)', async () => {
    mockedTechnicians.findAllByCompany.mockResolvedValue({ items: [technicianEntity()], total: 1 } as never);

    const result = await technicianService.list(companyRequester, { sort: 'newest', page: 1, pageSize: 20 });

    expect(mockedProjects.findById).not.toHaveBeenCalled();
    expect(mockedTechnicians.findAllByCompany).toHaveBeenCalledWith(
      'company-1',
      { projectId: undefined, q: undefined, status: undefined },
      'newest',
      1,
      20,
    );
    expect(result.total).toBe(1);
  });

  it('rejects a projectId the company does not own', async () => {
    mockedProjects.findById.mockResolvedValue({ ...ownedProject, companyId: 'other-company' });

    await expect(
      technicianService.list(companyRequester, { projectId: 'project-1', sort: 'newest', page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('technicianService.summary', () => {
  it('returns real KPI counts with an honest null averageRating (decisions.md F12)', async () => {
    mockedTechnicians.companySummary.mockResolvedValue({
      totalTechnicians: 4,
      availableCount: 2,
      busyCount: 2,
      openRepairsCount: 3,
      completedRepairsCount: 10,
      averageRepairDurationMinutes: null,
      averageRating: null,
      reviewsCount: 0,
      legacy: { openRepairsCount: 5, completedRepairsCount: 12, averageRepairDurationDays: 2.1 },
      averageRepairDurationDays: 2.1,
    });

    const result = await technicianService.summary(companyRequester);

    expect(result.totalTechnicians).toBe(4);
    expect(result.averageRating).toBeNull();
    // Legacy numbers survive, separately (decisions.md I14).
    expect(result.legacy.openRepairsCount).toBe(5);
  });

  it('surfaces a real canonical average rating once reviews exist (I13)', async () => {
    mockedTechnicians.companySummary.mockResolvedValue({
      totalTechnicians: 4,
      availableCount: 2,
      busyCount: 2,
      openRepairsCount: 1,
      completedRepairsCount: 9,
      averageRepairDurationMinutes: 180,
      averageRating: 4.75,
      reviewsCount: 8,
      legacy: { openRepairsCount: 0, completedRepairsCount: 0, averageRepairDurationDays: null },
      averageRepairDurationDays: null,
    });

    const result = await technicianService.summary(companyRequester);

    expect(result.averageRating).toBe(4.75);
    expect(result.reviewsCount).toBe(8);
    expect(result.averageRepairDurationMinutes).toBe(180);
  });
});

describe('technicianService.update', () => {
  it('rejects an email already used by a different account', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedAuth.findUserByEmail.mockResolvedValue({ id: 'someone-else' } as never);

    await expect(
      technicianService.update('tech-1', { email: 'taken@example.com' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
  });

  it('updates mobile/email/specialty and returns the refreshed profile', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedTechnicians.updateContact.mockResolvedValue(technicianEntity() as never);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    await technicianService.update('tech-1', { specialty: 'سباكة' }, companyRequester, { ipAddress: null });

    expect(mockedTechnicians.updateContact).toHaveBeenCalledWith('tech-1', {
      email: undefined,
      phone: undefined,
      specialty: 'سباكة',
    });
  });
});

describe('technicianService.resendInvitation', () => {
  it('rejects resending once the technician has already been activated', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'ACTIVATED' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);

    await expect(
      technicianService.resendInvitation('tech-1', companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_ACTIVATED' });
  });

  it('reissues a fresh invitation while still INVITED', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'INVITED' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    const result = await technicianService.resendInvitation('tech-1', companyRequester, { ipAddress: null });

    expect(result.invitation?.invitationPreview).toBe('raw-invitation-token');
  });
});

describe('technicianService.transfer', () => {
  it('rejects transferring a deactivated technician', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'INACTIVE' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);

    await expect(
      technicianService.transfer('tech-1', { projectId: 'project-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'TECHNICIAN_DEACTIVATED' });
  });

  it('rejects a target project the company does not own', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById
      .mockResolvedValueOnce(ownedProject) // requireCompanyTechnician's own-project check
      .mockResolvedValueOnce({ ...ownedProject, id: 'project-2', companyId: 'other-company' });

    await expect(
      technicianService.transfer('tech-1', { projectId: 'project-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a technician with an active repair (decisions.md F9 - never orphans work)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById
      .mockResolvedValueOnce(ownedProject)
      .mockResolvedValueOnce({ ...ownedProject, id: 'project-2' });
    mockedTechnicians.countActiveRepairs.mockResolvedValue(1);

    await expect(
      technicianService.transfer('tech-1', { projectId: 'project-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'TECHNICIAN_HAS_ACTIVE_REPAIR' });
  });

  it('transfers a technician with no active repair to the new project', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById
      .mockResolvedValueOnce(ownedProject)
      .mockResolvedValueOnce({ ...ownedProject, id: 'project-2' });
    mockedTechnicians.countActiveRepairs.mockResolvedValue(0);
    mockedTechnicians.updateProject.mockResolvedValue(technicianEntity({ projectId: 'project-2' }) as never);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    await technicianService.transfer('tech-1', { projectId: 'project-2' }, companyRequester, { ipAddress: null });

    expect(mockedTechnicians.updateProject).toHaveBeenCalledWith('tech-1', 'project-2');
  });
});

describe('technicianService.setStatus', () => {
  it('rejects deactivating a technician with an active repair (decisions.md F9)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedTechnicians.countActiveRepairs.mockResolvedValue(1);

    await expect(
      technicianService.setStatus('tech-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'TECHNICIAN_HAS_ACTIVE_REPAIR' });
  });

  it('deactivates cleanly when no active repair exists', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedTechnicians.countActiveRepairs.mockResolvedValue(0);
    mockedTechnicians.updateStatus.mockResolvedValue(technicianEntity({ status: 'INACTIVE' }) as never);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    await technicianService.setStatus('tech-1', false, companyRequester, { ipAddress: null });

    expect(mockedTechnicians.updateStatus).toHaveBeenCalledWith('tech-1', 'INACTIVE');
  });

  it('reactivates to ACTIVATED when the invitation was previously accepted (decisions.md F10)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'INACTIVE' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedInvitations.hasEverAccepted.mockResolvedValue(true);
    mockedTechnicians.updateStatus.mockResolvedValue(technicianEntity({ status: 'ACTIVATED' }) as never);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    await technicianService.setStatus('tech-1', true, companyRequester, { ipAddress: null });

    expect(mockedTechnicians.updateStatus).toHaveBeenCalledWith('tech-1', 'ACTIVATED');
  });

  it('reactivates to INVITED (not bypassing the unaccepted invitation) when it was never accepted (decisions.md F10)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'INACTIVE' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedInvitations.hasEverAccepted.mockResolvedValue(false);
    mockedTechnicians.updateStatus.mockResolvedValue(technicianEntity({ status: 'INVITED' }) as never);
    mockedPMs.findByProjectIdWithUser.mockResolvedValue(null);
    mockedTechnicians.findLegacyStats.mockResolvedValue({
      openRepairsCount: 0,
      completedRepairsCount: 0,
      averageRepairDurationDays: null,
    });

    await technicianService.setStatus('tech-1', true, companyRequester, { ipAddress: null });

    expect(mockedTechnicians.updateStatus).toHaveBeenCalledWith('tech-1', 'INVITED');
  });

  it('rejects reactivating a technician that is not deactivated', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity({ status: 'AVAILABLE' }) as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);

    await expect(
      technicianService.setStatus('tech-1', true, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'NOT_DEACTIVATED' });
  });
});

describe('technicianService.reviews', () => {
  // Task 8 (decisions.md I13/I15): a real ReportReview model exists now, so
  // this is no longer a permanent empty boundary. F12's actual rule - never
  // fabricate, and report `null` rather than `0` when there is nothing - is
  // still asserted, and is now joined by the real-data case it was waiting for.
  it('still returns an honest empty result (averageRating null, never 0) when a technician has no reviews', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    mockedReports.listReviewsByTechnician.mockResolvedValue([] as never);
    mockedReports.technicianStats.mockResolvedValue(canonicalStats());

    const result = await technicianService.reviews('tech-1', companyRequester);

    expect(result).toEqual({ items: [], averageRating: null, total: 0 });
  });

  it('returns real canonical reviews written at homeowner approval (I13)', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue(ownedProject);
    const createdAt = new Date('2026-07-01T10:00:00.000Z');
    mockedReports.listReviewsByTechnician.mockResolvedValue([
      {
        id: 'review-1',
        rating: 5,
        comment: 'تم الإصلاح بسرعة',
        createdAt,
        homeowner: { id: 'owner-1', name: 'محمد العتيبي' },
        report: { id: 'report-1', reportNumber: 1042, category: 'PLUMBING', closedAt: createdAt },
      },
    ] as never);
    mockedReports.technicianStats.mockResolvedValue(
      canonicalStats({ averageRating: 5, reviewsCount: 1 }),
    );

    const result = await technicianService.reviews('tech-1', companyRequester);

    expect(result.total).toBe(1);
    expect(result.averageRating).toBe(5);
    expect(result.items[0]).toEqual({
      id: 'review-1',
      rating: 5,
      comment: 'تم الإصلاح بسرعة',
      createdAt,
      homeownerName: 'محمد العتيبي',
      reportId: 'report-1',
      reportNumber: 1042,
      category: 'PLUMBING',
    });
  });

  it('rejects a technician from another company before reading any review', async () => {
    mockedTechnicians.findById.mockResolvedValue(technicianEntity() as never);
    mockedProjects.findById.mockResolvedValue({ ...ownedProject, companyId: 'other-company' });

    // 404, not 403: a technician outside the caller's company must not have
    // their existence disclosed (the same hide-existence rule as everywhere else).
    await expect(technicianService.reviews('tech-1', companyRequester)).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(mockedReports.listReviewsByTechnician).not.toHaveBeenCalled();
  });
});
