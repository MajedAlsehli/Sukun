/**
 * Discovery: Backend DTO -> the view model the FROZEN H3/H4 screens already read.
 *
 *   DiscoveryProjectSummaryDto        (lib/backend/discovery.ts)
 *     -> DiscoveryProjectViewModel    (this file)
 *     -> unchanged DiscoveryScreen / ProjectDetailsScreen
 *
 * The view model is deliberately shaped like `lib/demo/discoveryFixtures.ts`'s
 * `RankedProject`, because that is what the approved screens render. Every
 * difference between the Backend's shape and that shape is absorbed HERE, never
 * by a component:
 *
 *  * **`id` is a string.** Fixture ids are `1..6`; real ids are UUIDs. The view
 *    model normalizes both to `string`, and `toDemoProjectViewModel` stringifies
 *    the fixture id rather than the fixture being rewritten. The Demo Mode
 *    localStorage records stay keyed by their original numbers
 *    (`lib/demo/discoveryFixtures.ts` is untouched) — `lib/hooks/useDiscovery.ts`
 *    converts at that one boundary.
 *  * **Missing facts stay missing.** The Backend's list DTO carries no
 *    bedrooms/bathrooms/area (they live per-unit on the DETAIL response), and
 *    `priceFrom` is nullable. Those become `null` here and render as the
 *    existing "—" placeholder. Nothing is invented, averaged or defaulted to a
 *    plausible number.
 *  * **`grad` is styling, not data.** It is a decorative brand tint H5
 *    multiplies over the cover photo. Real projects have no per-project
 *    gradient, so they all get one constant brand value — a style default, not
 *    a fabricated project attribute.
 *
 * `match` / `matched` / `reasons` come from the user's OWN locally-stored
 * preferences via the fixtures module's `scoreOf`/`reasonsFor`. That is a
 * client-side preference-matching heuristic over whatever projects are on
 * screen — the Backend has no preferences endpoint at all — so it is not a
 * duplicated business calculation. Where the Backend's real recommendation IS
 * available, its own Arabic reasons replace the heuristic ones (see
 * `toRecommendationViewModel`).
 */

import type {
  DiscoveryProjectDetailDto,
  DiscoveryProjectSummaryDto,
  DiscoveryRecommendationsDto,
  RecommendationReasonCode,
} from "@/lib/backend/discovery";
import {
  money,
  reasonsFor,
  scoreOf,
  type DemoProject,
  type Preferences,
} from "@/lib/demo/discoveryFixtures";

/**
 * One decorative gradient for every real project. H5 multiplies it over the
 * cover photo as a brand tint; it carries no information about the project, so
 * a single constant is honest where a per-project value would be invented.
 */
export const DEFAULT_PROJECT_GRADIENT = "linear-gradient(150deg,#203d78,#0d1b34)";

/** The placeholder the frozen screens already use for an absent scalar. */
export const MISSING_VALUE = "—";

export interface DiscoveryProjectViewModel {
  id: string;
  name: string;
  dev: string;
  city: string;
  district: string;
  /** `null` when the Backend reported no priced unit. */
  price: number | null;
  priceLabel: string;
  /** `null` on the list DTO — bedroom/bathroom/area facts are per-unit, detail-only. */
  area: number | null;
  beds: number | null;
  baths: number | null;
  /** The readiness label the frozen filters compare against. */
  avail: string;
  type: string;
  /**
   * One-line positioning copy. Demo-only: the Backend's LIST DTO carries no
   * per-project description (its `description` is a detail-response field),
   * so this is `undefined` in real mode and the screen renders nothing rather
   * than inventing a sentence.
   */
  desc?: string;
  grad: string;
  /** `""` = no cover image. Never a stand-in photo. */
  img: string;
  gallery: string[];
  /** Monthly-instalment copy. Fixture-only; the Backend models no such figure. */
  emi: string;
  match: number;
  matched: string[];
  reasons: string[];
  /** Real Backend facts the fixtures have no equivalent for. */
  isSaved: boolean;
  isCurrentlyDiscoverable: boolean;
  unitsAvailableCount: number | null;
  amenities: string[];
  description: string | null;
}

export interface DiscoveryProjectDetailViewModel extends DiscoveryProjectViewModel {
  availableUnits: {
    id: string;
    number: string;
    type: string;
    area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    price: number | null;
  }[];
  visitSlots: string[];
}

/** `Project.readiness` -> the Arabic label H3's own filter and H4's snapshot render. */
export function readinessLabel(readiness: string | null): string {
  switch (readiness) {
    case "READY":
      return "جاهز";
    case "UNDER_CONSTRUCTION":
    case "OFF_PLAN":
      return "قريباً";
    default:
      return MISSING_VALUE;
  }
}

export function priceLabelOf(price: number | null): string {
  return price == null ? MISSING_VALUE : money(price);
}

/** Cover first, then real media. Placeholder media are kept but marked by the Backend. */
function galleryOf(dto: DiscoveryProjectSummaryDto): string[] {
  const urls = dto.gallery.map((g) => g.url).filter((u): u is string => !!u);
  if (urls.length > 0) return urls;
  return dto.coverImageUrl ? [dto.coverImageUrl] : [];
}

/**
 * The one DTO -> view-model function. `prefs` supplies the client-side
 * preference match; pass `null` to skip scoring entirely (match `0`, no
 * reasons), which is what a screen with no stored preferences must show rather
 * than a fabricated percentage.
 */
