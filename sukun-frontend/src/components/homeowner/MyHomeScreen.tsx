"use client";

/**
 * H7 · منزلي — ported from `Sakn My Home.dc.html` (Sakn.d.zip, sole
 * production source). Every action in the source's own script only calls
 * `flash()` (a toast), never a real navigation or fetch — matching that
 * Reports/Warranty/Maintenance/Documents are all still-unbuilt product
 * surfaces at the time this export was authored. Per the standing
 * "backend-not-built handling convention" (`07_Frontend_Status.md` §8:
 * ship every screen fully navigable, stub only the network call), the two
 * actions that map to real screens in the 21-screen inventory (رفع بلاغ →
 * H8, الضمان tile → H10) are wired to real navigation here — H8/H10 don't
 * exist yet at the point this screen is built, so those links 404 until
 * they do, the same precedent already used for every RE-series cross-link
 * (e.g. RE1 → RE3 before RE3 existed). الصيانة/الوثائق stay `flash()`
 * placeholders — they name no screen anywhere in `01_Page_Inventory.md`'s
 * 21-screen list, so there is nothing to link to, ever.
 *
 * **Dropped:** the "حالات العرض" (demo state panel) — a design-tool
 * state-preview harness (toggle warranty-expired/empty-attention/
 * empty-activity/multi-unit), same category as the "screens launcher" FAB
 * already dropped for H1/H2/H6 per `01_Page_Inventory.md` §3. Its default
 * state (warranty active, has attention items, has activity, single unit)
 * is kept as this screen's one static presentation.
 *
 * **Persistent nav:** uses `components/nav/HomeownerNav.tsx` (built in
 * Step 2, §9) — its labels/hrefs (منزلي/بلاغاتي/الضمان/ابحث عن منزل)
 * already matched `02_Navigation_Map.md` with no literal-source conflict
 * to resolve here (unlike the RE screens' nav-pill wording clash).
 */

