import { Building, Company, Project, ProjectMedia, Unit } from '@prisma/client';
import { DEFAULT_VISIT_SLOTS } from './discovery.types';

export type DiscoveryProjectEntity = Project & {
  company: Pick<Company, 'name' | 'status'>;
  media: ProjectMedia[];
  buildings: (Building & { units: Unit[] })[];
};

export interface DiscoveryGalleryImage {
  url: string;
  isPlaceholder: boolean;
}

export interface DiscoveryAvailableUnit {
  id: string;
  number: string;
  type: string;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
}

// Task 6 (decisions.md G6): public-safe - never includes companyId,
// managerId, primaryContractorId, source, externalId, or any internal id.
export interface DiscoveryProjectSummaryDto {
  id: string;
  name: string;
  city: string;
  district: string | null;
  description: string | null;
  readiness: string | null;
  amenities: string[];
  developerName: string;
  coverImageUrl: string | null;
  gallery: DiscoveryGalleryImage[];
  priceFrom: number | null;
  priceTo: number | null;
  unitTypes: string[];
  unitsAvailableCount: number;
  isSaved: boolean;
  // Task 6 (decisions.md G2): a previously-saved project can stop being
  // discoverable (unpublished, deactivated, archived, company suspended) -
  // the favorites view must say so honestly rather than silently vanish or
  // pretend it's still bookable.
  isCurrentlyDiscoverable: boolean;
  createdAt: Date;
}

export interface DiscoveryProjectDetailDto extends DiscoveryProjectSummaryDto {
  availableUnits: DiscoveryAvailableUnit[];
  visitSlots: string[];
}

export function isProjectDiscoverable(project: { status: string; isActive: boolean; company: { status: string } }): boolean {
  return project.status === 'ACTIVE' && project.isActive && project.company.status === 'ACTIVE';
}

function flattenUnits(project: DiscoveryProjectEntity): Unit[] {
  return project.buildings.flatMap((b) => b.units);
}

function computePriceRange(units: Unit[]): { priceFrom: number | null; priceTo: number | null } {
  const prices = units.map((u) => u.price).filter((p): p is number => p != null);
  if (prices.length === 0) return { priceFrom: null, priceTo: null };
  return { priceFrom: Math.min(...prices), priceTo: Math.max(...prices) };
}

function computeGallery(project: DiscoveryProjectEntity): DiscoveryGalleryImage[] {
  const media = project.media.map((m) => ({ url: m.url, isPlaceholder: m.isPlaceholder }));
  // Task 4's real cover upload counts as genuine (non-placeholder) photography.
  return project.coverImageUrl ? [{ url: project.coverImageUrl, isPlaceholder: false }, ...media] : media;
}

export function toDiscoveryProjectSummaryDto(project: DiscoveryProjectEntity, isSaved: boolean): DiscoveryProjectSummaryDto {
  const units = flattenUnits(project);
  const { priceFrom, priceTo } = computePriceRange(units);

  return {
    id: project.id,
    name: project.name,
    city: project.city,
    district: project.district,
    description: project.description,
    readiness: project.readiness,
    amenities: project.amenities,
    developerName: project.company.name,
    coverImageUrl: project.coverImageUrl,
    gallery: computeGallery(project),
    priceFrom,
    priceTo,
    unitTypes: Array.from(new Set(units.map((u) => u.type))).sort(),
    unitsAvailableCount: units.filter((u) => u.status === 'AVAILABLE').length,
    isSaved,
    isCurrentlyDiscoverable: isProjectDiscoverable(project),
    createdAt: project.createdAt,
  };
}

export function toDiscoveryProjectDetailDto(project: DiscoveryProjectEntity, isSaved: boolean): DiscoveryProjectDetailDto {
  const units = flattenUnits(project);
  return {
    ...toDiscoveryProjectSummaryDto(project, isSaved),
    availableUnits: units
      .filter((u) => u.status === 'AVAILABLE')
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        number: u.number,
        type: u.type,
        area: u.area,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        price: u.price,
      })),
    visitSlots: DEFAULT_VISIT_SLOTS,
  };
}
