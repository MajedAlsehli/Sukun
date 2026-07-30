import { SearchJourney, SearchJourneyStatus } from '@prisma/client';
import { BusinessError } from '../shared/errors';

export type SearchJourneyEntity = SearchJourney;
export { SearchJourneyStatus };

// 11_State_Machines.md #SEARCH JOURNEY - forward-only progression, plus a
// cancel exit available from any non-terminal stage.
//
// Revised in Task 006 (Visits): the diagram draws one straight line, but
// nothing in Business_Rules.md/Business_Flows.md makes AI recommendations a
// gate on booking a visit ("AI never auto-selects units... customer always
// makes the final decision" - Flow 2). A Home Seeker can browse Projects/Units
// and book directly. So VISITING is reachable from any earlier non-terminal
// stage, not only from RECOMMENDATIONS_GENERATED - still forward-only, just
// not forced through every intermediate stage.
//
// Revised again in Task 011 (Homeowner Activation): an external buyer can
// legitimately purchase without ever booking a Sakn-tracked visit or
// inspection (Flow 8: "Purchase occurs outside Sakn... Company manually
// updates ownership"), so PURCHASED must be reachable from any non-terminal
// stage, not only INSPECTING.
const FORWARD_TRANSITIONS: Record<SearchJourneyStatus, SearchJourneyStatus[]> = {
  CREATED: [
    SearchJourneyStatus.PREFERENCES_COMPLETED,
    SearchJourneyStatus.VISITING,
    SearchJourneyStatus.PURCHASED,
    SearchJourneyStatus.CANCELLED,
  ],
  PREFERENCES_COMPLETED: [
    SearchJourneyStatus.RECOMMENDATIONS_GENERATED,
    SearchJourneyStatus.VISITING,
    SearchJourneyStatus.PURCHASED,
    SearchJourneyStatus.CANCELLED,
  ],
  RECOMMENDATIONS_GENERATED: [
    SearchJourneyStatus.VISITING,
    SearchJourneyStatus.PURCHASED,
    SearchJourneyStatus.CANCELLED,
  ],
  VISITING: [
    SearchJourneyStatus.INSPECTING,
    SearchJourneyStatus.PURCHASED,
    SearchJourneyStatus.CANCELLED,
  ],
  INSPECTING: [SearchJourneyStatus.PURCHASED, SearchJourneyStatus.CANCELLED],
  PURCHASED: [SearchJourneyStatus.CLOSED],
  CLOSED: [],
  CANCELLED: [],
};

// Stages from which completing a purchase should trigger an advance to
// PURCHASED (then CLOSED). Already-terminal journeys are left alone.
export const PRE_PURCHASE_STATUSES: SearchJourneyStatus[] = [
  SearchJourneyStatus.CREATED,
  SearchJourneyStatus.PREFERENCES_COMPLETED,
  SearchJourneyStatus.RECOMMENDATIONS_GENERATED,
  SearchJourneyStatus.VISITING,
  SearchJourneyStatus.INSPECTING,
];

// Stages from which booking a visit should trigger an advance to VISITING.
// Already-VISITING-or-later journeys just book additional visits (VIS-007)
// without re-triggering a transition.
export const PRE_VISITING_STATUSES: SearchJourneyStatus[] = [
  SearchJourneyStatus.CREATED,
  SearchJourneyStatus.PREFERENCES_COMPLETED,
  SearchJourneyStatus.RECOMMENDATIONS_GENERATED,
];

// CLOSED/CANCELLED are terminal - SEA-003: closed journeys become read-only.
export const TERMINAL_STATUSES: SearchJourneyStatus[] = [
  SearchJourneyStatus.CLOSED,
  SearchJourneyStatus.CANCELLED,
];

export function isActiveStatus(status: SearchJourneyStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

// 11_State_Machines.md: "Invalid transitions must return BUSINESS_ERROR."
export function assertValidTransition(
  current: SearchJourneyStatus,
  next: SearchJourneyStatus,
): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw new BusinessError(
      `Cannot transition Search Journey from ${current} to ${next}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}
