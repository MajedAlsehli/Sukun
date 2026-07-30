import { authService } from '../auth.service';
import { authRepository } from '../auth.repository';
import { hashPassword } from '../password.util';
import { homeownerRepository } from '../../homeowners/homeowner.repository';
import { technicianRepository } from '../../technicians/technician.repository';

jest.mock('../auth.repository');
jest.mock('../../homeowners/homeowner.repository');
jest.mock('../../technicians/technician.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedRepo = authRepository as jest.Mocked<typeof authRepository>;
const mockedHomeownerRepo = homeownerRepository as jest.Mocked<typeof homeownerRepository>;
const mockedTechnicianRepo = technicianRepository as jest.Mocked<typeof technicianRepository>;

// accountState.ts only queries this for HOME_SEEKER - default to "no
// activation" (prospect) so every test below resolves predictably unless it
// overrides this itself.
mockedHomeownerRepo.findLatestActivationByUserId = jest.fn().mockResolvedValue(null);

describe('authService.register', () => {
  it('rejects a duplicate email (USR-001)', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue({ id: 'existing' } as never);
    mockedRepo.findUserByPhone.mockResolvedValue(null);

    await expect(
      authService.register(
        { name: 'Ahmed', email: 'ahmed@example.com', phone: '0500000000', password: 'Passw0rd' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS' });
  });

  it('rejects a duplicate phone (USR-002)', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);
    mockedRepo.findUserByPhone.mockResolvedValue({ id: 'existing' } as never);

    await expect(
      authService.register(
        { name: 'Ahmed', email: 'ahmed@example.com', phone: '0500000000', password: 'Passw0rd' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'PHONE_ALREADY_EXISTS' });
  });

  it('creates a HOME_SEEKER with an active search journey on success (SEA-001)', async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);
    mockedRepo.findUserByPhone.mockResolvedValue(null);
    mockedRepo.createUserWithActiveSearchJourney.mockResolvedValue({
      id: 'user-1',
      name: 'Ahmed',
      email: 'ahmed@example.com',
      phone: '0500000000',
      role: 'HOME_SEEKER',
      status: 'ACTIVE',
      createdAt: new Date(),
      searchJourneys: [{ id: 'journey-1', status: 'CREATED' }],
    } as never);
    mockedRepo.createRefreshToken.mockResolvedValue({} as never);

    const result = await authService.register(
      { name: 'Ahmed', email: 'ahmed@example.com', phone: '0500000000', password: 'Passw0rd' },
      { ipAddress: '127.0.0.1' },
    );

    expect(result.session.backendRole).toBe('HOME_SEEKER');
    expect(result.session.role).toBe('homeowner_prospect');
    expect(result.session.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });
});

describe('authService.login', () => {
  it('locks the account after the configured max failed attempts (SEC-007)', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'ahmed@example.com',
      passwordHash,
      failedLoginAttempts: 4,
      lockedUntil: null,
      role: 'HOME_SEEKER',
    } as never);
    mockedRepo.incrementFailedAttempts.mockResolvedValue({} as never);

    await expect(
      authService.login(
        { email: 'ahmed@example.com', password: 'WrongPass' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });

    expect(mockedRepo.incrementFailedAttempts).toHaveBeenCalledWith(
      'user-1',
      0,
      expect.any(Date),
    );
  });

  it('rejects login while locked, even with the correct password (SEC-007)', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'ahmed@example.com',
      passwordHash,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
      role: 'HOME_SEEKER',
    } as never);

    await expect(
      authService.login(
        { email: 'ahmed@example.com', password: 'CorrectPass1' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_LOCKED' });
  });

  it('rejects a deactivated (ARCHIVED) account even with the correct password', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'ahmed@example.com',
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      role: 'HOME_SEEKER',
      status: 'ARCHIVED',
    } as never);

    await expect(
      authService.login(
        { email: 'ahmed@example.com', password: 'CorrectPass1' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DEACTIVATED' });
  });

  it('rejects a technician whose TechnicianStatus is INACTIVE, even with an ACTIVE User row', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'tech-user-1',
      email: 'tech@example.com',
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      role: 'TECHNICIAN',
      status: 'ACTIVE',
    } as never);
    mockedTechnicianRepo.findByUserId.mockResolvedValue({
      id: 'tech-1',
      userId: 'tech-user-1',
      projectId: 'project-1',
      status: 'INACTIVE',
    } as never);

    await expect(
      authService.login(
        { email: 'tech@example.com', password: 'CorrectPass1' },
        { ipAddress: null },
      ),
    ).rejects.toMatchObject({ errorCode: 'ACCOUNT_DEACTIVATED' });
  });

  it('resolves every backend role to its correct derived frontend role + landing route', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.resetFailedAttempts.mockResolvedValue({} as never);
    mockedRepo.createRefreshToken.mockResolvedValue({} as never);

    const cases: Array<{ role: string; expectedFrontendRole: string; landingRoute: string }> = [
      { role: 'TECHNICIAN', expectedFrontendRole: 'technician', landingRoute: '/technician/tasks' },
      { role: 'PROJECT_MANAGER', expectedFrontendRole: 'pm', landingRoute: '/pm' },
      { role: 'COMPANY', expectedFrontendRole: 'company', landingRoute: '/company' },
      { role: 'HOMEOWNER', expectedFrontendRole: 'homeowner_active', landingRoute: '/home' },
    ];

    for (const { role, expectedFrontendRole, landingRoute } of cases) {
      mockedTechnicianRepo.findByUserId.mockResolvedValue(null);
      mockedRepo.findUserByEmail.mockResolvedValue({
        id: `user-${role}`,
        email: `${role}@example.com`,
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        role,
        status: 'ACTIVE',
      } as never);

      const result = await authService.login(
        { email: `${role}@example.com`, password: 'CorrectPass1' },
        { ipAddress: null },
      );

      expect(result.session.role).toBe(expectedFrontendRole);
      expect(result.session.landingRoute).toBe(landingRoute);
    }
  });

  it('resolves a HOME_SEEKER with a live pending activation to homeowner_pending', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.resetFailedAttempts.mockResolvedValue({} as never);
    mockedRepo.createRefreshToken.mockResolvedValue({} as never);
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'pending-user-1',
      email: 'pending@example.com',
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      role: 'HOME_SEEKER',
      status: 'ACTIVE',
    } as never);
    mockedHomeownerRepo.findLatestActivationByUserId.mockResolvedValue({
      id: 'activation-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const result = await authService.login(
      { email: 'pending@example.com', password: 'CorrectPass1' },
      { ipAddress: null },
    );

    expect(result.session.role).toBe('homeowner_pending');
    expect(result.session.landingRoute).toBe('/activate');

    mockedHomeownerRepo.findLatestActivationByUserId.mockResolvedValue(null);
  });

  it('resolves a HOME_SEEKER whose only activation is expired to homeowner_prospect, not pending', async () => {
    const passwordHash = await hashPassword('CorrectPass1');
    mockedRepo.resetFailedAttempts.mockResolvedValue({} as never);
    mockedRepo.createRefreshToken.mockResolvedValue({} as never);
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: 'expired-user-1',
      email: 'expired@example.com',
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      role: 'HOME_SEEKER',
      status: 'ACTIVE',
    } as never);
    mockedHomeownerRepo.findLatestActivationByUserId.mockResolvedValue({
      id: 'activation-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000), // expired, never resent
    } as never);

    const result = await authService.login(
      { email: 'expired@example.com', password: 'CorrectPass1' },
      { ipAddress: null },
    );

    expect(result.session.role).toBe('homeowner_prospect');
    expect(result.session.landingRoute).toBe('/discover');

    mockedHomeownerRepo.findLatestActivationByUserId.mockResolvedValue(null);
  });
});

