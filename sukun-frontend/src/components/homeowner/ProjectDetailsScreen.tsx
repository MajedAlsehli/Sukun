"use client";

/**
 * H4 · تفاصيل المشروع (Project Details) — ported from `Sakn Project Details.dc.html`
 * (Downloads/Sakn.d.zip). Reached from H3 Discovery's "عرض المشروع"/"احجز
 * زيارة" actions (`/discovery/{id}`). No `/discovery/*` endpoint exists
 * (04_Known_Issues.md) — demo-only, same as H3.
 *
 * The source file hardcodes one literal project ("تلال الياسمين") with no
 * per-id variant anywhere in its own markup/state — there is no second
 * "Project Details" export to port a variant from. Basic identity fields
 * (name/dev/city/district/price/beds/area/match) are looked up from the
 * same shared fixture H3 uses (`lib/demo/discoveryFixtures.ts`) by the id in
 * the URL, so a project opened from Discovery shows *its own* name/price/
 * match — matching the same "keyed lookup, default to the first entry"
 * precedent already used for RE3's `buildData()`. Every other section
 * (gallery, developer bio, timeline, amenities, unit models, FAQ, compare
 * table) has no per-project source data anywhere and stays the file's own
 * literal content, applied to whichever project is open.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { HomeownerNav } from "@/components/nav/HomeownerNav";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { HOMEOWNER_PROSPECT_OR_ACTIVE } from "@/lib/auth/roles";
import {
  findProject, ranked, loadPrefs, money, markViewed, loadActivity,
  toggleFav as toggleFavStore, addBooking, type DemoBooking,
} from "@/lib/demo/discoveryFixtures";
import { DEMO_MODE } from "@/lib/demo/config";
import { useDiscoveryProject, useDiscoveryProjects, useSavedProjects } from "@/lib/hooks/useDiscovery";
import { useBookVisit } from "@/lib/hooks/useVisits";
import { MISSING_VALUE } from "@/lib/adapters/discovery";
import { toArabicIndic } from "@/lib/numeral";
import { useInViewport, useIsMobile } from "@/lib/hooks/useViewport";
import { SCREEN_PATHS as PATHS } from "@/lib/nav/routes";

/**
 * The section tab row. Twelve tabs is a desktop row; on a 390px phone it was a
 * scroller nobody reaches the end of, and it sat directly under the header, so
 * two bands of chrome pushed the photograph off the first screen.
 *
 * `essential` marks the five a buyer actually navigates by — what it looks
 * like, where it is, what is for sale, and how to book — and only those five
 * render below `md`. THE SECTIONS THEMSELVES ARE UNTOUCHED: all twelve are
 * still on the page, in the same order, and still reached by scrolling, by a
 * `#sec-` deep link and by every in-page button that targets them (the
 * overview's "لماذا رُشّح لي؟", the sticky bar's "قارن"). Nothing is removed
 * from the page — only the tab row is shortened, which is the pattern the
 * brief's own reference apps use. Desktop renders all twelve, unchanged.
 */
const NAV_SECTIONS: { id: string; label: string; essential?: true }[] = [
  { id: "overview", label: "نظرة عامة", essential: true },
  { id: "gallery", label: "المعرض", essential: true },
  { id: "snapshot", label: "لمحة" },
  { id: "why", label: "لماذا رُشّح" },
  { id: "report", label: "تقرير المستشار" },
  { id: "location", label: "الموقع", essential: true },
  { id: "developer", label: "المطوّر" },
  { id: "timeline", label: "الجدول" },
  { id: "units", label: "الوحدات", essential: true },
  { id: "compare", label: "المقارنة" },
  { id: "book", label: "الحجز", essential: true },
  { id: "faq", label: "الأسئلة" },
];

/* ---------------------------------------------------------------------------
   DEMO MODE FIXTURES.

   Everything in this block is EDITORIAL content that belongs to the approved
   prototype and to the Showcase. None of it is a fact the Backend can confirm
   about a real project, so in real mode none of it is rendered: the section,
   the card and the layout stay exactly as approved, and the unknown value is
   replaced by an honest Arabic "unavailable" line inside that same shell.

   The production audit found each of these presented as a fact about a real
   project: a 4.7/5 developer rating, 18 years of experience, 42 completed
   projects, 7 under development, 96% on-time delivery, a hard-coded
   construction progress bar, "points to watch", generated A/B/C unit models,
   project-specific FAQ answers and gallery captions naming rooms nobody
   verified. `/api/discovery/projects/{id}` carries none of them.
   --------------------------------------------------------------------------- */
const AMENITIES = ["مسبح", "صالة رياضية", "أمن 24/7", "حدائق", "مواقف", "قرب الخدمات"];
const GALLERY = ["الواجهة الخارجية", "المدخل الداخلي", "غرفة المعيشة", "المطبخ", "غرفة النوم الرئيسية", "المرافق والحديقة", "المخطط", "تقدّم الإنشاء"];
const TIMELINE = [["التعاقد", true], ["الحفر والأساسات", true], ["الهيكل الإنشائي", true], ["التشطيبات", false], ["التسليم", false]] as const;
/** The construction stages, with no completion claim — used in real mode. */
const TIMELINE_STAGES = TIMELINE.map(([title]) => title);
const DEV = {
  mark: "أوج", name: "شركة أوج للتطوير العقاري", rating: "4.7 / 5",
  desc: "مطوّر سعودي رائد متخصص في المجتمعات السكنية الراقية منذ 2007، بسجلّ تسليم في الموعد وجودة إنشائية موثّقة.",
  stats: [["18", "سنة خبرة"], ["42", "مشروع مكتمل"], ["7", "مشاريع قيد التطوير"], ["96%", "تسليم في الموعد"]],
};
const FAQ = [
  ["هل السعر شامل التشطيب؟", "نعم، جميع الوحدات تُسلّم بتشطيب كامل حسب المواصفات المعلنة."],
  ["هل يمكن التمويل البنكي؟", "المشروع معتمد لدى كبرى جهات التمويل العقاري في المملكة."],
  ["متى موعد التسليم المتوقع؟", "وفق الجدول الزمني المعلن في قسم «جدول الإنجاز» أعلاه."],
];