export function toProjectViewModel(
  dto: DiscoveryProjectSummaryDto,
  prefs: Preferences | null,
): DiscoveryProjectViewModel {
  const base: DiscoveryProjectViewModel = {
    id: dto.id,
    name: dto.name,
    dev: dto.developerName,
    city: dto.city,
    district: dto.district ?? "",
    price: dto.priceFrom,
    priceLabel: priceLabelOf(dto.priceFrom),
    area: null,
    beds: null,
    baths: null,
    avail: readinessLabel(dto.readiness),
    type: dto.unitTypes[0] ?? MISSING_VALUE,
    grad: DEFAULT_PROJECT_GRADIENT,
    img: dto.coverImageUrl ?? "",
    gallery: galleryOf(dto),
    emi: "",
    match: 0,
    matched: [],
    reasons: [],
    isSaved: dto.isSaved,
    isCurrentlyDiscoverable: dto.isCurrentlyDiscoverable,
    unitsAvailableCount: dto.unitsAvailableCount,
    amenities: dto.amenities,
    description: dto.description,
  };
  return prefs ? withPreferenceMatch(base, prefs) : base;
}

export function toProjectDetailViewModel(
  dto: DiscoveryProjectDetailDto,
  prefs: Preferences | null,
): DiscoveryProjectDetailViewModel {
  const summary = toProjectViewModel(dto, prefs);
  const units = dto.availableUnits;
  // The detail response DOES carry per-unit facts. Use the smallest available
  // unit's figures as the project's "from" facts, mirroring how `priceFrom`
  // already reads as a floor rather than an average — an average would be a
  // number the Backend never stated.
  const withArea = units.filter((u) => u.area != null);
  const smallest = withArea.length
    ? withArea.reduce((a, b) => ((a.area ?? 0) <= (b.area ?? 0) ? a : b))
    : units[0];

  return {
    ...summary,
    area: smallest?.area ?? null,
    beds: smallest?.bedrooms ?? null,
    baths: smallest?.bathrooms ?? null,
    type: smallest?.type ?? summary.type,
    availableUnits: units.map((u) => ({
      id: u.id,
      number: u.number,
      type: u.type,
      area: u.area,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      price: u.price,
    })),
    visitSlots: dto.visitSlots,
  };
}

/**
 * Applies the user's own stored preferences to a view model. Reuses the exact
 * `scoreOf`/`reasonsFor` the fixtures module already exports, so a real project
 * and a demo project are scored by ONE implementation, not two that can drift.
 *
 * `scoreOf` reads `p.id % 3` as a small deterministic tie-breaker; a UUID has no
 * numeric id, so real projects get a stable hash of the id in its place —
 * identical inputs always produce an identical score, and a fixture project's
 * score is bit-for-bit what it was before Task 2.
 */
export function withPreferenceMatch<T extends DiscoveryProjectViewModel>(
  project: T,
  prefs: Preferences,
): T {
  const scoreInput: DemoProject = {
    id: numericIdFor(project.id),
    name: project.name,
    dev: project.dev,
    city: project.city,
    district: project.district,
    price: project.price ?? Number.POSITIVE_INFINITY,
    area: project.area ?? 0,
    beds: project.beds ?? 0,
    baths: project.baths ?? 0,
    avail: project.avail === "جاهز" ? "جاهز" : "قريباً",
    type: project.type,
    grad: project.grad,
    img: project.img,
    gallery: project.gallery,
    emi: project.emi,
  };
  const { score, matched } = scoreOf(scoreInput, prefs);
  return {
    ...project,
    match: score,
    matched,
    reasons: reasonsFor(scoreInput, prefs),
  };
}

/**
 * A stable non-negative integer for any id. `Number("3")` for a fixture id, so
 * Demo Mode scoring is unchanged; a deterministic FNV-1a hash for a UUID.
 */
export function numericIdFor(id: string): number {
  const asNumber = Number(id);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

/** Fixture -> the same view model, so both modes feed one rendering path. */
export function toDemoProjectViewModel(
  project: DemoProject,
  prefs: Preferences,
): DiscoveryProjectViewModel {
  const { score, matched } = scoreOf(project, prefs);
  return {
    id: String(project.id),
    name: project.name,
    dev: project.dev,
    city: project.city,
    district: project.district,
    price: project.price,
    priceLabel: money(project.price),
    area: project.area,
    beds: project.beds,
    baths: project.baths,
    avail: project.avail,
    type: project.type,
    desc: project.desc,
    grad: project.grad,
    img: project.img,
    gallery: project.gallery,
    emi: project.emi,
    match: score,
    matched,
    reasons: reasonsFor(project, prefs),
    // Demo favourites live in localStorage, not on a server; the hook fills
    // this in from `DiscoveryActivity` so the rendering path stays identical.
    isSaved: false,
    isCurrentlyDiscoverable: true,
    unitsAvailableCount: null,
    amenities: [],
    description: null,
  };
}

/* ------------------------------------------------------------ recommendation */

export type RecommendationState = "available" | "unavailable";

export interface RecommendationViewModel {
  state: RecommendationState;
  /** Present only when `state === "unavailable"`. */
  reasonCode: RecommendationReasonCode | null;
  items: { project: DiscoveryProjectViewModel; reason: string }[];
}

/**
 * `available: false` is a 200 with a named reason, not an error. It is mapped
 * to an explicit `unavailable` state so the screen can say so honestly — never
 * to an empty list that reads as "no matches", and never to a fabricated pick.
 */
export function toRecommendationViewModel(
  dto: DiscoveryRecommendationsDto,
  prefs: Preferences | null,
): RecommendationViewModel {
  if (!dto.available) {
    return { state: "unavailable", reasonCode: dto.reason, items: [] };
  }
  return {
    state: "available",
    reasonCode: null,
    items: dto.items.map((item) => ({
      project: {
        ...toProjectViewModel(item.project, prefs),
        // The Backend's own Arabic reason for THIS pick replaces the local
        // heuristic's — it is the real recommendation's real justification.
        reasons: [item.reason],
      },
      reason: item.reason,
    })),
  };
}