import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HomeownerNav } from "@/components/nav/HomeownerNav";
import { ImageSlotPlaceholder } from "@/components/ImageSlotPlaceholder";
import { HOMEOWNER_ACTIVE_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { useMyHome } from "@/lib/hooks/useMyHome";

const UNIT = { project: "مشروع تالا ريزيدنس", dev: "شركة الأفق للتطوير العقاري", number: "A-142", city: "الرياض" };
const WARRANTY = { label: "الضمان ساري", chipBg: "rgba(47,158,106,.18)", chipColor: "var(--ok-on-dark)", dot: "var(--ok)" };

const TIMELINE = [
  { when: "اليوم", text: "تم ربط الوحدة بحسابك بنجاح.", ok: true },
  { when: "قبل يومين", text: "تم الانتهاء من إصلاح مشكلة الإنارة في الصالة.", ok: true },
  { when: "قبل أسبوع", text: "تم قبول البلاغ #2390 وإحالته لفريق التنفيذ.", ok: false },
  { when: "قبل أسبوعين", text: "تمت جدولة زيارة صيانة دورية للوحدة.", ok: false },
];

/** The two attention cards this screen ships, as the approved rows describe them. */
const DEMO_ATTENTION = [
  {
    kind: "REPORT_AWAITING_APPROVAL" as const,
    title: "يوجد بلاغ بانتظار ردك",
    sub: "بلاغ #2418 — تسريب في المطبخ",
    target: "reports" as const,
  },
  {
    kind: "WARRANTY_ENDING" as const,
    title: "الضمان ينتهي خلال 30 يوماً",
    sub: "ننصح بمراجعة بنود التغطية قبل الانتهاء",
    target: "warranty" as const,
  },
];

/** The screen's existing "unknown value" placeholder — reused, never a demo figure. */
const UNKNOWN = "—";

export function MyHomeScreen() {
  return (
    <RouteGuard allow={HOMEOWNER_ACTIVE_ONLY}>
      <MyHomeInner />
    </RouteGuard>
  );
}

function MyHomeInner() {
  const router = useRouter();

  /**
   * Task 2 · the ONE data seam on this screen.
   *
   * `GET /api/homeowners/me` supplies the project, developer, unit number,
   * city, cover image and warranty summary; the homeowner's own recent
   * canonical reports supply the attention cards and the activity strip. The
   * hook is inert in Demo Mode — no request is made and every constant above
   * renders exactly as it always did.
   *
   * Where the Backend has no fact, the screen shows its existing "—"
   * placeholder rather than a plausible stand-in: there is no cover photo when
   * `coverImage.url` is null, no warranty chip claim when there is no warranty
   * row, and no activity rows when the homeowner has filed nothing.
   */
  const { user } = useAuth();
  const { home, attention: liveAttention, activity: liveActivity } = useMyHome();

  const unit = home
    ? { project: home.unit.project, dev: home.unit.dev, number: home.unit.number, city: home.unit.city }
    : DEMO_MODE
      ? UNIT
      : { project: UNKNOWN, dev: UNKNOWN, number: UNKNOWN, city: UNKNOWN };
  const warranty = home ? home.warranty : WARRANTY;
  const coverSrc = home ? (home.coverImageUrl ?? undefined) : "/projects/my-home-facade.jpg";
  const attention = home ? liveAttention : DEMO_MODE ? DEMO_ATTENTION : [];
  const timeline = home ? liveActivity : DEMO_MODE ? TIMELINE : [];
  const greetingName = DEMO_MODE ? "محمد" : (user?.name?.split(" ")[0] ?? "");

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      <HomeownerNav />
      <div style={{ position: "relative", maxWidth: "760px", margin: "0 auto", padding: "26px 22px 120px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
            <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><HomeIcon /></span>
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-.4px", margin: 0, lineHeight: 1.1 }}>منزلي</h1>
              <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}><AccountMenu variant="compact" /></span>
              {/* ONE text node, not `مساء الخير، {name}`. Splitting it produces
                  two adjacent DOM text nodes, which breaks the Arabic shaping
                  run at the join — measured as an 18-pixel difference against
                  the Task 1 baseline before this was fixed. */}
              <div style={{ fontSize: "13px", color: "var(--t-secondary)", marginTop: "3px" }}>{`مساء الخير، ${greetingName}`}</div>
            </div>
          </div>
          <button aria-label="التنبيهات" style={{ position: "relative", width: "42px", height: "42px", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BellIcon />
            <span style={{ position: "absolute", top: "9px", right: "10px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--warn)", border: "2px solid var(--n-surface)" }} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", background: "var(--g-900)", borderRadius: "var(--r-2xl)", overflow: "hidden", boxShadow: "var(--sh-4)" }}>
          <div style={{ position: "relative", padding: "30px 30px 28px", color: "var(--t-on-dark)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "230px" }}>
            <div>
              <span style={{ display: "inline-block", fontSize: "11.5px", fontWeight: 600, color: "var(--a-300)", background: "rgba(var(--a-500-rgb), .14)", padding: "5px 12px", borderRadius: "var(--r-full)", marginBottom: "14px" }}>منزلي</span>
              <h2 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.5px", lineHeight: 1.25, margin: 0 }}>{unit.project}</h2>
              <div style={{ fontSize: "14px", color: "var(--t-on-dark-soft)", marginTop: "7px" }}>{unit.dev}</div>
            </div>
            <div style={{ display: "flex", gap: "26px", marginTop: "22px" }}>
              <div><div style={{ fontSize: "11.5px", color: "var(--t-on-dark-soft)", marginBottom: "4px" }}>رقم الوحدة</div><div style={{ fontSize: "15px", fontWeight: 600 }} dir="ltr">{unit.number}</div></div>
              <div><div style={{ fontSize: "11.5px", color: "var(--t-on-dark-soft)", marginBottom: "4px" }}>المدينة</div><div style={{ fontSize: "15px", fontWeight: 600 }}>{unit.city}</div></div>
              <div style={{ alignSelf: "flex-end" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, padding: "8px 14px", borderRadius: "var(--r-full)", background: warranty.chipBg, color: warranty.chipColor }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: warranty.dot }} />
                  {warranty.label}
                </span>
              </div>
            </div>
          </div>
          <div style={{ position: "relative", minHeight: "230px" }}>
            <ImageSlotPlaceholder label="صورة واجهة المشروع" src={coverSrc} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(270deg,transparent 55%,rgba(var(--g-900-rgb), .55))" }} />
          </div>
        </div>

        <div style={{ marginTop: "30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 2px 14px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>ما يحتاج انتباهك</h3>
            <span style={{ flex: 1, height: "1px", background: "var(--n-border)" }} />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--warn)", background: "var(--warn-bg)", padding: "3px 10px", borderRadius: "var(--r-full)" }}>{attention.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            {attention.map((item) =>
              item.kind === "REPORT_AWAITING_APPROVAL" ? (
                <AttentionItem key={item.kind} accent="var(--warn)" tint="var(--warn)" tintBg="var(--warn-bg)" icon={<InboxIcon />} title={item.title} sub={item.sub} onClick={() => router.push(SCREEN_PATHS.H9_MyReports)} />
              ) : (
                <AttentionItem key={item.kind} accent="var(--a-400)" tint="var(--a-700)" tintBg="var(--a-50)" icon={<ClockIcon />} title={item.title} sub={item.sub} onClick={() => router.push(SCREEN_PATHS.H10_WarrantyCenter)} />
              ),
            )}
          </div>
        </div>

        <div style={{ marginTop: "30px" }}>
          <h3 style={{ fontSize: "17px", fontWeight: 700, margin: "0 2px 14px" }}>ماذا تريد أن تفعل؟</h3>
          <button onClick={() => router.push(SCREEN_PATHS.H8_ReportJourney)} style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%", textAlign: "right", background: "var(--g-900)", border: "none", borderRadius: "var(--r-xl)", padding: "20px 22px", cursor: "pointer", boxShadow: "var(--sh-2)", color: "var(--t-on-dark)" }}>
            <span style={{ width: "52px", height: "52px", borderRadius: "var(--r-md)", background: "rgba(188,70,48,.22)", color: "var(--err-on-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><ReportIcon /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>رفع بلاغ</div>
              <div style={{ fontSize: "13px", color: "var(--t-on-dark-soft)", marginTop: "3px" }}>واجهت مشكلة؟ أخبرنا فقط — ونحن نتكفّل بالباقي.</div>
            </div>
            <ChevronIcon color="var(--a-300)" />
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "13px", marginTop: "13px" }}>
            <QuickTile tint="var(--g-700)" tintBg="var(--g-50)" icon={<ShieldIcon />} title="الضمان" sub="التغطية والمدة المتبقية" onClick={() => router.push(SCREEN_PATHS.H10_WarrantyCenter)} />
            <QuickTile tint="var(--a-700)" tintBg="var(--a-50)" icon={<WrenchIcon />} title="الصيانة" sub="السجل والمواعيد القادمة" onClick={() => {}} disabledNote="الصيانة — تُصمَّم في مرحلة قادمة." />
            <QuickTile tint="var(--info)" tintBg="var(--info-bg)" icon={<DocIcon />} title="الوثائق" sub="المستندات والشهادات" onClick={() => {}} disabledNote="الوثائق — تُصمَّم في مرحلة قادمة." />
          </div>
        </div>

        <div style={{ marginTop: "30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 2px 16px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>آخر الأنشطة</h3>
            <span style={{ flex: 1, height: "1px", background: "var(--n-border)" }} />
          </div>
          <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "8px 22px", boxShadow: "var(--sh-1)" }}>
            {timeline.map((ev, i) => (
              <div key={ev.text} style={{ position: "relative", display: "flex", gap: "16px", padding: "15px 0" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: "14px" }}>
                  <span style={{ width: "13px", height: "13px", borderRadius: "50%", background: ev.ok ? "var(--ok)" : "var(--n-surface)", border: `2.5px solid ${ev.ok ? "var(--ok)" : "var(--a-400)"}`, zIndex: 1 }} />
                  {i < timeline.length - 1 && <span style={{ width: "2px", flex: 1, background: "var(--n-border)", marginTop: "2px" }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: "2px" }}>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", fontWeight: 600, marginBottom: "3px" }}>{ev.when}</div>
                  <div style={{ fontSize: "14px", color: "var(--t-primary)", lineHeight: 1.5 }}>{ev.text}</div>
                </div>
              </div>
            ))}
            <button onClick={() => router.push(SCREEN_PATHS.H9_MyReports)} style={{ width: "100%", fontSize: "13.5px", fontWeight: 600, color: "var(--g-700)", padding: "14px", marginTop: "4px", border: "none", borderTop: "1px solid var(--n-border)", background: "transparent", cursor: "pointer" }}>عرض جميع الأنشطة</button>
          </div>
        </div>

        <div style={{ marginTop: "30px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "20px", background: "var(--n-surface2)", border: "1px solid var(--n-border)", borderRadius: "var(--r-xl)", padding: "24px 26px", overflow: "hidden" }}>
            <span style={{ width: "56px", height: "56px", borderRadius: "var(--r-lg)", background: "var(--n-surface)", border: "1px solid var(--n-border)", color: "var(--g-600)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", boxShadow: "var(--sh-1)" }}><SearchIcon /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "16.5px", fontWeight: 700 }}>ابحث عن منزل جديد</div>
              <div style={{ fontSize: "13px", color: "var(--t-secondary)", lineHeight: 1.6, marginTop: "4px", maxWidth: "360px" }}>استكشف مشاريع جديدة واحجز زيارة دون التأثير على وحدتك الحالية.</div>
            </div>
            <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} style={{ fontSize: "14.5px", fontWeight: 600, padding: "13px 24px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", flex: "none", boxShadow: "var(--sh-1)" }}>ابدأ البحث</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttentionItem({ accent, tint, tintBg, icon, title, sub, onClick }: { accent: string; tint: string; tintBg: string; icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "14px", width: "100%", textAlign: "right", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderInlineEnd: `4px solid ${accent}`, borderRadius: "var(--r-lg)", padding: "16px 18px", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
      <span style={{ width: "42px", height: "42px", borderRadius: "var(--r-md)", background: tintBg, color: tint, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14.5px", fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "3px" }}>{sub}</div>
      </div>
      <ChevronIcon color="var(--t-tertiary)" />
    </button>
  );
}
function QuickTile({ tint, tintBg, icon, title, sub, onClick, disabledNote }: { tint: string; tintBg: string; icon: React.ReactNode; title: string; sub: string; onClick: () => void; disabledNote?: string }) {
  return (
    <button onClick={onClick} title={disabledNote} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px", textAlign: "right", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
      <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: tintBg, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "3px", lineHeight: 1.5 }}>{sub}</div>
      </div>
    </button>
  );
}

function HomeIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>; }
function BellIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>; }
function InboxIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
function ClockIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></svg>; }
function ReportIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>; }
function ShieldIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>; }
function WrenchIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>; }
function DocIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>; }
function SearchIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
function ChevronIcon({ color }: { color: string }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="m15 18-6-6 6-6" /></svg>; }