/** Real mode: the honest, in-shell "the developer has not published this" line. */
function UnavailableNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px dashed var(--n-border-strong)",
        borderRadius: "var(--r-lg)",
        padding: "18px 20px",
        fontSize: 13,
        color: "var(--t-tertiary)",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

const section: React.CSSProperties = { padding: "44px 0 0" };
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };
const h2: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: "6px 0 16px" };
const kicker: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--a-700)" };

export function ProjectDetailsScreen({ projectId }: { projectId: string }) {
  return (
    <RouteGuard allow={HOMEOWNER_PROSPECT_OR_ACTIVE}>
      <ProjectDetailsScreenInner projectId={projectId} />
    </RouteGuard>
  );
}

function ProjectDetailsScreenInner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const prefs = loadPrefs();

  /**
   * Task 2 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   `lib/demo/discoveryFixtures.ts`, looked up by the numeric
   *                    id in the URL, exactly as before. No Backend call.
   *   DEMO_MODE=false  `GET /api/discovery/projects/{id}` — a real UUID, real
   *                    cover/gallery media, real available units and the
   *                    Backend's own visit slots. A project that is not
   *                    discoverable 404s (existence is hidden, not 403'd) and
   *                    is rendered as "not found", never as a fixture.
   *
   * Everything the Backend has no field for — the developer biography, the
   * construction timeline, the amenities copy, the FAQ — is this screen's own
   * approved editorial content and stays exactly where it is.
   */
  const detail = useDiscoveryProject(projectId, prefs);
  const list = useDiscoveryProjects(prefs, loadActivity());
  const saved = useSavedProjects(loadActivity(), () => {});
  const booking = useBookVisit();

  const proj = detail.project;
  const r = proj;

  const [activity, setActivity] = useState(loadActivity);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [compareWith, setCompareWith] = useState(0);
  const [bkDay, setBkDay] = useState<number | null>(null);
  const [bkTime, setBkTime] = useState<string | null>(null);
  /**
   * The chosen unit. A fixture MODEL letter in Demo Mode; a real unit NUMBER in
   * real mode, so it is a plain string rather than the old "A" | "B" | "C".
   */
  const [bkUnit, setBkUnit] = useState<string>(DEMO_MODE ? "B" : "");
  const [bkDone, setBkDone] = useState<DemoBooking | null>(null);

  useEffect(() => {
    // The local "recently viewed" record is keyed by the fixture's numeric id
    // and has no Backend equivalent, so it stays a Demo Mode concern.
    if (DEMO_MODE) {
      markViewed(Number(projectId));
      setActivity(loadActivity());
    }
    if (window.location.hash === "#sec-book") {
      setTimeout(() => document.getElementById("sec-book")?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [projectId]);

  const isFav = proj ? saved.isSaved(proj) : false;
  const alt = list.projects.find((p) => p.id !== projectId) ?? list.projects[1];

  /**
   * The booking calendar.
   *
   * The approved interaction is fixed: a seven-day strip whose first three days
   * are unavailable (a lead-time rule), then a slot grid, then a unit. What
   * changes in real mode is only the DATA behind it — real upcoming dates
   * instead of a hard-coded July window, and the Backend's own `visitSlots`
   * instead of a hard-coded slot list. The Backend refuses any date before the
   * start of today, so the same three-day lead time keeps every offered day
   * genuinely bookable.
   */
  const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const AR_DOW = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
  const days = DEMO_MODE
    ? Array.from({ length: 7 }, (_, i) => ({ n: 24 + i, dow: AR_DOW[(i + 4) % 7], disabled: i < 3, month: "يوليو", iso: "" }))
    : Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return {
          n: d.getDate(),
          dow: AR_DOW[d.getDay()],
          disabled: i < 3,
          month: AR_MONTHS[d.getMonth()],
          iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        };
      });

  /** "14:00" -> "02:00 م" — presentation only; the raw slot is what is sent. */
  function slotLabel(slot: string): string {
    const [hRaw, m] = slot.split(":");
    const h = Number(hRaw);
    const suffix = h < 12 ? "ص" : "م";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, "0")}:${m ?? "00"} ${suffix}`;
  }
  const times: readonly (readonly [string, boolean, string])[] = DEMO_MODE
    ? ([["10:00 ص", false, ""], ["11:30 ص", false, ""], ["01:00 م", false, ""], ["03:30 م", true, ""], ["05:00 م", false, ""]] as const)
    : (proj?.visitSlots ?? []).map((s) => [slotLabel(s), false, s] as const);

  /**
   * The unit models.
   *
   * Demo Mode keeps the approved three-model A/B/C card set, derived from the
   * fixture. Real mode renders the project's ACTUAL available units and
   * nothing else — one card per real unit, labelled with its real unit number,
   * carrying its real area and its real price.
   *
   * It used to render three cards unconditionally and, when the Backend had
   * fewer than three units, invent the missing ones as `area + i*40` and
   * `price + i*200000`. Those are fabricated apartments with fabricated prices
   * on a real project's page.
   */
  const unitModels = DEMO_MODE
    ? (["A", "B", "C"] as const).map((label, i) => ({
        label,
        unitId: null as string | null,
        area: proj?.area != null ? proj.area + i * 40 : null,
        price: proj?.price != null ? proj.price + i * 200000 : null,
        image: proj && proj.gallery.length ? proj.gallery[i % proj.gallery.length] : "",
      }))
    : (proj?.availableUnits ?? []).map((real, i) => ({
        label: real.number ?? `${i + 1}`,
        unitId: real.id,
        area: real.area ?? null,
        price: real.price ?? null,
        image: proj && proj.gallery.length ? proj.gallery[i % proj.gallery.length] : "",
      }));
  /**
   * The recommendation line under the match circle. Demo Mode keeps its
   * authored sentence; real mode states the size of the pool it actually
   * ranked, and says nothing at all about a pool it does not know.
   */
  const discoverableCount = list.total || list.projects.length;
  const recommendationLine = DEMO_MODE
    ? "من بين 128 مشروعاً، هذا هو الأقرب لملفّك."
    : discoverableCount > 1
      ? `من بين ${toArabicIndic(discoverableCount)} مشروعاً متاحاً، هذا هو الأقرب لملفّك.`
      : "هذا المشروع هو الأقرب لتفضيلاتك المسجّلة.";

  /** Real mode has one other discoverable project to compare against, or none. */
  const comparableProjects = list.projects.filter((p) => p.id !== projectId);
  const canCompare = DEMO_MODE || comparableProjects.length > 0;

  const selectedUnit = unitModels.find((u) => u.label === bkUnit) ?? unitModels[0];
  // Real mode: keep the selection pointed at a unit that actually exists.
  const effectiveUnitLabel = bkUnit || selectedUnit?.label || MISSING_VALUE;
  const selectedDay = days.find((d) => d.n === bkDay);
  const selectedSlot = times.find(([label]) => label === bkTime);
  const bookingReady = !!bkDay && !!bkTime && (DEMO_MODE || (!!selectedUnit?.unitId && !!selectedDay?.iso && !!selectedSlot?.[2]));

  /**
   * ─── One primary action at a time (mobile) ────────────────────────────────
   *
   * The same project carries three "احجز زيارة" affordances: the overview
   * card's pair of buttons, the booking section itself, and the sticky bottom
   * bar. On a phone all three were on screen at once, and the sticky bar
   * covered the booking form's time slots — the user could not reach the very
   * control the bar was pointing at.
   *
   * The sticky bar now exists only when its ORIGINAL action is off screen, and
   * never while the booking form is visible. Desktop is untouched: the bar
   * behaves exactly as approved there.
   */
  const isMobile = useIsMobile();
  const [overviewActionsRef, overviewActionsVisible] = useInViewport({ enabled: isMobile });
  // A generous top margin so the bar is already gone by the time the first
  // date/time control comes into view, not only once the section's top edge does.
  const [bookingSectionRef, bookingVisible] = useInViewport({ enabled: isMobile, rootMargin: "0px 0px 240px 0px" });
  const showStickyCta = !isMobile || (!overviewActionsVisible && !bookingVisible);

  async function confirmBooking() {
    if (!bkDay || !bkTime) return;
    if (DEMO_MODE) {
      const bookingId = `SKN-${24800 + activity.bookings.length * 7 + bkDay}`;
      const booking: DemoBooking = { id: Number(projectId), day: bkDay, slot: bkTime, bookingId };
      setActivity(addBooking(booking));
      setBkDone(booking);
      return;
    }
    // Real `POST /api/visits`. The unit is a REAL available unit id from the
    // detail response, never a client-invented one, and the date/time are the
    // real ISO date and the Backend's own slot string.
    if (!proj || !selectedUnit?.unitId || !selectedDay?.iso || !selectedSlot?.[2]) return;
    const visitId = await booking.book({
      projectId: proj.id,
      unitId: selectedUnit.unitId,
      date: selectedDay.iso,
      time: selectedSlot[2],
    });
    // Only a real, accepted booking produces the confirmation panel.
    if (visitId) setBkDone({ id: Number(projectId) || 0, day: bkDay, slot: bkTime, bookingId: visitId });
  }

  /**
   * A project that is still loading, or that the Backend refused to disclose,
   * has nothing to render. Never a fixture in its place. Recorded for Task 3,
   * which owns this screen's real-mode empty/error design.
   */
  if (!proj || !r) {
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "11px 26px", borderBottom: "1px solid var(--n-border)" }}>
          <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer" }}>← العودة</button>
          <SukunLogo size={40} />
        </header>
      </div>
    );
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 130 }}>
      {/* HEADER — on a phone this is back · compact logo · favourite, and
          nothing else (globals.css §9 trims the padding to match).

          It used to carry a fourth control, "احجز زيارة", which cost the band
          most of its height while duplicating a button the page already shows
          twice on mobile: the overview's own pair, and the fixed bottom CTA
          that appears the moment those scroll away (`showStickyCta`). Booking
          is not made harder to reach — it is reachable in the same two places
          it already was, and the photograph starts higher up the screen.

          Desktop keeps all four controls and its 40px logo, unchanged. */}
      <header data-sk-compact-header style={{ position: "sticky", top: 0, zIndex: 70, display: "flex", alignItems: "center", gap: 16, padding: "11px 26px", background: "rgba(246,239,232,.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--n-border)" }}>
        <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} aria-label="العودة" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer" }}>
          <span aria-hidden="true">←</span>
          <span className="sk-only-desktop">العودة</span>
        </button>
        <span className="sk-only-desktop" style={{ display: "flex" }}><SukunLogo size={40} /></span>
        <span className="sk-only-mobile" style={{ display: "flex" }}><SukunLogo size={26} /></span>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 10 }}>
          <button onClick={() => void saved.toggle(proj)} aria-label="حفظ" aria-pressed={isFav} style={{ width: 40, height: 40, border: `1px solid ${isFav ? "var(--err)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: isFav ? "var(--err-bg)" : "var(--n-surface)", color: isFav ? "var(--err)" : "var(--t-secondary)", cursor: "pointer" }}>♥</button>
          <button className="sk-only-desktop" onClick={() => document.getElementById("sec-book")?.scrollIntoView({ behavior: "smooth" })} style={{ fontSize: 14, fontWeight: 600, padding: "10px 20px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>احجز زيارة</button>
        </div>
      </header>

      {/* The section tab row. It already scrolled horizontally, but with no
          snap, no scroll padding and no way to tell there was more — on an
          iPhone the last tab ("تقرير المستشار") simply looked cut off at the
          edge. `data-sk-scroll-row` makes it a deliberate, snapping scroller on
          mobile; the desktop row is unchanged because every tab fits there. */}
      <nav data-sk-detail-tabs data-sk-scroll-row style={{ position: "sticky", top: 63, zIndex: 60, display: "flex", gap: 2, padding: "0 22px", background: "rgba(252,248,242,.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--n-border)", overflowX: "auto", whiteSpace: "nowrap" }}>
        {NAV_SECTIONS.map((s) => (
          <button
            key={s.id}
            className={s.essential ? undefined : "sk-only-desktop"}
            onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: "smooth" })}
            style={{ flex: "none", fontSize: 13.5, fontWeight: 500, padding: "14px 14px", border: "none", background: "none", color: "var(--t-secondary)", cursor: "pointer" }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 26px" }}>
        {/* The badge states that this screen has no server data. True in Demo
            Mode, false once `/api/discovery/*` is wired — so it renders only
            where it is accurate. */}
        {DEMO_MODE && <div style={{ margin: "16px 0" }}><PendingBackendBadge note="لا يوجد /discovery/* في الخادم — بيانات هذه الشاشة محلية." /></div>}

        <section id="sec-overview" style={{ padding: "10px 0 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 24, alignItems: "stretch" }}>
            <div style={{ position: "relative", borderRadius: "var(--r-2xl)", overflow: "hidden", minHeight: 340, boxShadow: "var(--sh-3)", background: `url(${proj.img}) center/cover` }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(var(--g-900-rgb), .05) 40%,rgba(var(--g-900-rgb), .72))" }} />
              <div style={{ position: "absolute", insetInlineStart: 22, bottom: 22, insetInlineEnd: 22, color: "var(--t-on-dark)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--a-300)", marginBottom: 6 }}>{proj.type} · {proj.city}</div>
                <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{proj.name}</h1>
                <div style={{ fontSize: 14, color: "rgba(var(--t-on-dark-rgb), .85)", marginTop: 8 }}>{proj.district}، {proj.city}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ flex: 1, background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: 26, color: "var(--t-on-dark)", boxShadow: "var(--sh-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 84, height: 84, borderRadius: "50%", background: "rgba(243,236,226,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, flex: "none" }}>{r.match}%</div>
                  {/* "من بين 128 مشروعاً" was a literal. 128 is not a number
                      this product knows: the real pool is whatever
                      `GET /api/discovery/projects` returned. */}
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-300)", marginBottom: 5 }}>توصية سكن الذكية</div><p style={{ fontSize: 13.5, color: "var(--t-on-dark-soft)", margin: 0 }}>{recommendationLine}</p></div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(243,236,226,.13)" }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>يبدأ من</div><div style={{ fontWeight: 700, fontSize: 17 }}>{r.priceLabel}</div></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المطوّر</div><div style={{ fontWeight: 600, fontSize: 14 }}>{proj.dev}</div></div>
                </div>
              </div>
              <div ref={overviewActionsRef} style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                <button onClick={() => document.getElementById("sec-book")?.scrollIntoView({ behavior: "smooth" })} style={{ fontSize: 14.5, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>احجز زيارة</button>
                <button onClick={() => document.getElementById("sec-why")?.scrollIntoView({ behavior: "smooth" })} style={{ fontSize: 14.5, fontWeight: 600, padding: 14, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", cursor: "pointer" }}>لماذا رُشّح لي؟</button>
              </div>
            </div>
          </div>
        </section>

        <section id="sec-gallery" style={section}>
          <div style={kicker}>المعرض</div><h2 style={h2}>تجوّل في المشروع</h2>
          {/* Demo Mode keeps its eight captioned tiles. Real mode renders the
              project's ACTUAL photos and captions none of them: the tiles used
              to be labelled "المطبخ", "المخطط", "تقدّم الإنشاء" … regardless of
              what the photo showed, which states as fact what each real image
              depicts. Same grid, same tile size, same treatment. */}
          {DEMO_MODE ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {GALLERY.map((label, i) => (
                <div key={label} style={{ height: 100, borderRadius: "var(--r-md)", background: `linear-gradient(180deg,rgba(var(--g-900-rgb),0) 45%,rgba(var(--g-900-rgb),.72)), url(${proj.gallery[i % proj.gallery.length]}) center/cover`, position: "relative", display: "flex", alignItems: "flex-end", padding: 10, color: "var(--t-on-dark)", fontSize: 11.5, fontWeight: 600, opacity: 1 - i * 0.03 }}>{label}</div>
              ))}
            </div>
          ) : proj.gallery.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {proj.gallery.map((url, i) => (
                <div key={`${url}-${i}`} style={{ height: 100, borderRadius: "var(--r-md)", background: `url(${url}) center/cover`, border: "1px solid var(--n-border)" }} />
              ))}
            </div>
          ) : (
            <UnavailableNote>لم يُنشر معرض صور لهذا المشروع بعد.</UnavailableNote>
          )}
        </section>

        <section id="sec-snapshot" style={section}>
          <div style={kicker}>لمحة سريعة</div><h2 style={h2}>المعلومات التي تهمّك</h2>
          {/* The project's own one-line positioning, when it has one. Rendered
              only if present: the six original fixtures carry none, and the
              Backend's list DTO has no per-project description at all, so an
              always-on paragraph would need a sentence invented to fill it. */}
          {(proj.desc ?? proj.description) && (
            <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.8, margin: "0 0 18px", maxWidth: 720 }}>
              {/* `desc` is the Demo Mode fixture field; `description` is the
                  REAL detail DTO's own column, which the Backend has always
                  returned and nothing rendered. Same sentence either way. */}
              {proj.desc ?? proj.description}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[["المساحة", proj.area == null ? MISSING_VALUE : `${proj.area} م²`], ["الغرف", `${proj.beds ?? MISSING_VALUE} غرف · ${proj.baths ?? MISSING_VALUE} دورات`], ["الجاهزية", proj.avail], ["السعر", r.priceLabel]].map(([label, value]) => (
              <div key={label} style={{ ...card, padding: 20 }}><div style={{ fontSize: 12, color: "var(--t-tertiary)" }}>{label}</div><div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{value}</div></div>
            ))}
          </div>
        </section>

        <section id="sec-why" style={section}>
          <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: 32, color: "var(--t-on-dark)", boxShadow: "var(--sh-3)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--a-300)", marginBottom: 8 }}>لماذا رشّحنا هذا المشروع؟</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>مبني على ملفّك واحتياجك، لا على العموميات</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {r.reasons.map((reason, i) => (
                <div key={i} style={{ display: "flex", gap: 12, background: "rgba(243,236,226,.05)", border: "1px solid rgba(243,236,226,.1)", borderRadius: "var(--r-lg)", padding: 16 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--a-500)", color: "var(--t-on-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>✓</span>
                  <div style={{ fontSize: 13.5 }}>{reason}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="sec-report" style={section}>
          <div style={{ borderRadius: "var(--r-2xl)", overflow: "hidden", boxShadow: "var(--sh-2)", border: "1px solid var(--n-border)" }}>
            <div style={{ background: "var(--g-800)", color: "var(--t-on-dark)", padding: "22px 28px" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>تحليل مستشار سكن</div>
              {/* The confidence percentage was `78 + matched*4`, a number no
                  model produced. Real mode says what this report actually is. */}
              <div style={{ fontSize: 12.5, color: "var(--t-on-dark-soft)" }}>
                {DEMO_MODE
                  ? `تقرير موضوعي · مستوى الثقة ${Math.min(96, 78 + r.matched.length * 4)}%`
                  : "تقرير مبني على تفضيلاتك المسجّلة وبيانات المشروع المنشورة."}
              </div>
            </div>
            <div style={{ background: "var(--n-surface)", padding: 28 }}>
              <div style={{ display: "flex", gap: 14, background: "var(--ok-bg)", border: "1px solid rgba(47,158,106,.25)", borderRadius: "var(--r-lg)", padding: "18px 20px", marginBottom: 22 }}>
                <span style={{ fontWeight: 700, color: "var(--ok-strong)" }}>✓</span>
                <div><div style={{ fontSize: 15, fontWeight: 700, color: "var(--ok-strong)" }}>التوصية العامة: يستحق الزيارة</div><p style={{ fontSize: 13.5, color: "var(--t-secondary)", margin: "5px 0 0" }}>يتطابق هذا المشروع مع {r.match}% من احتياجاتك المسجّلة.</p></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--g-700)", marginBottom: 12 }}>نقاط القوة</div>
                  {r.reasons.slice(0, 3).map((s, i) => <div key={i} style={{ fontSize: 13, color: "var(--t-secondary)", marginBottom: 8 }}>✓ {s}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--warn)", marginBottom: 12 }}>نقاط للانتباه</div>
                  {/* Two hard-coded claims — "السعر أعلى من متوسط الحي" and
                      "بعض الوحدات تحت الإنشاء" — were shown for every project.
                      Neither is derivable from anything the Backend sends. */}
                  {DEMO_MODE ? (
                    <>
                      <div style={{ fontSize: 13, color: "var(--t-secondary)", marginBottom: 8 }}>+ قد يكون السعر أعلى قليلاً من متوسط الحي</div>
                      <div style={{ fontSize: 13, color: "var(--t-secondary)" }}>+ بعض الوحدات تحت الإنشاء</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--t-tertiary)", lineHeight: 1.7 }}>
                      لا تتوفّر ملاحظات منشورة عن هذا المشروع. تحقّق منها بنفسك أثناء الزيارة الميدانية.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="sec-location" style={section}>
          <div style={kicker}>الموقع</div><h2 style={h2}>حيّ متكامل الخدمات</h2>
          <div style={{ height: 220, borderRadius: "var(--r-xl)", border: "1px solid var(--n-border)", background: "linear-gradient(135deg,var(--g-100),var(--n-surface2))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--g-700)" }}>{proj.district}، {proj.city}</div>
        </section>

        <section id="sec-developer" style={section}>
          <div style={kicker}>عن المطوّر</div><h2 style={h2}>من يقف خلف المشروع</h2>
          <div style={{ ...card, borderRadius: "var(--r-2xl)", padding: 28 }}>
            {/* Same card, same two-column composition. What changes in real
                mode is that the rating (4.7/5), the biography, and the four
                statistics (18 years, 42 completed, 7 in development, 96%
                on-time) are not rendered as facts about a real developer —
                `/api/discovery/projects/{id}` carries a developer NAME and
                nothing else. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 26 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                  <span style={{ width: 60, height: 60, borderRadius: "var(--r-lg)", background: "var(--g-900)", color: "var(--a-300)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, flex: "none" }}>
                    {DEMO_MODE ? DEV.mark : (proj.dev || "—").trim().charAt(0)}
                  </span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{proj.dev || MISSING_VALUE}</div>
                    {DEMO_MODE && <div style={{ fontSize: 13, color: "var(--g-700)", fontWeight: 600, marginTop: 4 }}>★ {DEV.rating} · مطوّر معتمد</div>}
                  </div>
                </div>
                {DEMO_MODE && <p style={{ fontSize: 14, color: "var(--t-secondary)", lineHeight: 1.75 }}>{DEV.desc}</p>}
              </div>
              {DEMO_MODE ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                  {DEV.stats.map(([value, label]) => (
                    <div key={label} style={{ background: "var(--n-bg)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: 16 }}><div style={{ fontSize: 22, fontWeight: 700, color: "var(--g-700)" }}>{value}</div><div style={{ fontSize: 12.5, color: "var(--t-tertiary)" }}>{label}</div></div>
                  ))}
                </div>
              ) : (
                <UnavailableNote>
                  لم يُنشر ملف تعريفي لهذا المطوّر بعد — لا يتوفّر تقييم ولا سجلّ مشاريع ولا نسبة التزام بالمواعيد.
                </UnavailableNote>
              )}
            </div>
          </div>
        </section>

        <section id="sec-timeline" style={section}>
          <div style={kicker}>جدول الإنجاز</div><h2 style={h2}>أين وصل المشروع الآن</h2>
          {/* The three completed ticks were hard-coded, so every real project
              claimed "structure done, finishing pending" whatever its actual
              state. The Backend publishes a readiness STATE, not per-stage
              progress, so real mode shows the stages unmarked and states the
              readiness it does know. Same card, same row of five stages. */}
          <div style={{ ...card, padding: "26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {(DEMO_MODE ? TIMELINE.map(([t, d]) => [t, d] as const) : TIMELINE_STAGES.map((t) => [t, false] as const)).map(([title, done]) => (
                <div key={title} style={{ flex: 1, textAlign: "center" }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: done ? "var(--g-600)" : "var(--n-surface2)", color: done ? "var(--t-on-dark)" : "var(--t-tertiary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : ""}</span>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{title}</div>
                </div>
              ))}
            </div>
            {!DEMO_MODE && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--n-border)", fontSize: 13, color: "var(--t-tertiary)", lineHeight: 1.7 }}>
                لم يُنشر تفصيل مراحل الإنجاز لهذا المشروع. الحالة المعلنة حالياً: <b style={{ color: "var(--t-secondary)" }}>{proj.avail}</b>.
              </div>
            )}
          </div>
        </section>

        <section id="sec-units" style={section}>
          <div style={kicker}>الوحدات</div><h2 style={h2}>اختر النموذج الأنسب لعائلتك</h2>
          {unitModels.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {unitModels.map((u) => (
                <div key={u.label} onClick={() => setBkUnit(u.label)} style={{ ...card, border: `2px solid ${bkUnit === u.label ? "var(--g-500)" : "var(--n-border)"}`, overflow: "hidden", cursor: "pointer" }}>
                  <div style={{ height: 110, background: `url(${u.image}) center/cover` }} />
                  <div style={{ padding: 18 }}>
                    {/* Real mode labels the card with the unit's REAL number. */}
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{DEMO_MODE ? `نموذج ${u.label}` : `الوحدة ${u.label}`}</div>
                    <div style={{ fontSize: 13, color: "var(--t-tertiary)" }}>المساحة</div><div style={{ fontWeight: 600, marginBottom: 8 }}>{u.area == null ? MISSING_VALUE : `${u.area} م²`}</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: "var(--g-700)" }}>{u.price == null ? MISSING_VALUE : money(u.price)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <UnavailableNote>لا توجد وحدات متاحة للحجز في هذا المشروع حالياً.</UnavailableNote>
          )}
        </section>

        <section id="sec-compare" style={section}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div><div style={kicker}>المقارنة</div><h2 style={{ ...h2, margin: "6px 0 0" }}>قارن قبل أن تقرّر</h2></div>
            {/* The selector rendered with zero options when the tenant has one
                discoverable project, and the table then showed a blank column
                with "0%" compatibility for a project that does not exist. */}
            {canCompare && (
              <select value={compareWith} onChange={(e) => setCompareWith(Number(e.target.value))} style={{ padding: "8px 12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)" }}>
                {comparableProjects.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
              </select>
            )}
          </div>
          {canCompare && alt ? (
            <div style={{ ...card, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr style={{ background: "var(--n-surface2)" }}><th style={{ textAlign: "right", padding: 14 }}>المعيار</th><th style={{ textAlign: "right", padding: 14, background: "var(--g-50)" }}>{proj.name}</th><th style={{ textAlign: "right", padding: 14 }}>{alt.name}</th></tr></thead>
                <tbody>
                  {[["السعر", r.priceLabel, alt.priceLabel ?? MISSING_VALUE], ["المساحة", proj.area == null ? MISSING_VALUE : `${proj.area}م²`, alt.area == null ? MISSING_VALUE : `${alt.area}م²`], ["الغرف", String(proj.beds ?? MISSING_VALUE), String(alt.beds ?? MISSING_VALUE)], ["التوافق", `${r.match}%`, `${alt.match}%`]].map(([label, a, b]) => (
                    <tr key={label as string} style={{ borderTop: "1px solid var(--n-border)" }}><td style={{ padding: 14, color: "var(--t-secondary)" }}>{label}</td><td style={{ padding: 14, fontWeight: 700, background: "var(--g-50)" }}>{a}</td><td style={{ padding: 14 }}>{b}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <UnavailableNote>لا يوجد مشروع آخر متاح للمقارنة حالياً.</UnavailableNote>
          )}
        </section>

        <section id="sec-book" ref={bookingSectionRef} style={section}>
          <div style={kicker}>الحجز</div><h2 style={h2}>احجز زيارة معاينة</h2>
          {bkDone ? (
            <div style={{ ...card, borderRadius: "var(--r-2xl)", padding: 36, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
              <div style={{ width: 70, height: 70, margin: "0 auto 18px", borderRadius: "50%", background: "var(--ok)", color: "var(--t-on-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>✓</div>
              <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>تم تأكيد زيارتك</h3>
              <p style={{ fontSize: 14, color: "var(--t-secondary)", margin: "10px 0 20px" }}>سنرسل لك تذكيراً قبل الموعد. نتطلّع للقائك في {proj.name}.</p>
              <div style={{ background: "var(--n-bg)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: 18, textAlign: "right" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px dashed var(--n-border-strong)", marginBottom: 10 }}><span style={{ fontSize: 13, color: "var(--t-tertiary)" }}>رقم الحجز</span><span style={{ fontWeight: 700, color: "var(--g-700)" }}>{bkDone.bookingId}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--t-tertiary)" }}>الموعد</span><span style={{ fontWeight: 600 }}>{bkDone.day} {selectedDay?.month ?? ""} · {bkDone.slot}</span></div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button onClick={() => router.push(DEMO_MODE ? SCREEN_PATHS.H3_Discovery : PATHS.H5_VisitExperience(bkDone.bookingId))} style={{ flex: 1, fontSize: 14.5, fontWeight: 600, padding: 13, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>عرض زياراتي</button>
                <button onClick={() => setBkDone(null)} style={{ flex: 1, fontSize: 14.5, fontWeight: 600, padding: 13, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer" }}>تعديل الحجز</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
              <div style={{ ...card, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>1 · اختر اليوم</div>
                <div data-sk-scroll-row style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {days.map((d) => (
                    <button key={d.iso || d.n} disabled={d.disabled} onClick={() => setBkDay(d.n)} style={{ flex: "none", width: 66, padding: "10px 0", border: `1.5px solid ${bkDay === d.n ? "var(--g-900)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: bkDay === d.n ? "var(--g-900)" : "var(--n-surface)", color: bkDay === d.n ? "var(--t-on-dark)" : d.disabled ? "var(--t-tertiary)" : "var(--t-primary)", opacity: d.disabled ? 0.4 : 1, cursor: d.disabled ? "not-allowed" : "pointer" }}>
                      <div style={{ fontSize: 11 }}>{d.dow}</div><div style={{ fontSize: 17, fontWeight: 700 }}>{d.n}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, margin: "20px 0 12px" }}>2 · اختر الوقت</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {times.map(([label, full]) => (
                    <button key={label} disabled={full} onClick={() => setBkTime(label)} style={{ padding: 12, border: `1.5px solid ${bkTime === label ? "var(--g-900)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: bkTime === label ? "var(--g-900)" : full ? "var(--n-surface2)" : "var(--n-surface)", color: bkTime === label ? "var(--t-on-dark)" : full ? "var(--t-tertiary)" : "var(--t-primary)", fontSize: 13.5, fontWeight: 600, cursor: full ? "not-allowed" : "pointer" }}>
                      {label}{full && <span style={{ display: "block", fontSize: 10 }}>مكتمل</span>}
                    </button>
                  ))}
                </div>
                {/* STEP 3 — a real chooser.
                    This was a read-only line ("3 · الوحدة المختارة: A102"). The
                    only way to actually pick a unit was to scroll back UP to
                    `sec-units`, which the booking flow never tells you to do —
                    and on a phone "احجز زيارة" scrolls you straight PAST it. So
                    steps 1 and 2 were interactive, step 3 looked like a step but
                    could not be operated, and the flow dead-ended there.
                    The units are the same `unitModels` the cards above render
                    and share the same `bkUnit` state, so choosing in either
                    place updates the other. */}
                <div style={{ fontWeight: 700, fontSize: 15, margin: "20px 0 12px" }}>3 · اختر الوحدة</div>
                {unitModels.length > 0 ? (
                  <div data-sk-scroll-row style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                    {unitModels.map((u) => {
                      const active = effectiveUnitLabel === u.label;
                      return (
                        <button
                          key={u.label}
                          onClick={() => setBkUnit(u.label)}
                          aria-pressed={active}
                          style={{
                            flex: "none",
                            minWidth: 132,
                            textAlign: "start",
                            padding: "12px 14px",
                            border: `1.5px solid ${active ? "var(--g-900)" : "var(--n-border-strong)"}`,
                            borderRadius: "var(--r-md)",
                            background: active ? "var(--g-900)" : "var(--n-surface)",
                            color: active ? "var(--t-on-dark)" : "var(--t-primary)",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{DEMO_MODE ? `نموذج ${u.label}` : `الوحدة ${u.label}`}</div>
                          <div style={{ fontSize: 12, marginTop: 4, color: active ? "var(--t-on-dark-soft)" : "var(--t-tertiary)" }}>
                            {u.area == null ? MISSING_VALUE : `${u.area} م²`}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, color: active ? "var(--a-300)" : "var(--g-700)" }}>
                            {u.price == null ? MISSING_VALUE : money(u.price)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <UnavailableNote>لا توجد وحدات متاحة للحجز في هذا المشروع حالياً.</UnavailableNote>
                )}
              </div>
              <div style={{ ...card, padding: 22 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>ملخّص الزيارة</div>
                <div style={{ fontSize: 13.5, marginBottom: 6 }}>المشروع: <b>{proj.name}</b></div>
                <div style={{ fontSize: 13.5, marginBottom: 6 }}>التاريخ: <b>{bkDay ? `${bkDay} ${selectedDay?.month ?? ""}` : "—"}</b></div>
                <div style={{ fontSize: 13.5, marginBottom: 6 }}>الوقت: <b>{bkTime ?? "—"}</b></div>
                {/* The summary confirmed project, date and time but not the
                    unit — the one field the booking actually sends. */}
                <div style={{ fontSize: 13.5, marginBottom: 14 }}>الوحدة: <b>{effectiveUnitLabel}</b></div>
                <button disabled={!bookingReady || booking.booking} onClick={() => void confirmBooking()} style={{ width: "100%", fontSize: 15, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: bookingReady ? "pointer" : "not-allowed", opacity: bookingReady ? 1 : 0.5 }}>تأكيد الحجز</button>
              </div>
            </div>
          )}
        </section>

        <section id="sec-faq" style={section}>
          <div style={kicker}>الأسئلة الشائعة</div><h2 style={h2}>أسئلة عن هذا المشروع تحديداً</h2>
          {/* The section heading promises answers "عن هذا المشروع تحديداً",
              and the three answers asserted full finishing, bank-financing
              approval and a published delivery schedule — for any project.
              None of it comes from the Backend. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 820 }}>
            {DEMO_MODE ? (
              FAQ.map(([q, a], i) => (
                <div key={q} style={{ ...card, overflow: "hidden" }}>
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "16px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "right", fontSize: 14.5, fontWeight: 600 }}>{q}<span>{faqOpen === i ? "−" : "+"}</span></button>
                  {faqOpen === i && <div style={{ padding: "0 18px 18px", fontSize: 13.5, color: "var(--t-secondary)" }}>{a}</div>}
                </div>
              ))
            ) : (
              <UnavailableNote>لم يُنشر المطوّر أسئلة شائعة خاصة بهذا المشروع بعد.</UnavailableNote>
            )}
          </div>
        </section>
      </div>

      {/* The sticky project CTA. `data-sk-cta-bar` lifts it above the bottom
          nav on a phone (it used to sit underneath it, with the session badge
          on top of both). `BottomStack` measures this bar and publishes its
          real height, so the document reserves exactly enough bottom padding
          for it and the bar covers no content. */}
      {showStickyCta && (
      <div data-sk-cta-bar style={{ position: "fixed", bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 65, display: "flex", alignItems: "center", gap: 14, padding: "12px 26px calc(12px + env(safe-area-inset-bottom,0px))", background: "rgba(252,248,242,.94)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--n-border)", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{proj.name}</div><div style={{ fontSize: 12, color: "var(--t-tertiary)" }}>{r.priceLabel} · توافق {r.match}%</div></div>
        <div style={{ display: "flex", gap: 10, maxWidth: 380, width: "100%" }}>
          <button onClick={() => document.getElementById("sec-compare")?.scrollIntoView({ behavior: "smooth" })} style={{ flex: 1, fontSize: 14, fontWeight: 600, padding: 14, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", cursor: "pointer" }}>قارن</button>
          <button onClick={() => document.getElementById("sec-book")?.scrollIntoView({ behavior: "smooth" })} style={{ flex: 1.4, fontSize: 15, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>احجز زيارة</button>
        </div>
      </div>
      )}
      <HomeownerNav showDesktop={false} />
    </div>
  );
}
