"use client";

/**
 * RE1 · لوحة التحكم — ported from `Sakn Company Dashboard.dc.html`
 * (Sakn.d.zip, 2026-07-27, the sole production source). Only the file's
 * `dash` screen is reachable in the real button graph — its own
 * `addHomeowner`/`homeowners`/`contractors`/`addContractor` internal
 * sub-screen states exist in the source's `renderVals()` but nothing calls
 * `this.go(...)` to reach them; every quick action instead does a real
 * `window.location.href` to RE4/RE5's own files (`goAddHomeowner`,
 * `goAddContractor`) — dead prototype states from an earlier iteration,
 * not ported (not a screen omission: nothing in the real graph reaches
 * them, matching D9 — RE4/RE5 are the only place homeowner/technician
 * forms live).
 *
 * **Terminology standardization (explicit instruction, 2026-07-27):**
 * this file's own top-nav pills literally say "الملاك"/"الفنيون" for the
 * RE4/RE5 links — overridden here to "السكان"/"المقاولون" (matching
 * `Sakn Projects Management.dc.html`'s own wording, now the standard
 * everywhere) — the one deliberate exception to "port literally," done by
 * explicit user instruction, terminology only, no layout/nav/logic change.
 * Quick action "إضافة فني" → "إضافة مقاول" for the same reason.
 *
 * Real backend (`lib/projects.ts`, Task 003): `GET /projects` is tried
 * first for the project count and list; every other KPI (buildings/units/
 * occupied/open+closed reports/registered residents/satisfaction) has no
 * aggregation endpoint anywhere yet, so those stay on this screen's own
 * literal seed numbers with one `PendingBackendBadge`, never hidden.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { CompanyTopNavPills, type NavPillItem } from "@/components/company/CompanyTopNavPills";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { COMPANY_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { withDemoFallback } from "@/lib/demo/mockFetch";
import { listProjects } from "@/lib/projects";
import { DEMO_MODE } from "@/lib/demo/config";
import { useCompanyDashboard } from "@/lib/hooks/useCompany";
import { relativeArabicDay } from "@/lib/adapters/homeowner";

// ---------- source's own literal seed (RE1's own dataset, kept separate from RE2's) ----------

const SEED_PROJECTS = [
  { id: "p1", name: "مشروع أوج الشمال", status: "قيد التسليم", city: "الرياض", buildings: 8, units: 120, occupied: 96, open: 14, satisfaction: "4.6", manager: "أحمد الغامدي", contractor: "مؤسسة البناء المتين", health: "يحتاج متابعة" as const },
  { id: "p2", name: "مشروع أوج الواحة", status: "مُسلّم", city: "جدة", buildings: 5, units: 74, occupied: 71, open: 3, satisfaction: "4.8", manager: "سارة العتيبي", contractor: "شركة الإتقان للصيانة", health: "ممتاز" as const },
  { id: "p3", name: "مشروع أوج الروابي", status: "قيد الإنشاء", city: "الدمام", buildings: 6, units: 88, occupied: 41, open: 27, satisfaction: "3.9", manager: "ماجد الحربي", contractor: "مجموعة الأساس", health: "حرج" as const },
  { id: "p4", name: "مشروع أوج النخيل", status: "مُسلّم", city: "الرياض", buildings: 4, units: 52, occupied: 50, open: 5, satisfaction: "4.7", manager: "نورة الشمري", contractor: "شركة الإتقان للصيانة", health: "ممتاز" as const },
];

const HEALTH_STYLE = {
  "ممتاز": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "يحتاج متابعة": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "حرج": { bg: "var(--err-bg)", fg: "var(--err-strong)", dot: "var(--err)" },
} as const;

const ACTIVITY = [
  { title: "تم تسجيل ساكن جديد", detail: "فهد المطيري — أوج الشمال، مبنى B، وحدة 214 · ريم القحطاني", date: "٢٦ يوليو", time: "٠٩:٤٢ ص", icon: "user" as const },
  { title: "تم تسليم وحدة", detail: "أوج النخيل — وحدة 108 · نورة الشمري", date: "٢٦ يوليو", time: "٠٨:١٥ ص", icon: "key" as const },
  { title: "تم إغلاق بلاغ", detail: "تسريب مياه — أوج الواحة، وحدة 45 · سارة العتيبي", date: "٢٥ يوليو", time: "٠٤:٣٠ م", icon: "check" as const },
  { title: "تم نقل ساكن", detail: "خالد السبيعي — من وحدة 62 إلى وحدة 77 · ريم القحطاني", date: "٢٥ يوليو", time: "١١:٠٥ ص", icon: "move" as const },
  { title: "تم إنشاء مشروع جديد", detail: "أوج الروابي — الدمام · عبدالله الدوسري", date: "٢٤ يوليو", time: "١٠:٢٠ ص", icon: "build" as const },
];

interface ProjectRowVM {
  id: string;
  name: string;
  status: string;
  city: string;
  statusFg: string;
  buildings: string;
  units: string;
  occupied: string;
  open: string;
  satisfaction: string;
  openFg: string;
  health: keyof typeof HEALTH_STYLE;
  manager: string;
  contractor: string;
}

function seedRowToVM(p: (typeof SEED_PROJECTS)[number]): ProjectRowVM {
  return {
    id: p.id, name: p.name, status: p.status, city: p.city,
    statusFg: p.status === "مُسلّم" ? "var(--ok)" : p.status === "قيد الإنشاء" ? "var(--info)" : "var(--a-700)",
    buildings: String(p.buildings), units: String(p.units), occupied: String(p.occupied), open: String(p.open),
    satisfaction: p.satisfaction,
    openFg: p.open > 20 ? "var(--err)" : p.open > 10 ? "var(--warn)" : "var(--t-primary)",
    health: p.health, manager: p.manager, contractor: p.contractor,
  };
}

export function CompanyDashboardScreen() {
  return (
    <RouteGuard allow={COMPANY_ONLY}>
      <CompanyDashboardInner />
    </RouteGuard>
  );
}

/** The health label the approved chip renders, from the server's own level. */
function healthLabel(level: string): keyof typeof HEALTH_STYLE {
  if (level === "CRITICAL") return "حرج";
  if (level === "AT_RISK") return "يحتاج متابعة";
  return "ممتاز";
}