describe('authService.refresh', () => {
  it('rejects a refresh token that has already been used (SEC-003)', async () => {
    mockedRepo.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedRepo.revokeAllRefreshTokens.mockResolvedValue({} as never);

    await expect(authService.refresh('some-raw-token')).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
    });
  });

  it('reuse of an already-used refresh token revokes every session for that user (theft response)', async () => {
    mockedRepo.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-victim',
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedRepo.revokeAllRefreshTokens.mockResolvedValue({} as never);

    await expect(authService.refresh('stolen-and-replayed-token')).rejects.toBeDefined();

    expect(mockedRepo.revokeAllRefreshTokens).toHaveBeenCalledWith('user-victim');
  });

  it('rejects refresh for a revoked (e.g. logged-out) token without treating it as reuse', async () => {
    mockedRepo.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      usedAt: null,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    await expect(authService.refresh('revoked-token')).rejects.toMatchObject({
      errorCode: 'INVALID_TOKEN',
    });
    expect(mockedRepo.revokeAllRefreshTokens).not.toHaveBeenCalledWith('user-1');
  });

  it('rejects refresh for a deactivated account (SEC-003 + Task 3 lifecycle rule)', async () => {
    mockedRepo.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-2',
      userId: 'deactivated-user',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedRepo.findUserById.mockResolvedValue({
      id: 'deactivated-user',
      role: 'HOME_SEEKER',
      status: 'ARCHIVED',
    } as never);

    await expect(authService.refresh('some-token')).rejects.toMatchObject({
      errorCode: 'ACCOUNT_DEACTIVATED',
    });
  });
});

describe('authService.resetPassword', () => {
  it('revokes all refresh tokens after a successful reset (SEC-006)', async () => {
    mockedRepo.findPasswordResetTokenByHash.mockResolvedValue({
      id: 'prt-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedRepo.updatePassword.mockResolvedValue({} as never);
    mockedRepo.markPasswordResetTokenUsed.mockResolvedValue({} as never);
    mockedRepo.revokeAllRefreshTokens.mockResolvedValue({} as never);

    await authService.resetPassword('some-raw-reset-token', 'NewPassw0rd');

    expect(mockedRepo.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
  });
});
