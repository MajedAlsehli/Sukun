import { invitationService } from '../invitation.service';
import { invitationRepository } from '../invitation.repository';
import { authRepository } from '../auth.repository';
import { technicianRepository } from '../../technicians/technician.repository';
import { hashOpaqueToken } from '../token.util';

jest.mock('../invitation.repository');
jest.mock('../auth.repository');
jest.mock('../../technicians/technician.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedInvitations = invitationRepository as jest.Mocked<typeof invitationRepository>;
const mockedAuth = authRepository as jest.Mocked<typeof authRepository>;
const mockedTechnicians = technicianRepository as jest.Mocked<typeof technicianRepository>;

describe('invitationService.issue', () => {
  it('revokes any still-outstanding invitation for the same user+purpose before issuing a new one', async () => {
    mockedInvitations.revokeActiveForUser.mockResolvedValue({ count: 1 } as never);
    mockedInvitations.create.mockResolvedValue({} as never);

    await invitationService.issue('user-1', 'TECHNICIAN_ACTIVATION' as never);

    expect(mockedInvitations.revokeActiveForUser).toHaveBeenCalledWith(
      'user-1',
      'TECHNICIAN_ACTIVATION',
    );
    expect(mockedInvitations.create).toHaveBeenCalled();
  });
});

describe('invitationService.accept', () => {
  it('rejects an unknown token', async () => {
    mockedInvitations.findByHash.mockResolvedValue(null);

    await expect(
      invitationService.accept('bad-token', 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_INVITATION_TOKEN' });
  });

  it('rejects a revoked token', async () => {
    mockedInvitations.findByHash.mockResolvedValue({
      id: 'inv-1',
      userId: 'user-1',
      purpose: 'TECHNICIAN_ACTIVATION',
      usedAt: null,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    await expect(
      invitationService.accept('revoked-token', 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_INVITATION_TOKEN' });
  });

  it('rejects an already-used token (cannot be reused after acceptance)', async () => {
    mockedInvitations.findByHash.mockResolvedValue({
      id: 'inv-1',
      userId: 'user-1',
      purpose: 'TECHNICIAN_ACTIVATION',
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    await expect(
      invitationService.accept('used-token', 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVITATION_ALREADY_USED' });
  });

  it('rejects an expired token', async () => {
    mockedInvitations.findByHash.mockResolvedValue({
      id: 'inv-1',
      userId: 'user-1',
      purpose: 'TECHNICIAN_ACTIVATION',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    await expect(
      invitationService.accept('expired-token', 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVITATION_EXPIRED' });
  });

  it('rejects re-acceptance for a technician that is already ACTIVATED', async () => {
    mockedInvitations.findByHash.mockResolvedValue({
      id: 'inv-1',
      userId: 'user-1',
      purpose: 'TECHNICIAN_ACTIVATION',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedTechnicians.findByUserId.mockResolvedValue({
      id: 'tech-1',
      userId: 'user-1',
      status: 'ACTIVATED',
    } as never);

    await expect(
      invitationService.accept('valid-token', 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'ALREADY_ACTIVATED' });
  });

  it('activates an INVITED technician, sets a real password, marks the token used, and issues tokens', async () => {
    mockedInvitations.findByHash.mockResolvedValue({
      id: 'inv-1',
      userId: 'user-1',
      purpose: 'TECHNICIAN_ACTIVATION',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedTechnicians.findByUserId.mockResolvedValue({
      id: 'tech-1',
      userId: 'user-1',
      status: 'INVITED',
    } as never);
    mockedTechnicians.activateWithPassword.mockResolvedValue([{}, {}] as never);
    mockedInvitations.markUsed.mockResolvedValue({} as never);
    mockedAuth.findUserById.mockResolvedValue({
      id: 'user-1',
      name: 'Ahmed',
      email: 'ahmed@example.com',
      phone: '0500000000',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      createdAt: new Date(),
    } as never);
    mockedAuth.createRefreshToken.mockResolvedValue({} as never);

    const result = await invitationService.accept('valid-token', 'NewPassw0rd', { ipAddress: null });

    expect(mockedTechnicians.activateWithPassword).toHaveBeenCalledWith('user-1', 'tech-1', expect.any(String));
    expect(mockedInvitations.markUsed).toHaveBeenCalledWith('inv-1');
    expect(result.user.role).toBe('TECHNICIAN');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('hashes the token before lookup - never queries with the raw value', async () => {
    mockedInvitations.findByHash.mockResolvedValue(null);
    const rawToken = 'some-raw-token';

    await expect(
      invitationService.accept(rawToken, 'NewPassw0rd', { ipAddress: null }),
    ).rejects.toBeDefined();

    expect(mockedInvitations.findByHash).toHaveBeenCalledWith(hashOpaqueToken(rawToken));
  });
});
