/**
 * Shared demo data/logic for H3 Discovery and H4 Project Details
 * (`Sakn Discovery.dc.html` / `Sakn Project Details.dc.html`, Downloads/Sakn.d.zip).
 * No `/discovery/*` endpoint exists anywhere in the backend (04_Known_Issues.md,
 * 07_Frontend_Status.md §4) — the whole browse→recommend→book journey is
 * demo-only, exactly like RE4/RE5. This module is the one place the 6-project
 * seed and the AI match-scoring logic live, ported verbatim from Discovery's
 * own `projects()`/`scoreOf`/`reasonsFor`, so H4 (which looks a project up by
 * id) computes the identical match% and reasons Discovery already showed —
 * not a second, possibly-divergent copy of the same business logic.
 */

export interface DemoProject {
  id: number;
  name: string;
  dev: string;
  city: string;
  district: string;
  price: number;
  area: number;
  beds: number;
  baths: number;
  avail: "جاهز" | "قريباً";
  type: string;
  grad: string;
  /** Cover photo — card thumbnails, hero backdrops, the visit header. */
  img: string;
  /** Gallery set for H4's المعرض strip; cycled if the strip asks for more. */
  gallery: string[];
  emi: string;
}

/**
 * `grad` values were re-derived from the SUKUN navy/gold ramp on 2026-07-28.
 * They had been carried over verbatim from the pre-rebrand green/bronze
 * export (`#173a31`, `#2f6153`, `#8d6841`, …) — hard-coded hexes that no
 * longer matched any token in `globals.css`, so every project card, hero and
 * thumbnail across H3/H4/H5 rendered in the retired palette. That was the
 * single biggest reason the app still read as off-brand.
 *
 * `img`/`gallery` (2026-07-28) point at real Riyadh residential photography
 * in `public/projects/`, matched to each project's own type and district
 * where the library allowed it (النرجس → Al-Narjis View, السدرة → ROSHN
 * SEDRA, apartments → apartment stock). Every screen that used to paint a
 * bare `grad` block now reads these, so a photo swap is a data edit here and
 * nowhere else. `grad` stays: H5 still multiplies it over the photo as the
 * header's brand tint.
 */
export const PROJECTS: DemoProject[] = [
  { id: 1, name: "واحة الياسمين", dev: "شركة معمار", city: "الرياض", district: "حي النرجس", price: 2400000, area: 420, beds: 5, baths: 4, avail: "جاهز", type: "فيلا", grad: "linear-gradient(150deg,#203d78,#0d1b34)", img: "/projects/p1-cover.jpg", gallery: ["/projects/p1-cover.jpg", "/projects/p1-g1.jpg", "/projects/p1-g2.jpg", "/projects/p1-g3.jpg"], emi: "8,900 ر.س" },
  { id: 2, name: "مساكن الرمال", dev: "دار السكن", city: "الرياض", district: "حي القيروان", price: 1850000, area: 320, beds: 4, baths: 3, avail: "جاهز", type: "شقة", grad: "linear-gradient(150deg,#3f516f,#152848)", img: "/projects/p2-cover.jpg", gallery: ["/projects/p2-cover.jpg", "/projects/p2-g1.jpg", "/projects/p2-g2.jpg", "/projects/p2-g3.jpg"], emi: "6,850 ر.س" },
  { id: 3, name: "أبراج النخيل", dev: "إعمار الوطن", city: "جدة", district: "حي الشاطئ", price: 3100000, area: 280, beds: 3, baths: 3, avail: "قريباً", type: "شقة", grad: "linear-gradient(150deg,#2b3f61,#0d1b34)", img: "/projects/p3-cover.jpg", gallery: ["/projects/p3-cover.jpg", "/projects/p3-g1.jpg", "/projects/p3-g2.jpg", "/projects/p3-g3.jpg"], emi: "11,500 ر.س" },
  { id: 4, name: "ضاحية الورود", dev: "شركة معمار", city: "الرياض", district: "حي الملقا", price: 2750000, area: 450, beds: 5, baths: 5, avail: "جاهز", type: "فيلا", grad: "linear-gradient(150deg,#7d582d,#152848)", img: "/projects/p4-cover.jpg", gallery: ["/projects/p4-cover.jpg", "/projects/p4-g1.jpg", "/projects/p4-g2.jpg", "/projects/p4-g3.jpg"], emi: "10,200 ر.س" },
  { id: 5, name: "مجمّع السدرة", dev: "دار السكن", city: "الدمام", district: "حي الفيصلية", price: 1450000, area: 240, beds: 3, baths: 2, avail: "جاهز", type: "شقة", grad: "linear-gradient(150deg,#9c6e39,#3d2c17)", img: "/projects/p5-cover.jpg", gallery: ["/projects/p5-cover.jpg", "/projects/p5-g1.jpg", "/projects/p5-g2.jpg", "/projects/p5-g3.jpg"], emi: "5,400 ر.س" },
  { id: 6, name: "فلل الروضة", dev: "إعمار الوطن", city: "جدة", district: "حي الروضة", price: 3600000, area: 520, beds: 6, baths: 5, avail: "قريباً", type: "فيلا", grad: "linear-gradient(150deg,#5b7bb0,#152848)", img: "/projects/p6-cover.jpg", gallery: ["/projects/p6-cover.jpg", "/projects/p6-g1.jpg", "/projects/p6-g2.jpg", "/projects/p6-g3.jpg"], emi: "13,400 ر.س" },
];

