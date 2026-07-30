import { SearchJourneyEntity, isActiveStatus } from './search-journey.types';

export interface SearchJourneyDto {
  id: string;
  status: string;
  isActive: boolean;
  startedAt: Date;
  closedAt: Date | null;
}

export function toSearchJourneyDto(entity: SearchJourneyEntity): SearchJourneyDto {
  return {
    id: entity.id,
    status: entity.status,
    isActive: isActiveStatus(entity.status),
    startedAt: entity.startedAt,
    closedAt: entity.closedAt,
  };
}
