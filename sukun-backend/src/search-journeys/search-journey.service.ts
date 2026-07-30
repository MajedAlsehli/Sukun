import { searchJourneyRepository } from './search-journey.repository';
import { toSearchJourneyDto } from './search-journey.mapper';
import { assertValidTransition, isActiveStatus, SearchJourneyStatus } from './search-journey.types';
import { BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';

interface RequestContext {
  ipAddress: string | null;
}

export const searchJourneyService = {
  // GET /api/search-journey - "Returns Current Active Journey"
  async getActive(userId: string) {
    const journey = await searchJourneyRepository.findActiveByUserId(userId);
    return journey ? toSearchJourneyDto(journey) : null;
  },

  // SEA-004: historical journeys remain visible forever.
  async getHistory(userId: string) {
    const journeys = await searchJourneyRepository.findAllByUserId(userId);
    return journeys.map(toSearchJourneyDto);
  },

  // API_Specification.md: POST auto-closes any existing active journey first.
  // Also covers SEA-005/SEA-006: a Homeowner starting a new search reuses the
  // same account, this never creates another User row.
  async startNew(userId: string, ctx: RequestContext) {
    const { previous, created } = await searchJourneyRepository.closeActiveAndCreateNew(userId);

    if (previous) {
      await writeAuditLog({
        userId,
        action: 'SEARCH_JOURNEY_CLOSED',
        entity: 'SearchJourney',
        entityId: previous.id,
        ipAddress: ctx.ipAddress,
        metadata: { reason: 'superseded_by_new_journey' },
      });
    }

    await writeAuditLog({
      userId,
      action: 'SEARCH_JOURNEY_CREATED',
      entity: 'SearchJourney',
      entityId: created.id,
      ipAddress: ctx.ipAddress,
    });

    return toSearchJourneyDto(created);
  },

  // SEA-003: closed journeys become read-only - cancelling one twice is rejected.
  async cancel(userId: string, journeyId: string, reason: string | undefined, ctx: RequestContext) {
    const journey = await searchJourneyRepository.findByIdForUser(journeyId, userId);
    if (!journey) {
      throw new NotFoundError('Search journey not found', 'SEARCH_JOURNEY_NOT_FOUND');
    }
    if (!isActiveStatus(journey.status)) {
      throw new BusinessError('Search journey is already closed', 'JOURNEY_ALREADY_CLOSED');
    }

    const updated = await searchJourneyRepository.updateStatus(
      journeyId,
      SearchJourneyStatus.CANCELLED,
      new Date(),
    );

    await writeAuditLog({
      userId,
      action: 'SEARCH_JOURNEY_CANCELLED',
      entity: 'SearchJourney',
      entityId: journeyId,
      ipAddress: ctx.ipAddress,
      metadata: reason ? { reason } : undefined,
    });

    return toSearchJourneyDto(updated);
  },

  // Internal - not exposed over HTTP yet. Future modules (Visits/Inspection/
  // AI Gateway/Homeowner Activation) call this to advance a journey's stage
  // as their own workflows complete. Search Journey stays the sole owner of
  // its own state (01_System_Architecture.md #10 State Ownership) even though
  // the trigger originates in another module.
  async advanceStatus(journeyId: string, next: SearchJourneyStatus, ctx: RequestContext) {
    const journey = await searchJourneyRepository.findById(journeyId);
    if (!journey) {
      throw new NotFoundError('Search journey not found', 'SEARCH_JOURNEY_NOT_FOUND');
    }

    assertValidTransition(journey.status, next);

    const closedAt = next === SearchJourneyStatus.CLOSED ? new Date() : null;
    const updated = await searchJourneyRepository.updateStatus(journeyId, next, closedAt);

    await writeAuditLog({
      userId: journey.userId,
      action: 'SEARCH_JOURNEY_STATUS_ADVANCED',
      entity: 'SearchJourney',
      entityId: journeyId,
      ipAddress: ctx.ipAddress,
      metadata: { from: journey.status, to: next },
    });

    return toSearchJourneyDto(updated);
  },
};
