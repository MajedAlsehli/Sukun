// Pulls current market data from the Sakani.sa scraper API (via Parse.bot)
// and upserts it into the sakani_* tables. These endpoints only ever expose
// a small "popular" snapshot (get_popular_projects/get_popular_units cap out
// at 5 results regardless of `limit` - confirmed against the live API, not a
// bug here), so this is a periodic snapshot sync, not a paginated bulk import.
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../shared/logger';

interface SakaniProjectDto {
  project_id: string;
  project_name: string;
  project_code?: string;
  project_type?: string;
  city?: string;
  city_id?: number;
  region?: string;
  region_id?: number;
  location?: { lat?: number | null; lon?: number | null };
  min_price?: number;
  max_price?: number;
  marketplace_price?: number;
  available_units_count?: number;
  unit_types?: string[];
}

interface SakaniUnitDto {
  unit_id: number;
  unit_code?: string;
  unit_type?: string;
  unit_size?: number;
  living_area?: string;
  price?: number;
  moh_price?: number;
  bedroom_count?: number;
  bathroom_count?: number;
  floor?: number;
  apartment_number?: string | null;
  block_number?: string | null;
  building_number?: string | null;
  status?: string;
  target_segments?: string[];
  project?: { id: number; name?: string; project_type?: string; developer_name?: string };
  location?: { lat?: number | null; lon?: number | null };
}

interface SakaniPriceRangeDto {
  max_price?: number;
  max_rental_price?: number;
}

interface SyncFilters {
  cityId?: number;
  regionId?: number;
  projectType?: string;
  limit?: number;
}

function assertConfigured(): void {
  if (!env.sakani.apiKey) {
    throw new Error('PARSE_API_KEY is not set - add it to .env before running this sync');
  }
}

async function callSakani<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${env.sakani.baseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      'X-API-Key': env.sakani.apiKey,
      'API-Snapshot-Version': env.sakani.snapshotVersion,
    },
  });

  const body = (await res.json()) as { status?: string; data?: T };
  if (!res.ok || body.status !== 'success') {
    throw new Error(`Sakani API error on ${endpoint}: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.data as T;
}

function projectIdToInt(externalId: string): number {
  const numeric = externalId.replace(/^project_/, '');
  const parsed = parseInt(numeric, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse numeric id out of Sakani project_id "${externalId}"`);
  }
  return parsed;
}

async function syncProjects(filters: SyncFilters): Promise<number> {
  const data = await callSakani<{ projects: SakaniProjectDto[]; total: number }>('get_popular_projects', {
    limit: filters.limit ?? 50,
    city_id: filters.cityId,
    region_id: filters.regionId,
    project_type: filters.projectType,
  });

  for (const p of data.projects) {
    const id = projectIdToInt(p.project_id);
    await prisma.sakaniProject.upsert({
      where: { id },
      create: {
        id,
        externalId: p.project_id,
        projectCode: p.project_code,
        name: p.project_name,
        projectType: p.project_type,
        city: p.city,
        cityId: p.city_id,
        region: p.region,
        regionId: p.region_id,
        lat: p.location?.lat ?? undefined,
        lon: p.location?.lon ?? undefined,
        minPrice: p.min_price,
        maxPrice: p.max_price,
        marketplacePrice: p.marketplace_price,
        availableUnitsCount: p.available_units_count,
        unitTypes: p.unit_types ?? [],
        raw: p as object,
      },
      update: {
        externalId: p.project_id,
        projectCode: p.project_code,
        name: p.project_name,
        projectType: p.project_type,
        city: p.city,
        cityId: p.city_id,
        region: p.region,
        regionId: p.region_id,
        lat: p.location?.lat ?? undefined,
        lon: p.location?.lon ?? undefined,
        minPrice: p.min_price,
        maxPrice: p.max_price,
        marketplacePrice: p.marketplace_price,
        availableUnitsCount: p.available_units_count,
        unitTypes: p.unit_types ?? [],
        raw: p as object,
      },
    });
  }

  return data.projects.length;
}

// get_popular_units references projects (via its nested `project` object)
// that aren't necessarily in the same run's get_popular_projects top-5 - the
// two lists aren't guaranteed to overlap. Upsert a minimal stub so the FK
// always resolves, touching only fields the unit payload actually carries so
// a fuller record from syncProjects (price/city/etc.) is never clobbered.
async function upsertProjectStub(project: { id: number; name?: string; project_type?: string; developer_name?: string }): Promise<void> {
  await prisma.sakaniProject.upsert({
    where: { id: project.id },
    create: {
      id: project.id,
      externalId: `project_${project.id}`,
      name: project.name ?? `project_${project.id}`,
      projectType: project.project_type,
      developerName: project.developer_name,
      unitTypes: [],
      raw: project as object,
    },
    update: {
      name: project.name,
      projectType: project.project_type,
      developerName: project.developer_name,
    },
  });
}

