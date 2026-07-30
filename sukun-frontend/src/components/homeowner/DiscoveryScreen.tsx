"use client";

/**
 * H3 · ابحث عن منزل (Discovery) — ported from `Sakn Discovery.dc.html`
 * (Downloads/Sakn.d.zip). No `/discovery/*` endpoint exists anywhere in the
 * backend (04_Known_Issues.md) — every screen below (onboarding wizard,
 * dashboard, AI recommendations, search/filter, favorites, notifications,
 * advisor chat) is demo-only local state, same category as RE4/RE5.
 *
 * The source file's own inline "details"/"booking"/"success" states are
 * NOT ported here — `Sakn Project Details.dc.html` is a separate, richer,
 * dedicated production file for exactly that content (gallery, AI decision
 * report, developer, timeline, unit comparison, calendar+unit-picker
 * booking), and both H3's and H4's own screen specs list "Navigation out:
 * H4 · H5" — so every "عرض المشروع"/"احجز زيارة" action here navigates to
 * the real H4 route (`/discovery/{id}`) instead of duplicating that UI a
 * second time inline. Discovery keeps its own "My Visits" tab (H3's own
 * spec layout region 6, "Visit tracker") — each row links out to the
 * separate H5 (`/visits/{id}`) live-visit screen, which the source's inline
 * visit rows never needed to do (H3/H4/H5 were three separate exports).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { HomeownerNav } from "@/components/nav/HomeownerNav";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { AiConsole } from "./discovery/AiConsole";
import {
  EmptyState,
  MetaPill,
  SukunWordmark,
  SectionHeading,
  brandButton,
} from "@/components/brand/SukunBrand";
import {
  BedIcon,
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  HeartIcon,
  PinIcon,
  SearchIcon,
  WalletIcon,
} from "@/components/brand/Icons";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HOMEOWNER_PROSPECT_OR_ACTIVE } from "@/lib/auth/roles";
import {
  PROJECTS, ranked, money, loadPrefs, savePrefs, loadActivity, saveActivity,
  markViewed, toggleFav as toggleFavStore, removeBooking,
  type Preferences, type RankedProject, type DiscoveryActivity,
} from "@/lib/demo/discoveryFixtures";
import { DEMO_MODE } from "@/lib/demo/config";
import {
  useDiscoveryProjects,
  useDiscoveryRecommendation,
  useSavedProjects,
} from "@/lib/hooks/useDiscovery";
import { useVisits } from "@/lib/hooks/useVisits";
import { backendVisits } from "@/lib/backend/visits";
import type { DiscoveryProjectViewModel } from "@/lib/adapters/discovery";

type OnboardScreen = "ob-welcome" | "ob-profile" | "ob-wizard" | "ob-analysis" | "ob-result";
type AppScreen = "dashboard" | "recs" | "search" | "visits" | "notifications" | "fav";

const CITY_OPTS = ["الرياض", "جدة", "الدمام", "مكة"];
const FAMILY_OPTS: [string, number][] = [["1-2", 2], ["3-4", 4], ["5-6", 6], ["7+", 7]];
const FINANCE_OPTS = ["كاش", "تمويل بنكي", "موافقة مبدئية"];

interface WizQuestion {
  kind: "slider" | "single" | "multi";
  key: keyof Preferences;
  title: string;
  sub: string;
  options?: [string, string | number][];
  multiOptions?: string[];
}

const WIZ_QUESTIONS: WizQuestion[] = [
  { kind: "slider", key: "wBudget", title: "ما ميزانيتك التقريبية؟", sub: "اسحب لتحديد الحد الأقصى المناسب لك." },
  { kind: "single", key: "wType", title: "ما نوع العقار المفضّل؟", sub: "اختر ما يناسب أسلوب حياتك.", options: [["فيلا", "فيلا"], ["شقة", "شقة"], ["دوبلكس", "دوبلكس"], ["تاون هاوس", "تاون هاوس"]] },
  { kind: "single", key: "wBeds", title: "كم عدد غرف النوم المطلوبة؟", sub: "الحد الأدنى الذي تحتاجه.", options: [["غرفتان", 2], ["3 غرف", 3], ["4 غرف", 4], ["5 غرف فأكثر", 5]] },
  { kind: "single", key: "wTimeline", title: "متى تخطّط للانتقال؟", sub: "يساعدنا في ترتيب الأولويات.", options: [["خلال 3 أشهر", "خلال 3 أشهر"], ["خلال 6 أشهر", "خلال 6 أشهر"], ["خلال سنة", "خلال سنة"], ["ما زلت أستكشف", "ما زلت أستكشف"]] },
  { kind: "multi", key: "wLifestyle", title: "ما أولوياتك في السكن؟", sub: "اختر كل ما يهمّك — يمكنك اختيار أكثر من خيار.", multiOptions: ["قريب من العمل", "قريب من المدارس", "فخامة", "منطقة هادئة", "استثمار", "حديقة كبيرة", "منزل ذكي", "قريب من الخدمات"] },
];

const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };
const btnPrimary: React.CSSProperties = { fontSize: 14.5, fontWeight: 600, padding: "13px 24px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" };
const btnGhost: React.CSSProperties = { fontSize: 14, fontWeight: 600, padding: "12px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", cursor: "pointer" };
const pillBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "12px 0", border: `1.5px solid ${active ? "var(--g-900)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)",
  background: active ? "var(--g-900)" : "var(--n-surface)", color: active ? "var(--t-on-dark)" : "var(--t-secondary)", fontSize: 14, fontWeight: 600, cursor: "pointer",
});

export function DiscoveryScreen() {
  return (
    <RouteGuard allow={HOMEOWNER_PROSPECT_OR_ACTIVE}>
      <DiscoveryScreenInner />
    </RouteGuard>
  );
}

function DiscoveryScreenInner() {
  const router = useRouter();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [activity, setActivity] = useState<DiscoveryActivity>(loadActivity);
  const [phase, setPhase] = useState<"onboarding" | "app">(() => (loadPrefs().recReady ? "app" : "onboarding"));
  const [obScreen, setObScreen] = useState<OnboardScreen>("ob-welcome");
  const [appScreen, setAppScreen] = useState<AppScreen>("dashboard");
  const [wizStep, setWizStep] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [visitsTab, setVisitsTab] = useState<"upcoming" | "completed" | "cancelled">("upcoming");
  const [prefEditorOpen, setPrefEditorOpen] = useState(false);
  /**
   * MOBILE ONLY. The search screen is a fixed `230px 1fr` split, which at 390px
   * left the results card about 130px wide — the clipped strip in the iPhone
   * evidence. On mobile the split becomes one column and the filter panel
   * collapses behind this toggle, so the project cards get the full width back.
   * Desktop always renders the panel and never sees this flag.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [search, setSearch] = useState({ city: "كل المدن", type: "كل الأنواع", budget: 2500000, beds: 0, ready: "الكل" });

  const persistPrefs = (next: Preferences) => { setPrefs(next); savePrefs(next); };
  const persistActivity = (next: DiscoveryActivity) => { setActivity(next); saveActivity(next); };

  /**
   * Task 2 · the ONE data seam on this screen.
   *
   * Both modes hand the JSX below the same `DiscoveryProjectViewModel[]`, ranked
   * by the resident's own stored preferences, so the component has no branch of
   * its own and cannot tell demo data from real data:
   *
   *   DEMO_MODE=true   `lib/demo/discoveryFixtures.ts`, read synchronously.
   *                    No Backend call, no AbortController, and the favourites
   *                    record keeps its original numeric localStorage keys.
   *   DEMO_MODE=false  `GET /api/discovery/projects`, with real save/unsave and
   *                    the real `GET /api/discovery/recommendations`. No fixture
   *                    fallback on any path.
   *
   * Project ids are STRINGS throughout — fixture `1..6` and real UUIDs alike —
   * which is why every handler below takes a `string`. The fixtures module is
   * untouched; `useSavedProjects` converts at that one boundary.
   */
  const discovery = useDiscoveryProjects(prefs, activity);
  const recommendation = useDiscoveryRecommendation(prefs, activity);
  const saved = useSavedProjects(activity, persistActivity);
  const realVisits = useVisits();

  const R = discovery.projects;
  /**
   * The recommendation the CONSULTANT produced, when the Backend's own
   * recommender is available — with its own Arabic reason. When it is
   * unavailable (`AI_SERVICE_UNAVAILABLE` / `NO_DISCOVERABLE_PROJECTS`) the
   * screen falls back to the top preference-matched project, which is a real
   * project ranked by the resident's own criteria — never a fabricated
   * "the AI picked this" claim.
   */
  const hero: DiscoveryProjectViewModel | undefined =
    recommendation.recommendation?.state === "available"
      ? recommendation.recommendation.items[0]?.project ?? R[0]
      : R[0];
  const favIds = R.filter((p) => saved.isSaved(p)).map((p) => p.id);

  function nameOf(id: string) { return R.find((p) => p.id === id)?.name ?? ""; }

  function startAnalysis() {
    setObScreen("ob-analysis");
    setAnalysisProgress(0);
    const t = setInterval(() => {
      setAnalysisProgress((p) => {
        const next = p + 4;
        if (next >= 100) {
          clearInterval(t);
          persistPrefs({ ...prefs, recReady: true });
          setTimeout(() => setObScreen("ob-result"), 400);
          return 100;
        }
        return next;
      });
    }, 70);
  }

  function goApp(screen: AppScreen) { setPhase("app"); setAppScreen(screen); window.scrollTo(0, 0); }
  // The "recently viewed" strip is a local browsing record with no Backend
  // equivalent in either mode, so it stays in localStorage — keyed by the
  // fixture's numeric id in Demo Mode, and skipped for a real UUID.
  function markLocallyViewed(id: string) {
    if (!DEMO_MODE) return;
    markViewed(Number(id));
    setActivity(loadActivity());
  }
  function openProject(id: string) { markLocallyViewed(id); router.push(SCREEN_PATHS.H4_ProjectDetails(id)); }
  function bookProject(id: string) { markLocallyViewed(id); router.push(`${SCREEN_PATHS.H4_ProjectDetails(id)}#sec-book`); }
  function fav(project: DiscoveryProjectViewModel) { void saved.toggle(project); }

  /**
   * "إلغاء" on a visit row. Demo Mode drops the local booking record exactly as
   * before; real mode issues the REAL `POST /api/visits/{id}/cancel` and
   * re-reads the list, so the row disappears only if the Backend accepted it.
   */
  function cancelVisit(id: string) {
    if (DEMO_MODE) { persistActivity(removeBooking(id)); return; }
    void backendVisits.cancel(id).then(() => realVisits.reload()).catch(() => realVisits.reload());
  }

  // The advisor's canned keyword→answer map that used to live here has moved
  // into `lib/ai/mock.ts` behind the `SaknAi` contract, so the console's
  // answers arrive through the same promise the live model will use.

  /**
   * The same filter predicate as before, applied to whichever ranked list this
   * mode produced. A fact the Backend did not report is `null`, and an unknown
   * value is only excluded when the resident actually set that filter — an
   * unpriced project is not silently treated as free, and a project with no
   * published bedroom count is not silently treated as having none.
   */
  const results = R.filter((p) =>
    (search.city === "كل المدن" || p.city === search.city) &&
    (search.type === "كل الأنواع" || p.type === search.type) &&
    (p.price == null || p.price <= search.budget) &&
    (search.beds === 0 || (p.beds != null && p.beds >= search.beds)) &&
    (search.ready === "الكل" || p.avail === search.ready)
  );

  /**
   * "زياراتي" — the real `GET /api/visits` in real mode, the local booking
   * record in Demo Mode. The three tabs read the Backend's own status buckets
   * rather than the demo build's "upcoming only" simplification.
   */
  const upcomingVisits = DEMO_MODE
    ? activity.bookings.map((b) => ({
        bookingId: b.bookingId,
        id: String(b.id),
        label: `${b.day} يوليو · ${b.slot}`,
        bucket: "upcoming" as const,
      }))
    : realVisits.visits.map((v) => ({
        bookingId: v.id,
        id: v.projectId,
        label: `${v.date.slice(0, 10)} · ${v.time}`,
        bucket: v.bucket,
      }));
  const visitList = upcomingVisits.filter((v) => v.bucket === visitsTab);
  const upcomingCount = upcomingVisits.filter((v) => v.bucket === "upcoming").length;

  const q = WIZ_QUESTIONS[wizStep];
  const wizHasVal = q.kind === "slider" ? true : q.kind === "multi" ? Object.values(prefs.wLifestyle).some(Boolean) : (q.key === "wBeds" ? prefs.wBeds > 0 : !!prefs[q.key]);
  const isLastWiz = wizStep === WIZ_QUESTIONS.length - 1;
  const profileOk = prefs.pCity && prefs.pFamily && prefs.pFinance;

  /**
   * ─── The `hero` guard. It must come BEFORE the first dereference. ──────────
   *
   * `prefs.recReady` is a localStorage flag: it survives the session that set
   * it. So on a hard refresh — or on any return to /discovery after the
   * onboarding wizard completed once — the component renders with
   * `recReady === true` while the discovery/recommendation requests are still
   * in flight and `hero` is `undefined`. The notification list below used to be
   * built ABOVE this guard and read `hero.name` / `hero.match` unconditionally
   * on that branch, which threw
   *
   *     TypeError: Cannot read properties of undefined (reading 'name')
   *
   * straight into the application error boundary. Moving the guard above every
   * dereference is the fix; the notification entry is built after it, from a
   * `hero` that is known to exist.
   *
   * The three honest states below are distinguished rather than collapsed:
   * still loading, genuinely nothing discoverable, and failed. None of them is
   * a fixture and none of them is an indefinite spinner — `useAsyncResource`
   * always leaves `loading`.
   */
  if (!hero) {
    const loading =
      discovery.status === "loading" ||
      discovery.status === "idle" ||
      recommendation.status === "loading";
    const failed = discovery.status === "error";

    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 70 }}>
        <main style={{ padding: 26, maxWidth: 1160, margin: "0 auto" }}>
          {loading ? (
            <EmptyState
              icon={<SearchIcon size={26} />}
              title="جارٍ تجهيز توصيتك"
              body="نقرأ تفضيلاتك ونطابقها مع المشاريع المتاحة الآن."
            />
          ) : failed ? (
            <EmptyState
              icon={<SearchIcon size={26} />}
              title="تعذّر تحميل المشاريع"
              body={discovery.errorMessage ?? "حدثت مشكلة أثناء جلب المشاريع. يرجى المحاولة مرة أخرى."}
              action={
                <button onClick={discovery.reload} style={brandButton("primary")}>
                  إعادة المحاولة
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<SearchIcon size={26} />}
              title="لا توجد مشاريع مطابقة"
              body="لا توجد حالياً مشاريع متاحة تطابق تفضيلاتك. جرّب توسيع نطاق البحث."
              action={
                <button onClick={() => setPrefEditorOpen(true)} style={brandButton("ghost")}>
                  تعديل تفضيلاتي
                </button>
              }
            />
          )}
        </main>
        <HomeownerNav />
      </div>
    );
  }

  // Built AFTER the guard above: every entry here may safely read `hero`.
  const notifRaw: { title: string; body: string; unread: boolean }[] = [];
  if (upcomingCount) {
    const last = upcomingVisits[upcomingVisits.length - 1];
    notifRaw.push({ title: "تم تأكيد زيارتك", body: `زيارة ${nameOf(last.id)} · ${last.label}.`, unread: !activity.notifRead });
  }
  if (prefs.recReady) notifRaw.push({ title: "توصيتك جاهزة", body: `وجد مساعد سكن مشروع ${hero.name} بنسبة توافق ${hero.match}%.`, unread: !activity.notifRead && upcomingCount === 0 });
  const hasUnread = notifRaw.some((n) => n.unread);

  const navItems: { id: AppScreen; label: string; badge?: number }[] = [
    { id: "dashboard", label: "الرئيسية" },
    { id: "recs", label: "التوصية الذكية" },
    { id: "search", label: "استكشف" },
    { id: "fav", label: "المفضّلة", badge: favIds.length || undefined },
    { id: "visits", label: "زياراتي", badge: upcomingCount || undefined },
  ];

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: phase === "app" ? 70 : 0 }}>
      {phase === "onboarding" ? (
        obScreen === "ob-welcome" ? (
          <div
            style={{
              minHeight: "100dvh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 24px",
              background: "radial-gradient(120% 120% at 50% 0%, var(--g-800) 0%, var(--g-900) 55%, var(--g-950) 100%)",
              color: "var(--t-on-dark)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-18%",
                insetInlineStart: "-10%",
                width: 480,
                height: 480,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(var(--a-500-rgb), .28) 0%, transparent 70%)",
                filter: "blur(10px)",
              }}
            />
            <div style={{ position: "relative", width: "100%", maxWidth: 520 }}>
              <div
                style={{
                  width: 104,
                  height: 104,
                  margin: "0 auto 30px",
                  borderRadius: "50%",
                  background: "linear-gradient(155deg,var(--a-400),var(--a-700))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 1px rgba(243,236,226,.15), 0 20px 60px -12px rgba(var(--a-500-rgb), .55)",
                  animation: "pop .6s var(--ease)",
                }}
              >
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--t-on-dark)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
                  <circle cx="12" cy="12" r="4.5" />
                </svg>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".3px", color: "var(--a-300)", marginBottom: 12 }}>مستشارك العقاري الذكي</div>
              <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 16px", lineHeight: 1.35 }}>
                مرحباً {user?.name?.split(" ")[0] ?? "بك"}، أنا مستشارك العقاري الذكي
              </h1>
              <p style={{ fontSize: 15.5, color: "var(--t-on-dark-soft)", lineHeight: 1.8, margin: "0 auto 36px", maxWidth: 440 }}>
                سأطرح عليك بضعة أسئلة سريعة عن ميزانيتك واحتياجاتك، ثم أحلّلها فوراً لأرشّح لك أنسب مشروع سكني — بدقّة تفوق التصفّح العشوائي.
              </p>
              {/* On-dark variant: the navy primary fill this button used
                  disappeared into the navy hero behind it. */}
              <button
                onClick={() => setObScreen("ob-profile")}
                style={{ ...btnPrimary, background: "var(--t-on-dark)", color: "var(--g-900)", fontSize: 16, padding: "16px 40px", boxShadow: "var(--sh-3)" }}
              >
                ابدأ الاستشارة
              </button>
              <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 30, fontSize: 12.5, color: "var(--t-on-dark-soft)" }}>
                <span>⏱ أقل من دقيقتين</span>
                <span>🎯 توصية مخصّصة لك</span>
              </div>
            </div>
          </div>
        ) : (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px" }}>
            <SukunLogo size={44} />
            {/* The onboarding phase has its own header. Without the account
                menu here, a seeker who has not finished onboarding would have
                no way to reach their session on a phone, since the floating
                badge is hidden at mobile width. */}
            <span className="sk-only-mobile"><AccountMenu variant="compact" /></span>
          </header>
          <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
            <div style={{ width: "100%", maxWidth: 560 }}>
              {obScreen === "ob-profile" && (
                <>
                  <div style={{ textAlign: "center", marginBottom: 28 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)" }}>الخطوة 1 من 3 · إكمال الملف</div>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: "10px 0 8px" }}>لنتعرّف عليك</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", margin: 0 }}>معلومات أساسية تساعد مساعد سكن الذكي على فهم احتياجك.</p>
                  </div>
                  <div style={{ ...card, padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
                    <div>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>المدينة المفضّلة</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                        {CITY_OPTS.map((c) => (
                          <button key={c} onClick={() => persistPrefs({ ...prefs, pCity: c })} style={pillBtn(prefs.pCity === c)}>{c}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>حجم العائلة</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {FAMILY_OPTS.map(([label, val]) => (
                          <button key={label} onClick={() => persistPrefs({ ...prefs, pFamily: val })} style={pillBtn(prefs.pFamily === val)}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>حالة التمويل</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                        {FINANCE_OPTS.map((f) => (
                          <button key={f} onClick={() => persistPrefs({ ...prefs, pFinance: f })} style={{ ...pillBtn(prefs.pFinance === f), fontSize: 13 }}>{f}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <button disabled={!profileOk} onClick={() => setObScreen("ob-wizard")} style={{ ...btnPrimary, opacity: profileOk ? 1 : 0.5, cursor: profileOk ? "pointer" : "not-allowed" }}>متابعة</button>
                  </div>
                </>
              )}

              {obScreen === "ob-wizard" && (
                <>
                  <div style={{ textAlign: "center", marginBottom: 28 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)" }}>الخطوة 2 من 3 · تفضيلات السكن</div>
                    <h1 style={{ fontSize: 27, fontWeight: 700, margin: "10px 0 8px" }}>{q.title}</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", margin: 0 }}>{q.sub}</p>
                  </div>
                  {q.kind === "single" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                      {q.options!.map(([label, val]) => {
                        const selected = prefs[q.key] === val;
                        return (
                          <button key={label} onClick={() => persistPrefs({ ...prefs, [q.key]: val } as Preferences)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 18, border: `1.5px solid ${selected ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-lg)", background: selected ? "var(--g-50)" : "var(--n-surface)", fontSize: 15.5, fontWeight: 600, cursor: "pointer", textAlign: "right" }}>
                            {label}{selected && " ✓"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {q.kind === "slider" && (
                    <div style={{ ...card, padding: "32px 26px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, fontWeight: 700, color: "var(--g-700)" }}>{money(prefs.wBudget)}</div>
                      <div style={{ fontSize: 13, color: "var(--t-tertiary)", margin: "4px 0 26px" }}>الحد الأقصى للميزانية</div>
                      <input type="range" min={500000} max={4000000} step={100000} value={prefs.wBudget} onChange={(e) => setPrefs({ ...prefs, wBudget: +e.target.value })} onMouseUp={() => savePrefs(prefs)} onTouchEnd={() => savePrefs(prefs)} style={{ width: "100%", accentColor: "var(--g-600)" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--t-tertiary)", marginTop: 8 }}><span>500 ألف</span><span>4 مليون</span></div>
                    </div>
                  )}
                  {q.kind === "multi" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                      {q.multiOptions!.map((o) => {
                        const selected = !!prefs.wLifestyle[o];
                        return (
                          <button key={o} onClick={() => persistPrefs({ ...prefs, wLifestyle: { ...prefs.wLifestyle, [o]: !selected } })}
                            style={{ padding: "12px 18px", border: `1.5px solid ${selected ? "var(--g-900)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-full)", background: selected ? "var(--g-900)" : "var(--n-surface)", color: selected ? "var(--t-on-dark)" : "var(--t-secondary)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                            {selected && "✓ "}{o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
                    <button onClick={() => (wizStep === 0 ? setObScreen("ob-profile") : setWizStep(wizStep - 1))} style={btnGhost}>السابق</button>
                    <div style={{ display: "flex", gap: 6 }}>
                      {WIZ_QUESTIONS.map((_, i) => (
                        <span key={i} style={{ width: i === wizStep ? 24 : 7, height: 7, borderRadius: "var(--r-full)", background: i < wizStep ? "var(--g-600)" : i === wizStep ? "var(--a-500)" : "var(--n-border-strong)" }} />
                      ))}
                    </div>
                    <button disabled={!wizHasVal} onClick={() => (wizHasVal ? (isLastWiz ? startAnalysis() : setWizStep(wizStep + 1)) : undefined)} style={{ ...btnPrimary, padding: "13px 26px", opacity: wizHasVal ? 1 : 0.5, cursor: wizHasVal ? "pointer" : "not-allowed" }}>
                      {isLastWiz ? "تحليل احتياجاتي" : "التالي"}
                    </button>
                  </div>
                </>
              )}

              {obScreen === "ob-analysis" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 120, height: 120, margin: "0 auto 30px", borderRadius: "50%", background: "var(--g-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "var(--g-700)" }}>{analysisProgress}%</div>
                  <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 10px" }}>جارٍ تحليل احتياجاتك</h1>
                  <p style={{ fontSize: 15, color: "var(--t-secondary)", margin: "0 0 30px" }}>يدرس مساعد سكن ملفّك ليجد أنسب مشروع لك.</p>
                </div>
              )}

              {obScreen === "ob-result" && (
                <div>
                  <div style={{ textAlign: "center", marginBottom: 22 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)" }}>اكتمل التحليل</span>
                    <h1 style={{ fontSize: 27, fontWeight: 700, margin: "6px 0" }}>وجدنا سكنك المثالي</h1>
                  </div>
                  <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", overflow: "hidden", color: "var(--t-on-dark)", boxShadow: "var(--sh-4)" }}>
                    <div style={{ height: 160, background: `url(${hero.img}) center/cover` }} />
                    <div style={{ padding: 24 }}>
                      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{hero.name}</h2>
                      <p style={{ fontSize: 14, color: "var(--t-on-dark-soft)", margin: "0 0 16px" }}>{hero.dev} · {hero.district}، {hero.city} · توافق {hero.match}%</p>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--a-300)", marginBottom: 10 }}>لماذا هذا المشروع؟</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
                        {hero.reasons.map((r, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, alignItems: "flex-start" }}>
                            <span style={{ color: "var(--a-300)", flex: "none", marginTop: 1 }}><CheckIcon size={15} /></span>
                            {r}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <button onClick={() => openProject(hero.id)} style={{ flex: 1, fontSize: 15, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--n-bg)", color: "var(--g-900)", cursor: "pointer" }}>عرض المشروع</button>
                        <button onClick={() => bookProject(hero.id)} style={{ flex: 1, fontSize: 15, fontWeight: 600, padding: 14, border: "1.5px solid rgba(243,236,226,.4)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--t-on-dark)", cursor: "pointer" }}>حجز زيارة</button>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => goApp("dashboard")} style={{ ...btnGhost, width: "100%", marginTop: 20 }}>الذهاب إلى لوحتي</button>
                </div>
              )}
            </div>
          </main>
        </div>
        )
      ) : (
        <>
          <header style={{ position: "sticky", top: 0, zIndex: 60, display: "flex", alignItems: "center", gap: 18, padding: "12px 26px", background: "rgba(246,239,232,.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--n-border)" }}>
            <SukunWordmark size={16} />
            {/* 44x44 is the iOS minimum tap target; this was 40x40. */}
            <button onClick={() => goApp("notifications")} aria-label={hasUnread ? "الإشعارات — لديك إشعارات غير مقروءة" : "الإشعارات"} style={{ position: "relative", marginInlineStart: "auto", width: 44, height: 44, border: "none", boxShadow: "inset 0 0 0 1px var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", cursor: "pointer", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t-secondary)" }}>
              <BellIcon size={19} />
              {hasUnread && <span style={{ position: "absolute", top: 8, insetInlineStart: 9, width: 8, height: 8, borderRadius: "50%", background: "var(--err)" }} />}
            </button>
            {/* MOBILE ONLY: the user's name becomes the account trigger. It
                used to be inert text, and the only way to reach the session on
                a phone was the floating badge that covered the page. Desktop
                keeps the plain name it has always shown, and keeps the
                bottom-left badge — its composition is unchanged. */}
            <span className="sk-only-mobile"><AccountMenu /></span>
            <span className="sk-only-desktop" style={{ fontSize: 13.5, fontWeight: 600 }}>{user?.name ?? "مستفيد"}</span>
          </header>

          <nav data-sk-scroll-row style={{ display: "flex", gap: 4, padding: "10px 26px", borderBottom: "1px solid var(--n-border)", overflowX: "auto" }}>
            {navItems.map((n) => (
              <button key={n.id} onClick={() => goApp(n.id)} style={{ fontSize: 13.5, fontWeight: appScreen === n.id ? 700 : 500, padding: "9px 16px", border: "none", borderRadius: "var(--r-full)", background: appScreen === n.id ? "var(--g-900)" : "transparent", color: appScreen === n.id ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                {n.label}{n.badge ? ` (${n.badge})` : ""}
              </button>
            ))}
          </nav>

          <main style={{ padding: 26, maxWidth: 1160, margin: "0 auto" }}>
            {appScreen === "dashboard" && (
              <div>
                {/* 1 — conversation. The consultant owns the top of the page at
                    full width; the recommendation and the dashboard follow it. */}
                <AiConsole
                  userName={user?.name?.split(" ")[0] ?? "بك"}
                  ranked={R}
                  onOpenProject={openProject}
                  onBookProject={bookProject}
                />

                {/* 2 — the recommendation the consultant produced. */}
                <div style={{ marginTop: 40 }}>
                  <SectionHeading
                    title="التوصية التي وصل إليها المستشار"
                    hint="مبنية على المدينة والميزانية ونوع العقار وعدد الغرف التي سجّلتها."
                    action={
                      <button
                        onClick={() => goApp("recs")}
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        لماذا هذا المشروع؟
                      </button>
                    }
                  />
                  <div
                    style={{
                      display: "grid",
                      gap: 0,
                      gridTemplateColumns: "minmax(0,1fr)",
                      borderRadius: "var(--r-2xl)",
                      overflow: "hidden",
                      background: "var(--n-surface)",
                      boxShadow: "var(--sh-2), inset 0 0 0 1px var(--n-border)",
                    }}
                    className="sk-rec-split"
                  >
                    <div style={{ position: "relative", minHeight: 210, background: `url(${hero.img}) center/cover` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hero.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.34, position: "absolute", inset: 0 }} />
                      <span style={{ position: "absolute", top: 14, insetInlineEnd: 14 }}>
                        <MetaPill label={`توافق ${hero.match}%`} tone="onDark" />
                      </span>
                    </div>
                    <div style={{ padding: "26px 28px" }}>
                      <h3 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{hero.name}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--t-secondary)", marginTop: 7 }}>
                        <BuildingIcon size={15} />
                        {hero.dev}
                        <span style={{ opacity: 0.4 }}>·</span>
                        <PinIcon size={15} />
                        {hero.district}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0" }}>
                        <MetaPill icon={<WalletIcon size={13} />} label={hero.priceLabel} tone="gold" />
                        <MetaPill icon={<BedIcon size={13} />} label={`${hero.beds ?? "—"} غرف`} />
                        <MetaPill label={`${hero.area ?? "—"} م²`} />
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={() => openProject(hero.id)} style={{ ...brandButton("primary"), flex: "1 1 150px", padding: "13px 20px", fontSize: 14 }}>عرض التفاصيل</button>
                        <button onClick={() => bookProject(hero.id)} style={{ ...brandButton("ghost"), flex: "1 1 130px", padding: "13px 20px", fontSize: 14 }}>حجز زيارة</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3 — the dashboard, demoted to a summary strip. */}
                <div style={{ marginTop: 40 }}>
                  <SectionHeading title="نشاطك على سُكن" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16, marginBottom: 22 }}>
                  {[
                    { value: String(upcomingCount), label: "زيارة قادمة" },
                    { value: prefs.recReady ? `${hero.match}%` : "—", label: "أعلى توافق" },
                    { value: String(activity.viewed.length), label: "مشاريع اطّلعت عليها" },
                    { value: String(favIds.length), label: "في المفضّلة" },
                  ].map((k) => (
                    <div key={k.label} style={{ ...card, padding: 20 }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{k.value}</div>
                      <div style={{ fontSize: 13, color: "var(--t-tertiary)", marginTop: 5 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ ...card, padding: 22, marginBottom: 22 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>زيارتك القادمة</div>
                  {upcomingCount ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: 16, background: "var(--n-bg)" }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{nameOf(upcomingVisits[0].id)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 4 }}>
                          <CalendarIcon size={14} />
                          {upcomingVisits[0].label}
                        </div>
                      </div>
                      <button onClick={() => goApp("visits")} style={{ ...btnGhost, fontSize: 13, padding: "10px 18px" }}>التفاصيل</button>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<CalendarIcon size={26} />}
                      title="لا زيارات قادمة بعد"
                      body="الزيارة الميدانية هي أدق ما يحسم قرارك — احجز زيارة للمشروع الذي رشّحه لك المستشار."
                      action={
                        <button onClick={() => bookProject(hero.id)} style={brandButton("primary")}>
                          احجز زيارة لـ{hero.name}
                        </button>
                      }
                    />
                  )}
                </div>

                {activity.viewed.length > 0 && (
                  <>
                    <SectionHeading title="مشاريع اطّلعت عليها" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
                      {activity.viewed.slice(0, 3).map((id, i) => {
                        const p = R.find((x) => x.id === String(id));
                        if (!p) return null;
                        return (
                          <div key={id} onClick={() => openProject(String(id))} className="sk-rise" style={{ ...card, overflow: "hidden", cursor: "pointer", animationDelay: `${i * 70}ms` }}>
                            <div style={{ height: 104, background: `url(${p.img}) center/cover` }} />
                            <div style={{ padding: 16 }}>
                              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--g-700)", marginTop: 4 }}>{p.priceLabel}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                </div>
              </div>
            )}

            {appScreen === "recs" && (
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)" }}>التوصية الذكية</span>
                <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0" }}>أفضل تطابق لاحتياجاتك</h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "20px 0 24px" }}>
                  <button onClick={() => setPrefEditorOpen(true)} style={{ ...btnGhost, borderRadius: "var(--r-full)", fontSize: 13.5, padding: "9px 16px" }}>عدّل تفضيلاتك</button>
                  {[
                    { icon: <PinIcon size={14} />, k: "المدينة", v: prefs.pCity || "—" },
                    { icon: <WalletIcon size={14} />, k: "الميزانية", v: money(prefs.wBudget) },
                    { icon: <BuildingIcon size={14} />, k: "النوع", v: prefs.wType || "—" },
                    { icon: <BedIcon size={14} />, k: "الغرف", v: prefs.wBeds ? String(prefs.wBeds) : "—" },
                  ].map((c) => (
                    <MetaPill key={c.k} icon={c.icon} label={`${c.k}: `} value={c.v} />
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 22, marginBottom: 26 }}>
                  <div style={{ ...card, border: "1px solid var(--a-300)", padding: 28 }}>
                    <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ width: 90, height: 90, borderRadius: "50%", background: "var(--g-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "var(--g-700)", flex: "none" }}>{hero.match}%</div>
                      <div><h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{hero.name}</h3><p style={{ fontSize: 14, color: "var(--t-secondary)", margin: 0 }}>{hero.dev} · {hero.district}، {hero.city}</p></div>
                    </div>
                    <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--n-border)" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>لماذا اختار سكن هذا المشروع؟</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{hero.reasons.map((r, i) => <div key={i} style={{ fontSize: 14, color: "var(--t-secondary)" }}>✓ {r}</div>)}</div>
                      <button onClick={() => openProject(hero.id)} style={{ ...btnPrimary, marginTop: 18 }}>عرض التفاصيل وحجز زيارة</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ ...card, padding: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>ثقة الذكاء الاصطناعي</div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--g-700)" }}>{Math.min(96, 78 + hero.matched.length * 4)}%</div>
                    </div>
                    <div style={{ background: "var(--g-900)", borderRadius: "var(--r-lg)", padding: 20, color: "var(--t-on-dark)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--a-300)", marginBottom: 8 }}>ملاحظة المساعد</div>
                      <p style={{ fontSize: 13.5, color: "var(--t-on-dark-soft)", margin: 0 }}>{prefs.pFinance ? `حالة تمويلك (${prefs.pFinance}) تدعم هذا الخيار. ` : ""}الموقع قريب من الخدمات الأساسية.</p>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>بدائل مقترحة</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                  {R.filter((p) => p.id !== hero.id).slice(0, 3).map((p) => (
                    <div key={p.id} onClick={() => openProject(p.id)} style={{ ...card, overflow: "hidden", cursor: "pointer" }}>
                      <div style={{ height: 100, background: `url(${p.img}) center/cover` }} />
                      <div style={{ padding: 14 }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 12.5, color: "var(--t-tertiary)" }}>{p.district} · {p.priceLabel}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {appScreen === "search" && (
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>استكشف المشاريع</h1>
                <p style={{ fontSize: 14.5, color: "var(--t-secondary)", margin: "0 0 20px" }}>{results.length} مشروع مطابق</p>
                <button
                  className="sk-only-mobile"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  style={{ width: "100%", minHeight: 44, marginBottom: 14, fontSize: 14, fontWeight: 600, padding: "12px 18px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", cursor: "pointer" }}
                >
                  {filtersOpen ? "إخفاء التصفية" : "التصفية"}
                </button>
                <div data-sk-search-split style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 20, alignItems: "start" }}>
                  <div className={filtersOpen ? undefined : "sk-filter-collapsed"} style={{ ...card, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>التصفية</span>
                      <button onClick={() => setSearch({ city: "كل المدن", type: "كل الأنواع", budget: 2500000, beds: 0, ready: "الكل" })} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>إعادة تعيين</button>
                    </div>
                    <label style={{ display: "block", marginBottom: 14 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>المدينة</span>
                      <select value={search.city} onChange={(e) => setSearch({ ...search, city: e.target.value })} className="sk-in" style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)" }}>
                        {["كل المدن", ...CITY_OPTS.filter((c) => c !== "مكة"), "الخبر"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "block", marginBottom: 14 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>نوع العقار</span>
                      <select value={search.type} onChange={(e) => setSearch({ ...search, type: e.target.value })} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)" }}>
                        {["كل الأنواع", "فيلا", "شقة"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}><span>الميزانية القصوى</span><span style={{ color: "var(--a-700)" }}>{money(search.budget)}</span></div>
                      <input type="range" min={500000} max={4000000} step={100000} value={search.budget} onChange={(e) => setSearch({ ...search, budget: +e.target.value })} style={{ width: "100%", accentColor: "var(--g-600)" }} />
                    </div>
                    <div>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>غرف النوم</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[0, 1, 2, 3, 4].map((b) => (
                          <button key={b} onClick={() => setSearch({ ...search, beds: b })} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "9px 0", border: `1.5px solid ${search.beds === b ? "var(--g-900)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-sm)", background: search.beds === b ? "var(--g-900)" : "var(--n-surface)", color: search.beds === b ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer" }}>{b === 0 ? "الكل" : `${b}+`}</button>
                        ))}
                      </div>
                    </div>
                    {/* An explicit apply/close on mobile: the selections already
                        live in `search`, so closing keeps every one of them. */}
                    <button
                      className="sk-only-mobile"
                      onClick={() => setFiltersOpen(false)}
                      style={{ width: "100%", minHeight: 44, marginTop: 18, fontSize: 14, fontWeight: 600, padding: "12px 18px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}
                    >
                      عرض {results.length} نتيجة
                    </button>
                  </div>
                  <div>
                    {results.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
                        {results.map((p) => (
                          <div key={p.id} style={{ ...card, overflow: "hidden" }}>
                            <div style={{ height: 150, background: `url(${p.img}) center/cover`, position: "relative" }}>
                              <span style={{ position: "absolute", top: 12, right: 12, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: "var(--r-full)", background: "rgba(var(--g-900-rgb), .82)", color: "var(--a-300)" }}>توافق {p.match}%</span>
                              <button
                                onClick={() => fav(p)}
                                aria-label="مفضّلة"
                                style={{
                                  position: "absolute", top: 10, insetInlineStart: 12, width: 34, height: 34,
                                  border: "none", borderRadius: "50%", background: "rgba(252,248,242,.92)",
                                  cursor: "pointer", color: saved.isSaved(p) ? "var(--err)" : "var(--t-secondary)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  backdropFilter: "blur(6px)", boxShadow: "var(--sh-1)",
                                }}
                              >
                                <HeartIcon size={17} filled={saved.isSaved(p)} />
                              </button>
                            </div>
                            <div style={{ padding: 16 }}>
                              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                              <div style={{ fontSize: 12.5, color: "var(--t-tertiary)", margin: "2px 0 10px" }}>{p.dev} · {p.district}</div>
                              <div style={{ display: "flex", gap: 12, fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 12 }}><span>{p.beds} غرف</span><span>{p.baths} دورات</span><span>{p.area}م²</span></div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--n-border)" }}>
                                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--g-700)" }}>{p.priceLabel}</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button onClick={() => openProject(p.id)} style={{ ...btnGhost, fontSize: 13, padding: "9px 14px" }}>التفاصيل</button>
                                  <button onClick={() => bookProject(p.id)} style={{ ...btnPrimary, fontSize: 13, padding: "9px 14px" }}>احجز زيارة</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={<SearchIcon size={26} />}
                        title="لا توجد مشاريع مطابقة"
                        body="جرّب توسيع الميزانية أو تغيير المدينة — أو اسأل المستشار عن أقرب بديل لمعاييرك."
                        action={
                          <button
                            onClick={() => setSearch({ city: "كل المدن", type: "كل الأنواع", budget: 2500000, beds: 0, ready: "الكل" })}
                            style={brandButton("ghost")}
                          >
                            إعادة تعيين البحث
                          </button>
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {appScreen === "visits" && (
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 18px" }}>زياراتي</h1>
                <div style={{ display: "flex", gap: 4, borderBottom: "1.5px solid var(--n-border)", marginBottom: 22 }}>
                  {(["upcoming", "completed", "cancelled"] as const).map((t) => (
                    <button key={t} onClick={() => setVisitsTab(t)} style={{ fontSize: 14.5, fontWeight: visitsTab === t ? 700 : 500, padding: "12px 18px", border: "none", background: "none", color: visitsTab === t ? "var(--g-900)" : "var(--t-tertiary)", cursor: "pointer", borderBottom: `2.5px solid ${visitsTab === t ? "var(--g-900)" : "transparent"}` }}>
                      {t === "upcoming" ? "القادمة" : t === "completed" ? "المكتملة" : "الملغاة"}
                    </button>
                  ))}
                </div>
                {visitList.length === 0 ? (
                  <EmptyState
                    icon={<CalendarIcon size={26} />}
                    title={`لا زيارات ${visitsTab === "upcoming" ? "قادمة" : visitsTab === "cancelled" ? "ملغاة" : "مكتملة"}`}
                    body="الزيارة الميدانية تكشف ما لا تُظهره الصور — الإضاءة، الضجيج، وجودة التشطيب عن قرب."
                    action={
                      <button onClick={() => goApp("search")} style={brandButton("primary")}>
                        استكشف المشاريع
                      </button>
                    }
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {visitList.map((v) => (
                      <div key={v.bookingId} style={{ ...card, display: "flex", gap: 16, alignItems: "center", padding: 18, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{nameOf(v.id)}</div>
                          <div style={{ fontSize: 12.5, color: "var(--t-tertiary)" }}>{v.label}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: "var(--r-full)", background: "var(--ok-bg)", color: "var(--ok-strong)" }}>مؤكّدة</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => router.push(SCREEN_PATHS.H5_VisitExperience(v.bookingId))} style={{ ...btnGhost, fontSize: 13, padding: "9px 14px" }}>التفاصيل</button>
                          <button onClick={() => bookProject(v.id)} style={{ ...btnGhost, fontSize: 13, padding: "9px 14px" }}>إعادة جدولة</button>
                          <button onClick={() => cancelVisit(v.bookingId)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 14px", border: "1.5px solid rgba(188,70,48,.4)", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--err)", cursor: "pointer" }}>إلغاء</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {appScreen === "notifications" && (
              <div style={{ maxWidth: 640 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>الإشعارات</h1>
                  <button onClick={() => persistActivity({ ...activity, notifRead: true })} style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>تعليم الكل كمقروء</button>
                </div>
                {notifRaw.length === 0 ? (
                  <EmptyState
                    icon={<BellIcon size={26} />}
                    title="لا إشعارات بعد"
                    body="سنُشعرك فور تأكيد زيارة، أو عندما يجهّز المستشار توصية جديدة تناسب تفضيلاتك."
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {notifRaw.map((n, i) => (
                      <div key={i} style={{ ...card, background: n.unread ? "var(--a-50)" : "var(--n-surface)", padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 600, fontSize: 14.5 }}>{n.title}</span>{n.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--a-500)" }} />}</div>
                        <p style={{ fontSize: 13, color: "var(--t-secondary)", margin: "4px 0 0" }}>{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {appScreen === "fav" && (
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 18px" }}>المفضّلة</h1>
                {favIds.length === 0 ? (
                  <EmptyState
                    icon={<HeartIcon size={26} />}
                    title="لا مشاريع في المفضّلة بعد"
                    body="احفظ المشاريع التي تلفت انتباهك أثناء التصفّح، وستجدها هنا جاهزة للمقارنة."
                    action={
                      <button onClick={() => goApp("search")} style={brandButton("primary")}>
                        تصفّح المشاريع
                      </button>
                    }
                  />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                    {R.filter((p) => saved.isSaved(p)).map((p) => (
                      <div key={p.id} onClick={() => openProject(p.id)} style={{ ...card, overflow: "hidden", cursor: "pointer" }}>
                        <div style={{ height: 120, background: `url(${p.img}) center/cover` }} />
                        <div style={{ padding: 16 }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--g-700)" }}>{p.priceLabel}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {prefEditorOpen && (
        <div onClick={() => setPrefEditorOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 129, background: "rgba(var(--g-900-rgb), .35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ width: "100%", maxWidth: 420, background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-xl)", boxShadow: "var(--sh-4)", padding: 26 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>تعديل التفضيلات</div>
            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}><PinIcon size={14} /> المدينة</span>
              <select value={prefs.pCity} onChange={(e) => setPrefs({ ...prefs, pCity: e.target.value })} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)" }}>
                {["الرياض", "جدة", "الدمام", "الخبر"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}><span style={{ display: "flex", alignItems: "center", gap: 7 }}><WalletIcon size={14} /> الميزانية</span><span style={{ color: "var(--a-700)" }}>{money(prefs.wBudget)}</span></div>
              <input type="range" min={500000} max={4000000} step={100000} value={prefs.wBudget} onChange={(e) => setPrefs({ ...prefs, wBudget: +e.target.value })} style={{ width: "100%", accentColor: "var(--g-600)" }} />
            </div>
            <button
              disabled={prefSaving}
              onClick={() => {
                setPrefSaving(true);
                setTimeout(() => { persistPrefs(prefs); setPrefSaving(false); setPrefEditorOpen(false); }, 500);
              }}
              style={{ ...btnPrimary, width: "100%", marginTop: 10, opacity: prefSaving ? 0.7 : 1 }}
            >
              {prefSaving ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </button>
          </div>
        </div>
      )}

      {phase === "app" && <HomeownerNav showDesktop={false} />}

      <style jsx global>{`
        @media (min-width: 900px) {
          .sk-rec-split {
            grid-template-columns: 1fr 1.15fr !important;
          }
        }
      `}</style>
    </div>
  );
}
