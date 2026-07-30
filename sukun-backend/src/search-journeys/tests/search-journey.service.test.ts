import { searchJourneyService } from '../search-journey.service';
import { searchJourneyRepository } from '../search-journey.repository';
import { SearchJourneyStatus } from '../search-journey.types';

jest.mock('../search-journey.repository');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedRepo = searchJourneyRepository as jest.Mocked<typeof searchJourneyRepository>;

describe('searchJourneyService.startNew', () => {
  it('closes the previous active journey and creates a new one (SEA-002)', async () => {
    mockedRepo.closeActiveAndCreateNew.mockResolvedValue({
      previous: { id: 'old-journey' } as never,
      created: {
        id: 'new-journey',
        userId: 'user-1',
        status: SearchJourneyStatus.CREATED,
        startedAt: new Date(),
        closedAt: null,
      },
    });

    const result = await searchJourneyService.startNew('user-1', { ipAddress: null });

    expect(result.id).toBe('new-journey');
    expect(result.isActive).toBe(true);
  });
});

describe('searchJourneyService.cancel', () => {
  it('rejects cancelling a journey that does not belong to the user', async () => {
    mockedRepo.findByIdForUser.mockResolvedValue(null);

    await expect(
      searchJourneyService.cancel('user-1', 'journey-1', undefined, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'SEARCH_JOURNEY_NOT_FOUND' });
  });

  it('rejects cancelling an already-closed journey (SEA-003)', async () => {
    mockedRepo.findByIdForUser.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.CLOSED,
      startedAt: new Date(),
      closedAt: new Date(),
    });

    await expect(
      searchJourneyService.cancel('user-1', 'journey-1', undefined, { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'JOURNEY_ALREADY_CLOSED' });
  });

  it('cancels an active journey', async () => {
    mockedRepo.findByIdForUser.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.VISITING,
      startedAt: new Date(),
      closedAt: null,
    });
    mockedRepo.updateStatus.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.CANCELLED,
      startedAt: new Date(),
      closedAt: new Date(),
    });

    const result = await searchJourneyService.cancel('user-1', 'journey-1', 'changed my mind', {
      ipAddress: null,
    });

    expect(result.status).toBe('CANCELLED');
    expect(result.isActive).toBe(false);
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(
      'journey-1',
      SearchJourneyStatus.CANCELLED,
      expect.any(Date),
    );
  });
});

describe('searchJourneyService.advanceStatus', () => {
  it('rejects an invalid (non-forward) transition', async () => {
    // CREATED -> PURCHASED is valid (Task 011: external buyers can purchase
    // without ever visiting/inspecting via Sakn) - CLOSED is terminal, so
    // anything out of CLOSED is the genuinely invalid case here.
    mockedRepo.findById.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.CLOSED,
      startedAt: new Date(),
      closedAt: new Date(),
    });

    await expect(
      searchJourneyService.advanceStatus('journey-1', SearchJourneyStatus.PURCHASED, {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE_TRANSITION' });
  });

  it('allows a valid forward transition and sets closedAt when reaching CLOSED', async () => {
    mockedRepo.findById.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.PURCHASED,
      startedAt: new Date(),
      closedAt: null,
    });
    mockedRepo.updateStatus.mockResolvedValue({
      id: 'journey-1',
      userId: 'user-1',
      status: SearchJourneyStatus.CLOSED,
      startedAt: new Date(),
      closedAt: new Date(),
    });

    await searchJourneyService.advanceStatus('journey-1', SearchJourneyStatus.CLOSED, {
      ipAddress: null,
    });

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(
      'journey-1',
      SearchJourneyStatus.CLOSED,
      expect.any(Date),
    );
  });
});