function CompanyDashboardInner() {
  const router = useRouter();

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   `SEED_PROJECTS` + `ACTIVITY`, exactly as before. The
   *                    legacy `withDemoFallback(listProjects())` probe is kept
   *                    for the Showcase so its behaviour is unchanged.
   *   DEMO_MODE=false  `GET /api/company/overview` (nine server-computed KPIs),
   *                    `/projects/summary` (one card per real project, health
   *                    computed server-side) and `/activity` (real audit rows).
   *
   * `satisfaction` arrives as `null` BY DESIGN — no rating model exists in the
   * schema (decisions.md E8) — so it renders the screen's own "—" and never a
   * fabricated average.
   */
  const live = useCompanyDashboard();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRowVM[]>([]);
  const [realCount, setRealCount] = useState<number | null>(null);
  const [usingDemoData, setUsingDemoData] = useState(false);

  useEffect(() => {
    if (!DEMO_MODE) return;
    let live2 = true;
    withDemoFallback(
      async () => {
        const real = await listProjects();
        return { count: real.length, demo: false };
      },
      { count: SEED_PROJECTS.length, demo: true },
    ).then((result) => {
      if (!live2) return;
      setRealCount(result.demo ? null : result.count);
      setProjects(SEED_PROJECTS.map(seedRowToVM));
      setUsingDemoData(result.demo);
      setLoading(false);
    });
    return () => {
      live2 = false;
    };
  }, []);

  const demoTotals = projects.reduce(
    (a, p) => ({ b: a.b + parseInt(p.buildings, 10), u: a.u + parseInt(p.units, 10), o: a.o + parseInt(p.occupied, 10), r: a.r + parseInt(p.open, 10) }),
    { b: 0, u: 0, o: 0, r: 0 },
  );

  // Real mode maps the SERVER's overview onto the same nine tiles; Demo Mode
  // keeps deriving them from its own seed exactly as before.
  const ov = live.overview;
  const totals = DEMO_MODE || !ov
    ? demoTotals
    : { b: ov.buildingsCount, u: ov.unitsCount, o: ov.occupiedCount, r: ov.openReportsCount };
  const vacant = DEMO_MODE || !ov ? demoTotals.u - demoTotals.o : ov.vacantCount;
  const sat = DEMO_MODE
    ? (projects.length ? (projects.reduce((a, p) => a + parseFloat(p.satisfaction), 0) / projects.length).toFixed(1) : "—")
    // Honest "—": the Backend returns null because no rating model exists.
    : (ov?.satisfaction == null ? "—" : String(ov.satisfaction));
  const projectCount = DEMO_MODE ? (realCount ?? projects.length) : (ov?.projectsCount ?? 0);
  const residents = DEMO_MODE ? "249" : String(ov?.homeownersCount ?? 0);
  const closedReports = DEMO_MODE ? "612" : String(ov?.closedReportsCount ?? 0);
  const occUnit = DEMO_MODE
    ? (projects.length ? Math.round((demoTotals.o / demoTotals.u) * 100) + "%" : "")
    : `${ov?.occupiedPercent ?? 0}%`;
  const satUnit = DEMO_MODE ? (projects.length ? "من 5" : "") : (ov?.satisfaction == null ? "" : "من 5");

  // The project cards: real rows in real mode, the seed rows in Demo Mode.
  const rows: ProjectRowVM[] = DEMO_MODE
    ? projects
    : live.projects.map((p) => ({
        id: p.id,
        name: p.name,
        // `ProjectStatus` is the Prisma enum (DRAFT/ACTIVE/ARCHIVED). Rendering
        // it raw prints Latin machine text into an Arabic screen; an unmapped
        // future value still shows itself rather than disappearing.
        status: PROJECT_STATUS_AR[p.status] ?? p.status,
        city: p.city,
        statusFg: p.isActive ? "var(--ok)" : "var(--t-secondary)",
        buildings: String(p.buildingsCount),
        units: String(p.unitsCount),
        // Per-project occupancy/open/satisfaction are not on the summary DTO;
        // the screen's own "—" says so rather than a number being invented.
        occupied: "—",
        open: "—",
        satisfaction: "—",
        openFg: "var(--t-primary)",
        health: healthLabel(p.health),
        manager: p.managerName ?? "—",
        contractor: p.primaryContractorName ?? "—",
      }));

  // The activity feed: real audit rows in real mode.
  const activityRows = DEMO_MODE
    ? ACTIVITY
    : live.activity.map((a) => ({
        // The Backend resolves the action code to Arabic itself; rendering
        // `a.action` here would print a raw enum into an Arabic screen.
        title: a.description,
        detail: a.actorName ?? "",
        date: relativeArabicDay(a.timestamp),
        time: "",
        icon: "check" as const,
      }));

  const kpis: { key: string; label: string; value: string; unit: string; icon: React.ReactNode; iconBg: string; iconFg: string; valueColor?: string }[] = [
    { key: "proj", label: "المشاريع", value: String(projectCount), unit: "مشروع", icon: <KpiIcon paths={["M3 21h18", "M5 21V7l7-4 7 4v14", "M10 21v-5h4v5"]} />, iconBg: "var(--g-50)", iconFg: "var(--g-700)" },
    { key: "bldg", label: "المباني", value: String(totals.b), unit: "مبنى", icon: <KpiIcon paths={["M3 21h18", "M6 21V4h7v17", "M13 9h5v12", "M9 8h1", "M9 12h1", "M9 16h1"]} />, iconBg: "var(--g-50)", iconFg: "var(--g-700)" },
    { key: "unit", label: "الوحدات السكنية", value: String(totals.u), unit: "وحدة", icon: <KpiIcon paths={["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M10 21v-6h4v6"]} />, iconBg: "var(--g-50)", iconFg: "var(--g-700)" },
    { key: "occ", label: "الوحدات المشغولة", value: String(totals.o), unit: occUnit, icon: <KpiIcon paths={["M20 6 9 17l-5-5"]} />, iconBg: "var(--ok-bg)", iconFg: "var(--ok)" },
    { key: "vac", label: "الوحدات الشاغرة", value: String(vacant), unit: "وحدة", icon: <KpiIcon paths={["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18"]} />, iconBg: "var(--n-surface2)", iconFg: "var(--t-secondary)" },
    { key: "ppl", label: "السكان المسجلون", value: residents, unit: "ساكن", icon: <KpiIcon paths={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M22 21v-2a4 4 0 0 0-3-3.87"]} />, iconBg: "var(--a-50)", iconFg: "var(--a-700)" },
    { key: "open", label: "البلاغات المفتوحة", value: String(totals.r), unit: "بلاغ", icon: <KpiIcon paths={["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 8v5", "M12 16h.01"]} />, iconBg: "var(--warn-bg)", iconFg: "var(--warn)", valueColor: totals.r > 40 ? "var(--err)" : "var(--warn)" },
    { key: "closed", label: "البلاغات المغلقة", value: closedReports, unit: "بلاغ", icon: <KpiIcon paths={["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M8.5 12.2l2.4 2.4 4.6-4.8"]} />, iconBg: "var(--ok-bg)", iconFg: "var(--ok)" },
    { key: "star", label: "متوسط رضا السكان", value: sat, unit: satUnit, icon: <KpiIcon paths={["m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"]} />, iconBg: "var(--a-50)", iconFg: "var(--a-700)" },
  ];

  const navItems: NavPillItem[] = [
    { key: "dash", label: "لوحة التحكم", current: true, icon: <DashIcon /> },
    { key: "proj", label: "المشاريع", href: SCREEN_PATHS.RE2_ProjectsManagement, icon: <BuildingIcon /> },
    { key: "res", label: "السكان", href: SCREEN_PATHS.RE4_HomeownersManagement, icon: <PeopleIcon /> },
    { key: "con", label: "المقاولون", href: SCREEN_PATHS.RE5_TechniciansManagement, icon: <WrenchIcon /> },
  ];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px 120px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "18px" }}>
          <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <DashIconLg />
          </span>
          <div>
            <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>لوحة التحكم</h1>
            <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>نظرة شاملة على جميع مشاريع الشركة.</div>
          </div>
        </div>

        <CompanyTopNavPills items={navItems} />

        {DEMO_MODE && usingDemoData && (
          <div style={{ marginBottom: "14px" }}>
            <PendingBackendBadge note="الخادم غير متاح حالياً — تُعرض بيانات تجريبية" />
          </div>
        )}
        {DEMO_MODE && !usingDemoData && (
          <div style={{ marginBottom: "14px" }}>
            <PendingBackendBadge note="عدد المشاريع فقط من الخادم الحقيقي — بقية المؤشرات (المباني/الوحدات/البلاغات/السكان/الرضا) بانتظار واجهة تجميع بيانات" />
          </div>
        )}

        {(DEMO_MODE ? loading : live.status === "loading") ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ height: "92px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              {kpis.map((k) => (
                <div key={k.key} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ width: "26px", height: "26px", borderRadius: "var(--r-sm)", background: k.iconBg, color: k.iconFg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{k.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)" }}>{k.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-.5px", color: k.valueColor ?? "var(--t-primary)" }}>{k.value}</span>
                    <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--t-tertiary)" }}>{k.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", margin: "30px 0 14px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>المشاريع</h2>
              <button onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsManagement)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "8px 14px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>
                عرض كل المشاريع
                <ChevronIcon />
              </button>
            </div>

            {rows.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {rows.map((p) => {
                  const h = HEALTH_STYLE[p.health];
                  return (
                    <div key={p.id} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "15px" }}>
                        <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                          <BuildingIcon />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "16px", fontWeight: 700 }}>{p.name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: h.bg, color: h.fg }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: h.dot }} />
                              {p.health}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "5px", fontSize: "12px", color: "var(--t-tertiary)", flexWrap: "wrap" }}>
                            <span>{p.city}</span>
                            <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--n-border-strong)" }} />
                            <span style={{ fontWeight: 600, color: p.statusFg }}>{p.status}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px", marginBottom: "15px" }}>
                        {[
                          ["المباني", p.buildings],
                          ["الوحدات", p.units],
                          ["المشغولة", p.occupied],
                          ["بلاغات مفتوحة", p.open],
                          ["رضا السكان", p.satisfaction],
                        ].map(([label, value]) => (
                          <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}>
                            <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: label === "بلاغات مفتوحة" ? p.openFg : "var(--t-primary)" }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", paddingTop: "14px", borderTop: "1px solid var(--n-border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "2px" }}>مدير المشروع</div>
                            <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{p.manager}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "2px" }}>المقاول الرئيسي</div>
                            <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{p.contractor}</div>
                          </div>
                        </div>
                        <button onClick={() => router.push(SCREEN_PATHS.RE3_ProjectWorkspace(p.id))} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                          عرض المشروع
                          <ChevronIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: "var(--n-surface)", border: "1px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "44px 24px", textAlign: "center" }}>
                <span style={{ width: "54px", height: "54px", borderRadius: "var(--r-lg)", background: "var(--n-surface2)", color: "var(--t-tertiary)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                  <BuildingIcon />
                </span>
                <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>لا توجد مشاريع حتى الآن.</div>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginBottom: "18px" }}>ابدأ بإضافة أول مشروع لتظهر بياناته في لوحة التحكم.</div>
                <button onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsNew)} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 22px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                  إضافة مشروع
                </button>
              </div>
            )}

            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "30px 0 14px" }}>النشاط الأخير</h2>
            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "6px 18px", boxShadow: "var(--sh-1)" }}>
              {activityRows.map((a, i) => (
                <div key={a.title + i} style={{ display: "flex", alignItems: "flex-start", gap: "13px", padding: "15px 0", borderBottom: i === activityRows.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                  <span style={{ width: "32px", height: "32px", borderRadius: "50%", background: ACTIVITY_ICON_STYLE[a.icon].bg, color: ACTIVITY_ICON_STYLE[a.icon].fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", marginTop: "1px" }}>
                    <ActivityIcon kind={a.icon} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>{a.detail}</div>
                  </div>
                  <div style={{ textAlign: "start", flex: "none" }}>
                    <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)" }}>{a.date}</div>
                    <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "2px" }}>{a.time}</div>
                  </div>
                </div>
              ))}
              {/* An audit log with nothing in it yet says so, rather than
                  rendering as a bare empty strip that reads as a failure. */}
              {activityRows.length === 0 && (
                <div style={{ fontSize: "13px", color: "var(--t-tertiary)", padding: "18px 0", textAlign: "center" }}>لا يوجد نشاط مسجّل بعد.</div>
              )}
            </div>

            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "30px 0 14px" }}>إجراءات سريعة</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              <QuickAction onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsNew)} iconBg="var(--g-50)" iconFg="var(--g-700)" icon={<BuildingIconMd />} title="إضافة مشروع" sub="تسجيل مشروع سكني جديد" />
              <QuickAction onClick={() => router.push(SCREEN_PATHS.RE4_HomeownersManagement)} iconBg="var(--a-50)" iconFg="var(--a-700)" icon={<AddPersonIcon />} title="إضافة ساكن" sub="إنشاء حساب وإرسال دعوة تفعيل" />
              <QuickAction onClick={() => router.push(SCREEN_PATHS.RE5_TechniciansManagement)} iconBg="var(--info-bg)" iconFg="var(--info)" icon={<WrenchIcon />} title="إضافة مقاول" sub="ربط مقاول بمشروع وتخصص" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuickAction({ onClick, icon, iconBg, iconFg, title, sub }: { onClick: () => void; icon: React.ReactNode; iconBg: string; iconFg: string; title: string; sub: string }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "start", background: "var(--n-surface)", border: "1.5px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px", boxShadow: "var(--sh-1)", cursor: "pointer" }}>
      <span style={{ width: "38px", height: "38px", borderRadius: "var(--r-md)", background: iconBg, color: iconFg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--t-primary)" }}>{title}</span>
        <span style={{ display: "block", fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "2px" }}>{sub}</span>
      </span>
    </button>
  );
}