export function findProject(id: number): DemoProject {
  return PROJECTS.find((p) => p.id === id) ?? PROJECTS[0];
}

export function money(n: number): string {
  if (n >= 1000000) return `${Math.round((n / 1000000) * 10) / 10} مليون ر.س`;
  return `${Math.round(n / 1000)} ألف ر.س`;
}

export interface Preferences {
  pName: string;
  pCity: string;
  pFamily: number;
  pFinance: string;
  wBudget: number;
  wType: string;
  wBeds: number;
  wTimeline: string;
  wLifestyle: Record<string, boolean>;
  recReady: boolean;
}

export const DEFAULT_PREFS: Preferences = {
  pName: "",
  pCity: "",
  pFamily: 0,
  pFinance: "",
  wBudget: 2000000,
  wType: "",
  wBeds: 0,
  wTimeline: "",
  wLifestyle: {},
  recReady: false,
};

export function scoreOf(p: DemoProject, prefs: Preferences): { score: number; matched: string[] } {
  let sc = 44;
  const matched: string[] = [];
  if (prefs.pCity && p.city === prefs.pCity) { sc += 26; matched.push("city"); }
  if (prefs.wType && p.type === prefs.wType) { sc += 15; matched.push("type"); }
  if (p.price <= prefs.wBudget) { sc += 13; matched.push("budget"); } else if (p.price <= prefs.wBudget * 1.15) { sc += 6; }
  if (prefs.wBeds && p.beds >= prefs.wBeds) { sc += 12; matched.push("beds"); }
  if (prefs.pFamily && p.beds >= prefs.pFamily) { sc += 4; }
  return { score: Math.min(98, sc + (p.id % 3)), matched };
}

export function reasonsFor(p: DemoProject, prefs: Preferences): string[] {
  const r: string[] = [];
  if (prefs.pCity && p.city === prefs.pCity) r.push(`يقع في ${p.city} التي اخترتها`);
  if (p.price <= prefs.wBudget) r.push(`ضمن ميزانيتك (${money(prefs.wBudget)})`);
  if (prefs.wBeds && p.beds >= prefs.wBeds) r.push(`يوفّر ${p.beds} غرف تناسب عائلتك`);
  if (prefs.wType && p.type === prefs.wType) r.push(`من نوع ${prefs.wType} المفضّل لديك`);
  const life = Object.keys(prefs.wLifestyle).filter((k) => prefs.wLifestyle[k]);
  if (life.length) r.push(`يلبّي أولوياتك: ${life.slice(0, 2).join(" و")}`);
  if (r.length < 3) r.push("المطوّر ذو تقييم عالٍ في جودة التسليم");
  return r.slice(0, 4);
}

export interface RankedProject extends DemoProject {
  match: number;
  matched: string[];
  priceLabel: string;
  reasons: string[];
}

export function ranked(prefs: Preferences): RankedProject[] {
  return PROJECTS
    .map((p) => {
      const s = scoreOf(p, prefs);
      return { ...p, match: s.score, matched: s.matched, priceLabel: money(p.price), reasons: reasonsFor(p, prefs) };
    })
    .sort((a, b) => b.match - a.match);
}

export interface DemoBooking {
  id: number;
  day: number;
  slot: string;
  bookingId: string;
  /** Set once a real `POST /visits` call for this booking actually succeeded. */
  realVisitId?: string;
}

export interface DiscoveryActivity {
  viewed: number[];
  fav: Record<number, boolean>;
  bookings: DemoBooking[];
  notifRead: boolean;
}

const PREFS_KEY = "sakn_discovery_prefs";
const ACTIVITY_KEY = "sakn_discovery_activity";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadPrefs(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  return { ...DEFAULT_PREFS, ...safeParse(window.localStorage.getItem(PREFS_KEY), {}) };
}

export function savePrefs(prefs: Preferences): void {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadActivity(): DiscoveryActivity {
  const empty: DiscoveryActivity = { viewed: [], fav: {}, bookings: [], notifRead: false };
  if (typeof window === "undefined") return empty;
  return { ...empty, ...safeParse(window.localStorage.getItem(ACTIVITY_KEY), {}) };
}

export function saveActivity(activity: DiscoveryActivity): void {
  window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

export function markViewed(id: number): void {
  const a = loadActivity();
  if (!a.viewed.includes(id)) saveActivity({ ...a, viewed: [id, ...a.viewed] });
}

export function toggleFav(id: number): DiscoveryActivity {
  const a = loadActivity();
  const next = { ...a, fav: { ...a.fav, [id]: !a.fav[id] } };
  saveActivity(next);
  return next;
}

export function addBooking(booking: DemoBooking): DiscoveryActivity {
  const a = loadActivity();
  const next = { ...a, bookings: [...a.bookings, booking] };
  saveActivity(next);
  return next;
}

export function removeBooking(bookingId: string): DiscoveryActivity {
  const a = loadActivity();
  const next = { ...a, bookings: a.bookings.filter((b) => b.bookingId !== bookingId) };
  saveActivity(next);
  return next;
}
