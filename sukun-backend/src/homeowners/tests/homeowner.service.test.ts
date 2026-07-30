import { homeownerService } from '../homeowner.service';
import { homeownerRepository } from '../homeowner.repository';
import { createHomeownerSchema } from '../homeowner.dto';
import { writeAuditLog } from '../../shared/audit.service';
import { authRepository } from '../../auth/auth.repository';
import { unitRepository } from '../../units/unit.repository';
import { buildingRepository } from '../../buildings/building.repository';
import { projectRepository } from '../../projects/project.repository';
import { searchJourneyRepository } from '../../search-journeys/search-journey.repository';
import { searchJourneyService } from '../../search-journeys/search-journey.service';
import { warrantyRepository } from '../../warranty/warranty.repository';
import { reportRepository } from '../../reports/report.repository';
import { UserRole } from '../../shared/roles';
import { UnitStatus } from '../../units/unit.types';
import { BuildingStatus } from '../../buildings/building.types';
import { ProjectStatus } from '../../projects/project.types';
import { SearchJourneyStatus } from '../../search-journeys/search-journey.types';

jest.mock('../homeowner.repository');
jest.mock('../../auth/auth.repository');
jest.mock('../../units/unit.repository');
jest.mock('../../buildings/building.repository');
jest.mock('../../projects/project.repository');
jest.mock('../../search-journeys/search-journey.repository');
jest.mock('../../search-journeys/search-journey.service');
jest.mock('../../warranty/warranty.repository');
// Task 8 (decisions.md I15): H7's reports strip and RE4's report section read
// the canonical report repository now, not the legacy WarrantyReport model.
jest.mock('../../reports/report.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

const mockedHomeowners = homeownerRepository as jest.Mocked<typeof homeownerRepository>;
const mockedReports = reportRepository as jest.Mocked<typeof reportRepository>;

// `clearMocks: true` (jest.config.js) resets return values between tests, so
// every suite that reaches a canonical report read needs these defaults. They
// are honest zeros/empties, not fixtures - each test that cares sets its own.
beforeEach(() => {
  mockedReports.countOpen.mockResolvedValue(0);
  mockedReports.list.mockResolvedValue({ items: [], total: 0 } as never);
});
const mockedAuth = authRepository as jest.Mocked<typeof authRepository>;
const mockedUnits = unitRepository as jest.Mocked<typeof unitRepository>;
const mockedBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedJourneys = searchJourneyRepository as jest.Mocked<typeof searchJourneyRepository>;
const mockedJourneyService = searchJourneyService as jest.Mocked<typeof searchJourneyService>;
const mockedWarranty = warrantyRepository as jest.Mocked<typeof warrantyRepository>;
const mockedAuditLog = writeAuditLog as jest.Mock;

const unit = {
  id: 'unit-1',
  buildingId: 'building-1',
  number: '101',
  floor: 1,
  type: 'Apartment',
  status: UnitStatus.AVAILABLE,
  area: null,
  bedrooms: null,
  bathrooms: null,
  parkingSpots: null,
  price: null,
  source: 'MANUAL',
  externalId: null,
  sourceUpdatedAt: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const building = {
  id: 'building-1',
  projectId: 'project-1',
  name: 'Tower A',
  number: '1',
  status: BuildingStatus.ACTIVE,
  isActive: true,
  floors: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { units: 1 },
};
const company = {
  id: 'company-1',
  name: 'Al Ofoq Real Estate Development',
  commercialRegistration: 'CR-1',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const project = {
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
  _count: { buildings: 1 },
  projectManager: null,
  company,
};

const dto = {
  name: 'Sara',
  nationalId: '1234567890',
  email: 'sara@example.com',
  phone: '0511111111',
  unitId: 'unit-1',
};

describe('homeownerService.register', () => {
  it('rejects a unit that already has an active owner (EDG-006)', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue({ id: 'ownership-1' } as never);

    await expect(
      homeownerService.register(dto, 'company-user', 'company-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'UNIT_ALREADY_OWNED' });
  });

  it('rejects a national ID already registered to a different account', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findByNationalId.mockResolvedValue({ id: 'someone-else' } as never);
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);

    await expect(
      homeownerService.register(dto, 'company-user', 'company-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'NATIONAL_ID_ALREADY_EXISTS' });
  });

  it('rejects reusing an account with an incompatible role', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findByNationalId.mockResolvedValue(null);
    mockedAuth.findUserByEmail.mockResolvedValue({ id: 'u1', role: UserRole.COMPANY } as never);
    mockedAuth.findUserByPhone.mockResolvedValue(null);

    await expect(
      homeownerService.register(dto, 'company-user', 'company-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_USER_FOR_HOMEOWNER_ACTIVATION' });
  });

  it('rejects a different national ID already on file for the matched existing person (identity mismatch)', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findByNationalId.mockResolvedValue(null);
    mockedAuth.findUserByEmail.mockResolvedValue({
      id: 'existing-user',
      role: UserRole.HOME_SEEKER,
      nationalId: '9999999999',
    } as never);
    mockedAuth.findUserByPhone.mockResolvedValue(null);

    await expect(
      homeownerService.register(dto, 'company-user', 'company-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'IDENTITY_MISMATCH' });
  });

  it('rejects a second pending invitation for the same person and unit', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findByNationalId.mockResolvedValue(null);
    mockedAuth.findUserByEmail.mockResolvedValue({
      id: 'existing-user',
      role: UserRole.HOME_SEEKER,
      nationalId: null,
    } as never);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      id: 'activation-existing',
      unitId: 'unit-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86_400_000),
    } as never);

    await expect(
      homeownerService.register(dto, 'company-user', 'company-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ACTIVATION_ALREADY_PENDING' });
  });

  it('creates a brand-new user + activation for an external buyer', async () => {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findByNationalId.mockResolvedValue(null);
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedAuth.createUserWithActiveSearchJourney.mockResolvedValue({
      id: 'new-user',
      searchJourneys: [{ id: 'journey-1' }],
    } as never);
    mockedHomeowners.createActivation.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      userId: 'new-user',
      codeHash: 'hash',
      status: 'PENDING',
      expiresAt: new Date(),
      activatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await homeownerService.register(dto, 'company-user', 'company-1', {
      ipAddress: null,
    });

    expect(result.activationCodePreview).toBeDefined();
    expect(result.status).toBe('PENDING');
  });
});

/**
 * Pre-event change: no end-user journey collects a National ID any more, so
 * `register` must work with the key absent entirely — and must not compensate
 * by inventing one. These lock in the four things that could silently regress:
 * nothing is looked up, nothing is written, no conflict rule fires, and an
 * existing stored value is never disturbed.
 */
describe('homeownerService.register without a national ID', () => {
  const dtoWithoutNationalId = {
    name: 'Sara',
    email: 'sara@example.com',
    phone: '0511111111',
    unitId: 'unit-1',
  };

  function arrangeOwnableUnit() {
    mockedUnits.findById.mockResolvedValue(unit);
    mockedBuildings.findById.mockResolvedValue(building);
    mockedProjects.findById.mockResolvedValue(project);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.createActivation.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      userId: 'new-user',
      codeHash: 'hash',
      status: 'PENDING',
      expiresAt: new Date(),
      activatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it('creates a brand-new homeowner and stores NO national ID (never a fabricated one)', async () => {
    arrangeOwnableUnit();
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedAuth.createUserWithActiveSearchJourney.mockResolvedValue({
      id: 'new-user',
      searchJourneys: [{ id: 'journey-1' }],
    } as never);

    const result = await homeownerService.register(
      dtoWithoutNationalId,
      'company-user',
      'company-1',
      { ipAddress: null },
    );

    expect(result.status).toBe('PENDING');
    // No lookup can happen when there is no value to look up.
    expect(mockedHomeowners.findByNationalId).not.toHaveBeenCalled();
    // The column is omitted, NOT set to '' / a phone number / a random string.
    const created = mockedAuth.createUserWithActiveSearchJourney.mock.calls[0][0];
    expect(created.nationalId).toBeUndefined();
    expect(created.phone).toBe('0511111111');
  });

  it('does not overwrite or clear a national ID already on file for a matched person', async () => {
    arrangeOwnableUnit();
    mockedAuth.findUserByEmail.mockResolvedValue({
      id: 'existing-user',
      role: UserRole.HOME_SEEKER,
      nationalId: '9999999999',
    } as never);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue(null);

    await homeownerService.register(dtoWithoutNationalId, 'company-user', 'company-1', {
      ipAddress: null,
    });

    // The stored value is preserved untouched: no write, and no IDENTITY_MISMATCH
    // (there is no competing claim to mismatch against).
    expect(mockedHomeowners.setNationalId).not.toHaveBeenCalled();
  });

  it('still enforces uniqueness and identity conflicts when a value IS supplied', async () => {
    arrangeOwnableUnit();
    mockedHomeowners.findByNationalId.mockResolvedValue({ id: 'someone-else' } as never);
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);

    await expect(
      homeownerService.register(
        { ...dtoWithoutNationalId, nationalId: '1234567890' },
        'company-user',
        'company-1',
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'NATIONAL_ID_ALREADY_EXISTS' });
  });

  it('rejects a blank national ID at the schema rather than storing it', () => {
    expect(createHomeownerSchema.safeParse({ ...dtoWithoutNationalId, nationalId: '' }).success).toBe(
      false,
    );
    expect(
      createHomeownerSchema.safeParse({ ...dtoWithoutNationalId, nationalId: '   ' }).success,
    ).toBe(false);
    // Absent is valid; a real value is valid.
    expect(createHomeownerSchema.safeParse(dtoWithoutNationalId).success).toBe(true);
    expect(
      createHomeownerSchema.safeParse({ ...dtoWithoutNationalId, nationalId: '1234567890' }).success,
    ).toBe(true);
  });
});

describe('homeownerService.activate', () => {
  const pendingActivation = {
    id: 'activation-1',
    unitId: 'unit-1',
    userId: 'user-1',
    codeHash: 'hash',
    status: 'PENDING' as const,
    expiresAt: new Date(Date.now() + 86_400_000),
    activatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeUser = {
    id: 'user-1',
    name: 'Sara',
    email: 'sara@example.com',
    phone: '0511111111',
    passwordHash: 'x',
    role: UserRole.HOMEOWNER,
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    companyId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('rejects an invalid code (EDG-009) and audits the failure without a userId', async () => {
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue(null);

    await expect(
      homeownerService.activate({ code: 'BADCODE', password: 'Passw0rd' }, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_ACTIVATION_CODE' });

    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'HOMEOWNER_ACTIVATION_FAILED',
        metadata: { reason: 'INVALID_ACTIVATION_CODE' },
      }),
    );
  });

  it('rejects an already-consumed code (EDG-010)', async () => {
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue({
      ...pendingActivation,
      status: 'ACTIVATED',
    });

    await expect(
      homeownerService.activate({ code: 'CODE', password: 'Passw0rd' }, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ACTIVATION_CODE_ALREADY_USED' });
  });

  it('rejects an expired code (EDG-008)', async () => {
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue({
      ...pendingActivation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      homeownerService.activate({ code: 'CODE', password: 'Passw0rd' }, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ACTIVATION_CODE_EXPIRED' });
  });

  it('rejects activation for a deactivated account without consuming the code (decisions.md H5)', async () => {
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue(pendingActivation);
    mockedAuth.findUserById.mockResolvedValue({ ...activeUser, status: 'ARCHIVED' } as never);

    await expect(
      homeownerService.activate({ code: 'CODE', password: 'Passw0rd1' }, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DEACTIVATED' });

    expect(mockedHomeowners.activateAtomically).not.toHaveBeenCalled();
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'HOMEOWNER_ACTIVATION_FAILED',
        metadata: { reason: 'ACCOUNT_DEACTIVATED' },
      }),
    );
  });

  it('promotes the account, creates ownership, and issues tokens', async () => {
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue(pendingActivation);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedUnits.findById.mockResolvedValue(unit);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedJourneys.findActiveByUserId.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.INSPECTING,
      startedAt: new Date(),
      closedAt: null,
    });
    mockedAuth.findUserById.mockResolvedValue(activeUser as never);

    const ownershipStartDate = new Date('2026-02-01T00:00:00.000Z');
    mockedHomeowners.activateAtomically.mockResolvedValue([
      activeUser,
      { id: 'ownership-1', unitId: 'unit-1', userId: 'user-1', startDate: ownershipStartDate },
      pendingActivation,
    ] as never);

    const result = await homeownerService.activate(
      { code: 'CODE', password: 'Passw0rd1' },
      { ipAddress: null },
    );

    expect(mockedHomeowners.activateAtomically).toHaveBeenCalledWith('activation-1', 'unit-1', 'user-1');
    expect(mockedUnits.updateStatus).toHaveBeenCalledWith('unit-1', UnitStatus.OCCUPIED);
    // decisions.md H1: warranty starts from the same instant the Ownership
    // row itself was created, not a second independent `new Date()` read.
    expect(mockedWarranty.createDefault).toHaveBeenCalledWith('unit-1', ownershipStartDate);
    expect(mockedJourneyService.advanceStatus).toHaveBeenCalledWith(
      'journey-1',
      SearchJourneyStatus.PURCHASED,
      { ipAddress: null },
    );
    expect(mockedJourneyService.advanceStatus).toHaveBeenCalledWith(
      'journey-1',
      SearchJourneyStatus.CLOSED,
      { ipAddress: null },
    );
    expect(result.session.accessToken).toBeDefined();
    expect(result.session.role).toBe('homeowner_active');
    expect(result.refreshToken).toBeDefined();
  });

  it('rejects activation on an already-OCCUPIED unit WITHOUT consuming the code or creating ownership', async () => {
    // Regression test: assertUnitTransition used to run after
    // promoteToHomeowner/createOwnership/markActivated had already
    // committed, so this exact case (e.g. the HOM-001 race letting a second
    // activation reach here) used to burn the one-time code and create a
    // duplicate Ownership row before throwing.
    mockedHomeowners.findActivationByCodeHash.mockResolvedValue(pendingActivation);
    mockedAuth.findUserById.mockResolvedValue(activeUser as never);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedUnits.findById.mockResolvedValue({ ...unit, status: UnitStatus.OCCUPIED });

    await expect(
      homeownerService.activate({ code: 'CODE', password: 'Passw0rd1' }, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE_TRANSITION' });

    expect(mockedHomeowners.activateAtomically).not.toHaveBeenCalled();
    expect(mockedUnits.updateStatus).not.toHaveBeenCalled();
    expect(mockedAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HOMEOWNER_ACTIVATION_FAILED',
        metadata: { reason: 'INVALID_STATE_TRANSITION' },
      }),
    );
  });
});

describe('homeownerService.getMyHome', () => {
  beforeEach(() => {
    mockedReports.countOpen.mockResolvedValue(0);
  });

  it('returns the unit/building/project/developer for the active ownership, with a real reports summary', async () => {
    mockedHomeowners.findActiveOwnershipByUserId.mockResolvedValue({
      id: 'ownership-1',
      startDate: new Date('2026-01-01'),
      unit: { ...unit, building: { ...building, project } },
    } as never);
    mockedWarranty.findByUnitId.mockResolvedValue(null);

    const result = await homeownerService.getMyHome('user-1');

    expect(result).toMatchObject({
      ownershipId: 'ownership-1',
      handoverDate: new Date('2026-01-01'),
      unit: { id: 'unit-1', number: '101', area: null, bedrooms: null, bathrooms: null, parkingSpots: null },
      building: { id: 'building-1', name: 'Tower A' },
      project: { id: 'project-1', name: 'Sedra', city: 'Riyadh', developerName: 'Al Ofoq Real Estate Development' },
      coverImage: { url: null, isPlaceholder: true },
      warranty: null,
      // Task 8 (decisions.md I15): the H8-promised shape is unchanged; only the
      // values are real now. A homeowner with no open reports still honestly
      // reports 0 - `available: true` means "the resource exists", not "there
      // is something to show".
      reportsSummary: { available: true, openCount: 0, boundary: 'ACTIVE' },
    });
  });

  it('reports a real open-report count from the canonical repository, scoped to this homeowner (I15)', async () => {
    mockedHomeowners.findActiveOwnershipByUserId.mockResolvedValue({
      id: 'ownership-1',
      startDate: new Date('2026-01-01'),
      unit: { ...unit, building: { ...building, project } },
    } as never);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedReports.countOpen.mockResolvedValue(3);

    const result = await homeownerService.getMyHome('user-1');

    expect(result.reportsSummary).toEqual({ available: true, openCount: 3, boundary: 'ACTIVE' });
    // The scope predicate must be the caller's own id - never widened, and
    // never a legacy WarrantyReport query.
    expect(mockedReports.countOpen).toHaveBeenCalledWith({ homeownerId: 'user-1' });
  });

  it('summarizes an active warranty without exposing per-category computation details', async () => {
    mockedHomeowners.findActiveOwnershipByUserId.mockResolvedValue({
      id: 'ownership-1',
      startDate: new Date('2026-01-01'),
      unit: { ...unit, building: { ...building, project } },
    } as never);
    mockedWarranty.findByUnitId.mockResolvedValue({
      id: 'warranty-1',
      unitId: 'unit-1',
      startDate: new Date('2026-01-01'),
      endDate: new Date(Date.now() + 365 * 86_400_000),
      coverage: 'Standard',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await homeownerService.getMyHome('user-1');

    expect(result.warranty).toMatchObject({ isActive: true });
    expect(result.warranty?.daysRemaining).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('warranty.categories');
  });

  it('rejects with NO_ACTIVE_OWNERSHIP when the user owns no unit', async () => {
    mockedHomeowners.findActiveOwnershipByUserId.mockResolvedValue(null);

    await expect(homeownerService.getMyHome('user-1')).rejects.toMatchObject({
      errorCode: 'NO_ACTIVE_OWNERSHIP',
    });
  });
});

// ---------------------------------------------------------------------
// Task 5 (RE4): company-wide homeowner management.
// ---------------------------------------------------------------------

const companyRequester = { id: 'req-1', role: UserRole.COMPANY, companyId: 'company-1' };

const homeownerUser = {
  id: 'user-1',
  name: 'Sara',
  email: 'sara@example.com',
  phone: '0511111111',
  nationalId: '1234567890',
  passwordHash: 'x',
  role: UserRole.HOMEOWNER,
  status: 'ACTIVE',
  failedLoginAttempts: 0,
  lockedUntil: null,
  companyId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const unitWithContext = { ...unit, building: { ...building, project } };

function mockScopedHomeowner() {
  mockedHomeowners.findUserById.mockResolvedValue(homeownerUser as never);
  mockedHomeowners.belongsToCompany.mockResolvedValue(true);
}

describe('homeownerService object-level scoping (decisions.md F5/F14)', () => {
  it('404s (not 403) every id-keyed method for a user outside the requester company roster', async () => {
    mockedHomeowners.findUserById.mockResolvedValue(homeownerUser as never);
    mockedHomeowners.belongsToCompany.mockResolvedValue(false);

    await expect(homeownerService.getProfile('user-1', companyRequester)).rejects.toMatchObject({
      httpStatus: 404,
      errorCode: 'HOMEOWNER_NOT_FOUND',
    });
    await expect(
      homeownerService.update('user-1', { email: 'x@example.com' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      homeownerService.setStatus('user-1', false, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the user id does not exist at all', async () => {
    mockedHomeowners.findUserById.mockResolvedValue(null);

    await expect(homeownerService.getProfile('missing', companyRequester)).rejects.toMatchObject({
      httpStatus: 404,
      errorCode: 'HOMEOWNER_NOT_FOUND',
    });
  });
});

describe('homeownerService.getProfile', () => {
  it('assembles profile + invitation/ownership history + warranty/report boundary', async () => {
    mockScopedHomeowner();
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext.mockResolvedValue({
      id: 'ownership-1',
      unitId: 'unit-1',
      startDate: new Date('2026-01-05'),
      status: 'ACTIVE',
      unit: unitWithContext,
    } as never);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    const result = await homeownerService.getProfile('user-1', companyRequester);

    expect(result.status).toBe('ACTIVE');
    expect(result.unit).toMatchObject({ id: 'unit-1', number: '101' });
    expect(result.warranty).toBeNull();
    expect(result.openReportsCount).toBe(0);
  });
});

describe('homeownerService.update', () => {
  it('rejects an email already used by a different account', async () => {
    mockScopedHomeowner();
    mockedAuth.findUserByEmail.mockResolvedValue({ id: 'someone-else' } as never);

    await expect(
      homeownerService.update('user-1', { email: 'taken@example.com' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
  });

  it('updates mobile/email only and returns the refreshed profile', async () => {
    mockScopedHomeowner();
    mockedAuth.findUserByEmail.mockResolvedValue(null);
    mockedAuth.findUserByPhone.mockResolvedValue(null);
    mockedHomeowners.updateContact.mockResolvedValue(homeownerUser as never);
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext.mockResolvedValue(null);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    await homeownerService.update('user-1', { phone: '0522222222' }, companyRequester, { ipAddress: null });

    expect(mockedHomeowners.updateContact).toHaveBeenCalledWith('user-1', {
      email: undefined,
      phone: '0522222222',
    });
  });
});

describe('homeownerService.transfer', () => {
  const activeOwnership = {
    id: 'ownership-1',
    unitId: 'unit-1',
    userId: 'user-1',
  };

  it('rejects transferring a deactivated homeowner', async () => {
    mockedHomeowners.findUserById.mockResolvedValue({ ...homeownerUser, status: 'ARCHIVED' } as never);
    mockedHomeowners.belongsToCompany.mockResolvedValue(true);

    await expect(
      homeownerService.transfer('user-1', { unitId: 'unit-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'HOMEOWNER_DEACTIVATED' });
  });

  it('rejects a target unit outside the requester company', async () => {
    mockScopedHomeowner();
    mockedUnits.findById.mockResolvedValue({ ...unit, id: 'unit-2' } as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedProjects.findById.mockResolvedValue({ ...project, companyId: 'other-company' } as never);

    await expect(
      homeownerService.transfer('user-1', { unitId: 'unit-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('rejects a target unit that already has an active owner', async () => {
    mockScopedHomeowner();
    mockedUnits.findById.mockResolvedValue({ ...unit, id: 'unit-2' } as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedProjects.findById.mockResolvedValue(project as never);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue({ id: 'other-ownership' } as never);

    await expect(
      homeownerService.transfer('user-1', { unitId: 'unit-2' }, companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'UNIT_ALREADY_OWNED' });
  });

  it('transfers an active homeowner atomically and flips both units', async () => {
    mockScopedHomeowner();
    mockedUnits.findById.mockResolvedValue({ ...unit, id: 'unit-2' } as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedProjects.findById.mockResolvedValue(project as never);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext
      .mockResolvedValueOnce({ ...activeOwnership, unit: unitWithContext } as never)
      .mockResolvedValueOnce(null);
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    await homeownerService.transfer('user-1', { unitId: 'unit-2' }, companyRequester, { ipAddress: null });

    expect(mockedHomeowners.transferActiveOwnership).toHaveBeenCalledWith({
      oldOwnershipId: 'ownership-1',
      oldUnitId: 'unit-1',
      newUnitId: 'unit-2',
      userId: 'user-1',
    });
  });

  it('retargets a still-pending activation without reissuing its code', async () => {
    mockScopedHomeowner();
    mockedUnits.findById.mockResolvedValue({ ...unit, id: 'unit-2' } as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedProjects.findById.mockResolvedValue(project as never);
    mockedHomeowners.findActiveOwnershipByUnit.mockResolvedValue(null);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext.mockResolvedValue(null);
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86_400_000),
    } as never);
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    await homeownerService.transfer('user-1', { unitId: 'unit-2' }, companyRequester, { ipAddress: null });

    expect(mockedHomeowners.reassignPendingActivationUnit).toHaveBeenCalledWith('activation-1', 'unit-2');
  });
});

describe('homeownerService.setStatus', () => {
  it('deactivates without touching ownership', async () => {
    mockScopedHomeowner();
    mockedHomeowners.setUserStatus.mockResolvedValue(homeownerUser as never);
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext.mockResolvedValue(null);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    await homeownerService.setStatus('user-1', false, companyRequester, { ipAddress: null });

    expect(mockedHomeowners.setUserStatus).toHaveBeenCalledWith('user-1', 'ARCHIVED');
  });

  it('reactivates with no new invitation and no re-verification', async () => {
    mockScopedHomeowner();
    mockedHomeowners.setUserStatus.mockResolvedValue(homeownerUser as never);
    mockedHomeowners.findAllActivationsByUserId.mockResolvedValue([]);
    mockedHomeowners.findAllOwnershipsByUserId.mockResolvedValue([]);
    mockedHomeowners.findActiveOwnershipByUserIdWithContext.mockResolvedValue(null);
    mockedWarranty.findByUnitId.mockResolvedValue(null);
    mockedWarranty.findReportsByHomeowner.mockResolvedValue([]);

    await homeownerService.setStatus('user-1', true, companyRequester, { ipAddress: null });

    expect(mockedHomeowners.setUserStatus).toHaveBeenCalledWith('user-1', 'ACTIVE');
  });
});

describe('homeownerService.resendInvitationForUser', () => {
  it('resolves the latest activation internally and reissues its code', async () => {
    mockScopedHomeowner();
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      status: 'PENDING',
    } as never);
    mockedHomeowners.findActivationById.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      status: 'PENDING',
    } as never);
    mockedUnits.findById.mockResolvedValue(unit as never);
    mockedBuildings.findById.mockResolvedValue(building as never);
    mockedProjects.findById.mockResolvedValue(project as never);
    mockedHomeowners.reissueCode.mockResolvedValue({
      id: 'activation-1',
      unitId: 'unit-1',
      status: 'PENDING',
      expiresAt: new Date(),
    } as never);

    const result = await homeownerService.resendInvitationForUser('user-1', companyRequester, { ipAddress: null });

    expect(result.id).toBe('activation-1');
    expect(mockedHomeowners.reissueCode).toHaveBeenCalled();
  });

  it('404s when no activation exists for this homeowner', async () => {
    mockScopedHomeowner();
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue(null);

    await expect(
      homeownerService.resendInvitationForUser('user-1', companyRequester, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ACTIVATION_NOT_FOUND' });
  });
});

describe('homeownerService.list / listForExport', () => {
  it('filters by derived status in-memory and paginates', async () => {
    mockedHomeowners.findCompanyHomeowners.mockResolvedValue({
      all: [{ ...homeownerUser, homeownerActivations: [], ownerships: [] }] as never,
      page: 1,
      pageSize: 20,
    });

    const result = await homeownerService.list(companyRequester, { page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0].status).toBe('ACTIVE');
  });

  it('never includes another company scope - delegates the company id from the requester', async () => {
    mockedHomeowners.findCompanyHomeowners.mockResolvedValue({ all: [], page: 1, pageSize: 20 });

    await homeownerService.listForExport(companyRequester, {});

    expect(mockedHomeowners.findCompanyHomeowners).toHaveBeenCalledWith(
      'company-1',
      {},
      1,
      Number.MAX_SAFE_INTEGER,
    );
  });
});