// ---------- icons ----------

function KpiIcon({ paths }: { paths: string[] }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
/** `ProjectStatus` in the register RE1's card already uses. */
const PROJECT_STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "قيد التنفيذ",
  ARCHIVED: "غير نشط",
};

const ACTIVITY_ICON_STYLE = {
  user: { bg: "var(--g-50)", fg: "var(--g-700)" },
  key: { bg: "var(--a-50)", fg: "var(--a-700)" },
  check: { bg: "var(--ok-bg)", fg: "var(--ok)" },
  move: { bg: "var(--info-bg)", fg: "var(--info)" },
  build: { bg: "var(--n-surface2)", fg: "var(--t-secondary)" },
} as const;
function ActivityIcon({ kind }: { kind: keyof typeof ACTIVITY_ICON_STYLE }) {
  const paths: Record<keyof typeof ACTIVITY_ICON_STYLE, string[]> = {
    user: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"],
    key: ["M15 7a4 4 0 1 0-3.9 5L4 19v2h3l1-1h2l1-1v-2l3-3"],
    check: ["M20 6 9 17l-5-5"],
    move: ["M5 12h14", "M13 6l6 6-6 6"],
    build: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M12 12v5", "M9.5 14.5h5"],
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
function DashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
}
function DashIconLg() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
}
function BuildingIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M10 21v-5h4v5" /></svg>;
}
function BuildingIconMd() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V9l7-4 7 4v12" /><path d="M12 12v5" /><path d="M9.5 14.5h5" /></svg>;
}
function PeopleIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
}
function AddPersonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></svg>;
}
function WrenchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>;
}
function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
}
