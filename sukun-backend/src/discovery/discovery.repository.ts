import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { DISCOVERABLE_PROJECT_WHERE, PRICE_BAND_RANGES, PriceBand } from './discovery.types';
import { normalizeArabicSearch } from './search-normalize';

const DISCOVERY_INCLUDE = {
  company: { select: { name: true, status: true } },
  media: { orderBy: { sortOrder: 'asc' as const } },
  buildings: { include: { units: true } },
};

export interface DiscoveryListFilters {
  q?: string;
  city?: string;
  priceBand?: PriceBand;
  unitType?: string;
  readiness?: 'READY' | 'UNDER_CONSTRUCTION' | 'OFF_PLAN';
}

function buildWhere(filters: DiscoveryListFilters): Prisma.ProjectWhereInput {
  const { q, city, priceBand, unitType, readiness } = filters;

  const where: Prisma.ProjectWhereInput = { ...DISCOVERABLE_PROJECT_WHERE };

  if (city) where.city = { equals: city, mode: 'insensitive' };
  if (readiness) where.readiness = readiness;

  if (unitType) {
    where.buildings = { some: { units: { some: { type: unitType } } } };
  }

  if (priceBand) {
    const range = PRICE_BAND_RANGES[priceBand];
    where.buildings = {
      some: { units: { some: { price: range } } },
    };
  }

  // Task 6 (decisions.md G15): raw + digit/letter-normalized query OR'd together.
  if (q) {
    const normalized = normalizeArabicSearch(q);
    const terms = Array.from(new Set([q, normalized]));
    where.OR = terms.flatMap((term) => [
      { name: { contains: term, mode: 'insensitive' as const } },
      { city: { contains: term, mode: 'insensitive' as const } },
      { district: { contains: term, mode: 'insensitive' as const } },
    ]);
  }

  return where;
}

export const discoveryRepository = {
  async findMany(filters: DiscoveryListFilters, page: number, pageSize: number) {
    const where = buildWhere(filters);
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: DISCOVERY_INCLUDE,
      }),
      prisma.project.count({ where }),
    ]);
    return { items, total };
  },

  findDiscoverableById(id: string) {
    return prisma.project.findFirst({
      where: { id, ...DISCOVERABLE_PROJECT_WHERE },
      include: DISCOVERY_INCLUDE,
    });
  },

  // Task 6 (decisions.md G13): bounded candidate pool for recommendations -
  // bounds token cost, and the model is only ever shown projects it's
  // allowed to recommend.
  findRecentDiscoverable(limit: number) {
    return prisma.project.findMany({
      where: DISCOVERABLE_PROJECT_WHERE,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: DISCOVERY_INCLUDE,
    });
  },

  findSavedProjectIds(userId: string, projectIds: string[]) {
    return prisma.savedProject.findMany({
      where: { userId, projectId: { in: projectIds } },
      select: { projectId: true },
    });
  },

  findOneSaved(userId: string, projectId: string) {
    return prisma.savedProject.findUnique({ where: { userId_projectId: { userId, projectId } } });
  },

  // Idempotent by construction (decisions.md G6): upsert on the unique
  // (userId, projectId) pair - a second save is a no-op, not a duplicate row.
  saveProject(userId: string, projectId: string) {
    return prisma.savedProject.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId },
      update: {},
    });
  },

  // Idempotent/stable-response by construction: deleteMany never throws when
  // no row matches, so unsaving an already-unsaved project is a stable no-op.
  async unsaveProject(userId: string, projectId: string): Promise<void> {
    await prisma.savedProject.deleteMany({ where: { userId, projectId } });
  },

  async findSavedByUser(userId: string, page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      prisma.savedProject.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { project: { include: DISCOVERY_INCLUDE } },
      }),
      prisma.savedProject.count({ where: { userId } }),
    ]);
    return { items: rows.map((r) => r.project), total };
  },
};