async function syncUnits(filters: SyncFilters): Promise<number> {
  const data = await callSakani<{ units: SakaniUnitDto[]; total: number }>('get_popular_units', {
    limit: filters.limit ?? 50,
    city_id: filters.cityId,
    region_id: filters.regionId,
    project_type: filters.projectType,
  });

  for (const u of data.units) {
    if (u.project) await upsertProjectStub(u.project);

    const livingArea = u.living_area !== undefined ? parseFloat(u.living_area) : undefined;
    await prisma.sakaniUnit.upsert({
      where: { id: u.unit_id },
      create: {
        id: u.unit_id,
        unitCode: u.unit_code,
        unitType: u.unit_type,
        unitSize: u.unit_size,
        livingArea: Number.isNaN(livingArea) ? undefined : livingArea,
        price: u.price,
        mohPrice: u.moh_price,
        bedroomCount: u.bedroom_count,
        bathroomCount: u.bathroom_count,
        floor: u.floor,
        apartmentNumber: u.apartment_number,
        blockNumber: u.block_number,
        buildingNumber: u.building_number,
        status: u.status,
        targetSegments: u.target_segments ?? [],
        projectId: u.project?.id,
        lat: u.location?.lat ?? undefined,
        lon: u.location?.lon ?? undefined,
        raw: u as object,
      },
      update: {
        unitCode: u.unit_code,
        unitType: u.unit_type,
        unitSize: u.unit_size,
        livingArea: Number.isNaN(livingArea) ? undefined : livingArea,
        price: u.price,
        mohPrice: u.moh_price,
        bedroomCount: u.bedroom_count,
        bathroomCount: u.bathroom_count,
        floor: u.floor,
        apartmentNumber: u.apartment_number,
        blockNumber: u.block_number,
        buildingNumber: u.building_number,
        status: u.status,
        targetSegments: u.target_segments ?? [],
        projectId: u.project?.id,
        lat: u.location?.lat ?? undefined,
        lon: u.location?.lon ?? undefined,
        raw: u as object,
      },
    });
  }

  return data.units.length;
}

async function syncPriceRange(filters: SyncFilters): Promise<number> {
  const data = await callSakani<SakaniPriceRangeDto>('get_price_ranges', {
    city_id: filters.cityId,
    region_id: filters.regionId,
    project_type: filters.projectType,
  });

  const existing = await prisma.sakaniPriceRange.findFirst({
    where: {
      cityId: filters.cityId ?? null,
      regionId: filters.regionId ?? null,
      projectType: filters.projectType ?? null,
    },
  });

  if (existing) {
    await prisma.sakaniPriceRange.update({
      where: { id: existing.id },
      data: {
        maxPrice: data.max_price,
        maxRentalPrice: data.max_rental_price,
        fetchedAt: new Date(),
      },
    });
  } else {
    await prisma.sakaniPriceRange.create({
      data: {
        cityId: filters.cityId,
        regionId: filters.regionId,
        projectType: filters.projectType,
        maxPrice: data.max_price,
        maxRentalPrice: data.max_rental_price,
      },
    });
  }

  return 1;
}

async function main(): Promise<void> {
  assertConfigured();

  // No CLI-arg parsing here on purpose: re-run with different env vars
  // (SAKANI_CITY_ID etc.) per filter combo you want snapshotted.
  const filters: SyncFilters = {
    cityId: process.env.SAKANI_CITY_ID ? parseInt(process.env.SAKANI_CITY_ID, 10) : undefined,
    regionId: process.env.SAKANI_REGION_ID ? parseInt(process.env.SAKANI_REGION_ID, 10) : undefined,
    projectType: process.env.SAKANI_PROJECT_TYPE,
    limit: process.env.SAKANI_LIMIT ? parseInt(process.env.SAKANI_LIMIT, 10) : undefined,
  };

  const startedAt = new Date();
  const version = await callSakani<{ version: string }>('get_version_info', {});

  const projectCount = await syncProjects(filters);
  const unitCount = await syncUnits(filters);
  await syncPriceRange(filters);

  await prisma.sakaniSyncLog.create({
    data: {
      version: version.version,
      endpoint: 'get_popular_projects+get_popular_units+get_price_ranges',
      recordCount: projectCount + unitCount,
      startedAt,
      finishedAt: new Date(),
    },
  });

  logger.info('Sakani sync complete', {
    version: version.version,
    filters,
    projectCount,
    unitCount,
  });
}

main()
  .catch((err) => {
    logger.error('Sakani sync failed', { error: err instanceof Error ? err.message : err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
