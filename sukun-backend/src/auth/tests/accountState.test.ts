import { resolveAccountState } from '../accountState';
import { homeownerRepository } from '../../homeowners/homeowner.repository';

jest.mock('../../homeowners/homeowner.repository');

const mockedHomeowners = homeownerRepository as jest.Mocked<typeof homeownerRepository>;

describe('resolveAccountState', () => {
  it('resolves HOME_SEEKER with no activation to homeowner_prospect', async () => {
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue(null);

    const result = await resolveAccountState({ id: 'u1', role: 'HOME_SEEKER' as never });

    expect(result).toEqual({ frontendRole: 'homeowner_prospect', landingRoute: '/discover' });
  });

  it('resolves HOME_SEEKER with a live PENDING activation to homeowner_pending', async () => {
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const result = await resolveAccountState({ id: 'u1', role: 'HOME_SEEKER' as never });

    expect(result).toEqual({ frontendRole: 'homeowner_pending', landingRoute: '/activate' });
  });

  it('resolves HOME_SEEKER with an expired PENDING activation to homeowner_prospect (edge case: expired activation)', async () => {
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    const result = await resolveAccountState({ id: 'u1', role: 'HOME_SEEKER' as never });

    expect(result.frontendRole).toBe('homeowner_prospect');
  });

  it('resolves HOME_SEEKER whose most recent row is ACTIVATED (an earlier unit, role never promoted - inconsistent data) to prospect, not pending', async () => {
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      status: 'ACTIVATED',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const result = await resolveAccountState({ id: 'u1', role: 'HOME_SEEKER' as never });

    expect(result.frontendRole).toBe('homeowner_prospect');
  });

  it('uses only the most recent of multiple historical activation rows', async () => {
    // findLatestActivationByUserId itself is responsible for ordering desc -
    // this test just confirms the resolver trusts whatever it returns
    // without re-deriving "most recent" itself.
    mockedHomeowners.findLatestActivationByUserId.mockResolvedValue({
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    await resolveAccountState({ id: 'u1', role: 'HOME_SEEKER' as never });

    expect(mockedHomeowners.findLatestActivationByUserId).toHaveBeenCalledWith('u1');
    expect(mockedHomeowners.findLatestActivationByUserId).toHaveBeenCalledTimes(1);
  });

  it('resolves HOMEOWNER to homeowner_active without querying HomeownerActivation at all', async () => {
    const result = await resolveAccountState({ id: 'u2', role: 'HOMEOWNER' as never });

    expect(result).toEqual({ frontendRole: 'homeowner_active', landingRoute: '/home' });
    expect(mockedHomeowners.findLatestActivationByUserId).not.toHaveBeenCalled();
  });

  it('resolves TECHNICIAN / PROJECT_MANAGER / COMPANY directly, no lookup needed', async () => {
    await expect(resolveAccountState({ id: 'u3', role: 'TECHNICIAN' as never })).resolves.toEqual({
      frontendRole: 'technician',
      landingRoute: '/technician/tasks',
    });
    await expect(
      resolveAccountState({ id: 'u4', role: 'PROJECT_MANAGER' as never }),
    ).resolves.toEqual({ frontendRole: 'pm', landingRoute: '/pm' });
    await expect(resolveAccountState({ id: 'u5', role: 'COMPANY' as never })).resolves.toEqual({
      frontendRole: 'company',
      landingRoute: '/company',
    });
  });
});
