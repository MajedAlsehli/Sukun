import { Prisma } from '@prisma/client';

// Task 6 (decisions.md G2): the discoverability rule - reuses Task 4's
// isOperationallyActive concept (status=ACTIVE && isActive) plus an active-
// company check. No new isDiscoverable field - see decisions.md G2 for why.
export const DISCOVERABLE_PROJECT_WHERE: Prisma.ProjectWhereInput = {
  status: 'ACTIVE',
  isActive: true,
  company: { status: 'ACTIVE' },
};

export type PriceBand = 'UNDER_500K' | 'FROM_500K_TO_1M' | 'FROM_1M_TO_2M' | 'ABOVE_2M';

// Task 6 (decisions.md G5): bands filter against real Unit.price values via
// a relation-exists query - never a cached/stale min-max on Project.
export const PRICE_BAND_RANGES: Record<PriceBand, { gte?: number; lt?: number }> = {
  UNDER_500K: { lt: 500_000 },
  FROM_500K_TO_1M: { gte: 500_000, lt: 1_000_000 },
  FROM_1M_TO_2M: { gte: 1_000_000, lt: 2_000_000 },
  ABOVE_2M: { gte: 2_000_000 },
};

// Task 6 (decisions.md G8): a fixed, uniform scheduling rule - not
// fabricated per-project availability. See decisions.md G8.
export const DEFAULT_VISIT_SLOTS = ['10:00', '12:00', '14:00', '16:00', '18:00'];
