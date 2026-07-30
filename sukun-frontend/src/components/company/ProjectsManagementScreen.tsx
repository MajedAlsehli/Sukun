"use client";

/**
 * RE2 · إدارة المشاريع — ported from `Sakn Projects Management.dc.html`
 * (Sakn.d.zip, 2026-07-27 — the sole production source per current
 * instruction). Markup/copy/wizard steps/validation ported verbatim; the
 * design-tool-only `emptyState` preview prop is dropped (dev tooling, not
 * product — same category as `support.js`).
 *
 * Real backend (`lib/projects.ts`, Task 003, running): `GET /projects` and
 * `POST /projects` are wired for real. Two things the source screen's own
 * rich card needs still have no backend to answer them in this codebase:
 *   1. Portfolio aggregates per project (buildings/units/occupied/open
 *      reports/satisfaction/health/manager+contractor NAME) — `GET /projects`
 *      only returns `managerId`, not these rollups (no Buildings/Units/
 *      Reports aggregation endpoint exists yet). Real rows render with
 *      these fields defaulted and a `PendingBackendBadge` note, per the
 *      "Pending Backend Integration" convention — the card itself is never
 *      simplified or hidden.
 *   2. The manager/contractor PICKERS (wizard steps 4-5) — no `/managers`
 *      or `/contractors` list endpoint exists anywhere in the backend, so
 *      these always run on `lib/demo/projectsFixtures.ts` (the screen's own
 *      seed data). A selection there is real UI state and flows through the
 *      whole review step, but is never sent as `managerId`/`technicianId`
 *      on create (there is no way to resolve a fixture id to a real row) —
 *      the create payload always sends `null` for both, matching "leave
 *      only the API integration as TODO."
 * `withDemoFallback` (Demo Mode) covers the rest: if `GET /projects` is
 * unreachable at all (offline backend, or a Demo Mode session's sentinel
 * token, which the real backend rejects the same way), the full seed list
 * renders instead — the exact content this production screen ships with.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { CompanyTopNavPills, type NavPillItem } from "@/components/company/CompanyTopNavPills";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { COMPANY_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_CONTRACTORS, DEMO_MANAGERS, DEMO_PROJECTS, type DemoPickOption } from "@/lib/demo/projectsFixtures";
import { DEMO_MODE } from "@/lib/demo/config";
import { backendCompany, type ProjectDto } from "@/lib/backend/company";
import { useAsyncResource } from "@/lib/hooks/useAsyncResource";
import { itemsOf, useCompanyProjectsSummary, useProjects } from "@/lib/hooks/useCompany";
import { arabicMessageFor } from "@/lib/backend/errors";
import { createProject, updateProject, updateProjectStatus } from "@/lib/projects";

// ---------- view-model ----------

interface ProjectCardVM {
  id: string;
  name: string;
  city: string;
  district: string;
  desc: string;
  status: string;
  statusFg: string;
  buildings: string;
  units: string;
  occupied: string;
  open: string;
  satisfaction: string;
  openFg: string;
  health: "ممتاز" | "يحتاج متابعة" | "حرج";
  manager: string;
  contractor: string;
  created: string;
  active: boolean;
  simulatedStats: boolean;
  /** Cover photo. Demo rows carry one; API projects have no image field yet,
   *  so those keep the icon tile. */
  cover?: string;
}

const HEALTH_STYLE: Record<ProjectCardVM["health"], { bg: string; fg: string; dot: string }> = {
  "ممتاز": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "يحتاج متابعة": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "حرج": { bg: "var(--err-bg)", fg: "var(--err-strong)", dot: "var(--err)" },
};

function demoRowToVM(p: (typeof DEMO_PROJECTS)[number]): ProjectCardVM {
  return {
    id: p.id, name: p.name, city: p.city, district: p.district, desc: p.desc,
    status: p.active ? p.status : "غير نشط",
    statusFg: !p.active ? "var(--t-tertiary)" : p.status === "مكتمل" ? "var(--ok)" : p.status === "متوقف" ? "var(--err)" : "var(--a-700)",
    buildings: String(p.buildings), units: String(p.units), occupied: String(p.occupied), open: String(p.open),
    satisfaction: p.satisfaction,
    openFg: p.open > 20 ? "var(--err)" : p.open > 10 ? "var(--warn)" : "var(--t-primary)",
    health: p.health, manager: p.manager, contractor: p.contractor, created: p.created, active: p.active,
    simulatedStats: false, cover: p.cover,
  };
}

/**
 * A real `ProjectDto` (+ its `projects-summary` row, when present) -> the card
 * this screen renders.
 *
 * `buildingsCount`/`unitsCount` are on the project record itself and the
 * manager, contractor and server-computed health are on the summary row — the
 * same values `/company` already displays. Rendering "—" for all six while the
 * dashboard showed the real ones is what made the two screens contradict each
 * other. `simulatedStats` is false because nothing here is simulated any more;
 * a genuinely unknown value stays "—".
 */
function realProjectToVM(
  p: ProjectDto,
  summary?: { manager: string; contractor: string; health?: string },
): ProjectCardVM {
  const status = String(p.status ?? "").toUpperCase();
  const statusLabel =
    status === "COMPLETED" ? "مكتمل" : status === "STOPPED" ? "متوقف" : status === "ARCHIVED" ? "غير نشط" : "قيد التنفيذ";
  const active = p.isActive && status !== "ARCHIVED";
  const health =
    summary?.health === "CRITICAL" ? "حرج" : summary?.health === "AT_RISK" ? "يحتاج متابعة" : summary?.health === "HEALTHY" ? "ممتاز" : "يحتاج متابعة";
  return {
    id: p.id, name: p.name, city: p.city, district: p.district ?? "—", desc: p.description ?? "",
    status: statusLabel,
    statusFg: !active ? "var(--t-tertiary)" : status === "COMPLETED" ? "var(--ok)" : status === "STOPPED" ? "var(--err)" : "var(--a-700)",
    buildings: String(p.buildingsCount ?? 0),
    units: String(p.unitsCount ?? 0),
    // Not on this endpoint; the project workspace owns occupancy and reports.
    occupied: "—", open: "—", satisfaction: "—", openFg: "var(--t-primary)",
    health,
    manager: summary?.manager ?? "—",
    contractor: summary?.contractor ?? "—",
    created: new Date(p.createdAt).toLocaleDateString("ar-SA"), active,
    simulatedStats: false,
  };
}

// ---------- wizard draft ----------

interface BuildingDraft { k: number; name: string; number: string; floors: string }
interface UnitConfigDraft { perFloor: string; area: string; beds: string; baths: string; parking: string }
interface ProjectDraft {
  id: string | null; name: string; city: string; district: string; desc: string;
  buildings: BuildingDraft[]; units: Record<number, UnitConfigDraft>;
  manager: DemoPickOption | null; contractor: DemoPickOption | null;
}

function blankDraft(): ProjectDraft {
  return { id: null, name: "", city: "", district: "", desc: "", buildings: [{ k: 1, name: "مبنى A", number: "01", floors: "5" }], units: {}, manager: null, contractor: null };
}

const STEP_LABELS = ["المعلومات", "المباني", "الوحدات", "مدير المشروع", "المقاول", "المراجعة"];
const FILTERS = ["الكل", "قيد التنفيذ", "مكتمل", "متوقف", "الأعلى رضاً", "الأكثر بلاغات"] as const;

const inputStyle: React.CSSProperties = {
  width: "100%", fontSize: "13.5px", padding: "11px 13px", border: "1.5px solid var(--n-border-strong)",
  borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none",
};

export function ProjectsManagementScreen({ startInWizard = false }: { startInWizard?: boolean }) {
  return (
    <RouteGuard allow={COMPANY_ONLY}>
      <ProjectsManagementInner startInWizard={startInWizard} />
    </RouteGuard>
  );
}

function ProjectsManagementInner({ startInWizard }: { startInWizard: boolean }) {
  const router = useRouter();

  const [screen, setScreen] = useState<"list" | "wizard">(startInWizard ? "wizard" : "list");
  const [loading, setLoading] = useState(true);
  const [confirm, confirmDialog] = useConfirm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("الكل");
  const [projects, setProjects] = useState<ProjectCardVM[]>([]);
  const [usingDemoData, setUsingDemoData] = useState(false);

  const [step, setStep] = useState(1);
  const [draft, setDraftState] = useState<ProjectDraft>(blankDraft());
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [touched, setTouched] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [toast, setToast] = useState("");

  /**
   * Task 3 · the manager and contractor pickers.
   *
   * Demo Mode keeps `DEMO_MANAGERS` / `DEMO_CONTRACTORS`. Real mode searches
   * the Backend's own `GET /api/managers?q=` and `GET /api/contractors?q=`, so
   * the id that ends up on `POST /api/projects` is a REAL manager and a REAL
   * contractor — both are required by `createProjectSchema` and neither can be
   * invented client-side.
   */
  const isMgrStepNow = step === 4;
  const picker = useAsyncResource(
    (sig) =>
      isMgrStepNow
        ? backendCompany.searchManagers(pickQuery, { signal: sig })
        : backendCompany.searchContractors(pickQuery, { signal: sig }),
    [isMgrStepNow, pickQuery],
    { enabled: !DEMO_MODE && (step === 4 || step === 5) },
  );

  /**
   * ─── RE2's project list ───────────────────────────────────────────────────
   *
   * This screen used to load through `lib/projects.ts#listProjects()`, which
   * declares `Promise<PublicProject[]>`. `GET /api/projects` does NOT answer an
   * array — `projectService.list` returns `{items,total,page,pageSize}` and
   * `sendSuccess` puts that object in `data`. So `real.map(...)` threw
   * `real.map is not a function` on every load, the `.catch` below emptied the
   * list and flashed the generic Arabic error, and the screen rendered
   * "لا توجد مشاريع" together with "حدث خطأ غير متوقع" — on a company that has
   * a project, which `/company` displays correctly through the canonical hook.
   * There was no HTTP failure to see in the network panel, because the request
   * had succeeded.
   *
   * It now uses the canonical `useProjects()` hook (`backendCompany.listProjects`,
   * correctly typed as a page) plus `useCompanyProjectsSummary()` for the real
   * manager/contractor/health each card shows. Loading, failure and emptiness
   * are three distinct states rather than one.
   */
  const liveProjects = useProjects();
  const liveSummary = useCompanyProjectsSummary();

  useEffect(() => {
    if (DEMO_MODE) {
      setProjects(DEMO_PROJECTS.map(demoRowToVM));
      setUsingDemoData(true);
      setLoading(false);
      return;
    }
    if (liveProjects.status === "loading" || liveProjects.status === "idle") {
      setLoading(true);
      return;
    }
    setLoading(false);
    setUsingDemoData(false);
    if (liveProjects.status === "error") {
      // An error is NOT an empty list. `loadFailed` below renders the failure.
      setProjects([]);
      return;
    }
    const summaryById = new Map(liveSummary.projects.map((p) => [p.id, p]));
    setProjects(liveProjects.projects.map((p) => realProjectToVM(p, summaryById.get(p.id))));
  }, [liveProjects.status, liveProjects.projects, liveSummary.projects]);

  const loadFailed = !DEMO_MODE && liveProjects.status === "error";

  useEffect(() => {
    const hash = decodeURIComponent((window.location.hash || "").replace("#", ""));
    if (hash === "new") {
      setScreen("wizard");
      setMode("create");
      setStep(1);
      setDraft(blankDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  function setDraft(patch: Partial<ProjectDraft>) {
    setDraftState((d) => ({ ...d, ...patch }));
  }

  function unitsFor(d: ProjectDraft): number {
    return d.buildings.reduce((sum, b) => {
      const cfg = d.units[b.k] ?? {};
      const per = parseInt(cfg.perFloor || "8", 10) || 0;
      const fl = parseInt(b.floors || "0", 10) || 0;
      return sum + per * fl;
    }, 0);
  }

  const q = query.trim();
  let rows = projects.filter((p) => !q || p.name.includes(q) || p.city.includes(q) || p.manager.includes(q));
  if (filter === "قيد التنفيذ" || filter === "مكتمل" || filter === "متوقف") rows = rows.filter((p) => p.status === filter);
  if (filter === "الأعلى رضاً") rows = [...rows].sort((a, b) => parseFloat(b.satisfaction || "0") - parseFloat(a.satisfaction || "0"));
  if (filter === "الأكثر بلاغات") rows = [...rows].sort((a, b) => parseInt(b.open || "0", 10) - parseInt(a.open || "0", 10));

  const hasResults = !loading && rows.length > 0;
  // A failed load is NOT an empty portfolio — the two render differently below.
  const isEmpty = !loading && !loadFailed && rows.length === 0;
  const anySimulated = rows.some((r) => r.simulatedStats);

  function startCreate() {
    setScreen("wizard");
    setMode("create");
    setStep(1);
    setDraft(blankDraft());
    setTouched(false);
    setPickQuery("");
  }
  function cancelWizard() {
    setScreen("list");
    setStep(1);
    setTouched(false);
  }
  function startEdit(p: ProjectCardVM) {
    setScreen("wizard");
    setMode("edit");
    setStep(1);
    setTouched(false);
    setPickQuery("");
    setDraftState({
      id: p.id, name: p.name, city: p.city, district: p.district, desc: p.desc,
      buildings: [{ k: 1, name: "مبنى A", number: "01", floors: "5" }],
      units: {},
      manager: DEMO_MANAGERS.find((m) => m.name === p.manager) ?? null,
      contractor: DEMO_CONTRACTORS.find((c) => c.name === p.contractor) ?? null,
    });
  }

  async function toggleActive(p: ProjectCardVM) {
    const nextActive = !p.active;

    if (!nextActive) {
      const ok = await confirm({
        title: "تعطيل المشروع؟",
        body: `سيتوقّف عرض «${p.name}» للمستفيدين ولن تُقبل عليه حجوزات جديدة. لا يُحذف المشروع، وسجلّ البلاغات يبقى كاملاً.`,
        confirmLabel: "تعطيل المشروع",
        destructive: true,
      });
      if (!ok) return;
    }

    // Real mode: ask FIRST, then reflect. The previous best-effort version
    // flipped the card locally and swallowed the rejection, which made the UI
    // claim a state change the Backend had refused.
    if (!DEMO_MODE) {
      try {
        await updateProjectStatus(p.id, nextActive);
      } catch (err) {
        flash(arabicMessageFor(err));
        return;
      }
    }

    setProjects((list) => list.map((x) => (x.id === p.id ? { ...x, active: nextActive, status: nextActive ? (parseInt(x.occupied, 10) > 0 ? "قيد التنفيذ" : "متوقف") : "متوقف" } : x)));
    flash(p.active ? "تم تعطيل المشروع — يبقى قابلاً للقراءة والبحث." : "تمت إعادة تفعيل المشروع.");
  }

  function validateStep(d: ProjectDraft, currentStep: number): boolean {
    if (currentStep === 1) return !!(d.name.trim() && d.city.trim());
    if (currentStep === 2) return d.buildings.length > 0 && d.buildings.every((b) => b.name.trim() && String(b.floors).trim());
    if (currentStep === 4) return !!d.manager;
    if (currentStep === 5) return !!d.contractor;
    return true;
  }

  async function next() {
    if (!validateStep(draft, step)) {
      setTouched(true);
      return;
    }
    if (step < 6) {
      setStep(step + 1);
      setTouched(false);
      setPickQuery("");
      return;
    }

    const totalUnits = unitsFor(draft);
    const editing = mode === "edit";

    if (editing && draft.id) {
      try {
        const updated = await updateProject(draft.id, { name: draft.name, city: draft.city, district: draft.district, description: draft.desc || null });
        setProjects((list) => list.map((p) => (p.id === draft.id ? { ...p, name: updated.name, city: updated.city, district: updated.district, desc: updated.description ?? "" } : p)));
      } catch (err) {
        // Real mode: a refused edit stays refused. The wizard stays open with
        // the real reason rather than the list showing a save that never
        // happened. Demo Mode keeps its local-only behaviour.
        if (!DEMO_MODE) {
          flash(arabicMessageFor(err));
          return;
        }
        setProjects((list) => list.map((p) => (p.id === draft.id ? { ...p, name: draft.name, city: draft.city, district: draft.district, desc: draft.desc } : p)));
      }
      setScreen("list");
      setStep(1);
      setTouched(false);
      flash("تم حفظ تعديلات المشروع.");
      return;
    }

    const payload = {
      name: draft.name,
      city: draft.city,
      district: draft.district,
      // `createProjectSchema` has `description: z.string().optional()` — an
      // absent field, not a null one.
      description: draft.desc || undefined,
      buildings: draft.buildings.map((b) => {
        const cfg = draft.units[b.k] ?? { perFloor: "8", area: "140", beds: "3", baths: "2", parking: "1" };
        return {
          name: b.name, number: b.number, floors: parseInt(b.floors, 10) || 1,
          units: {
            perFloor: parseInt(cfg.perFloor || "8", 10) || 1,
            area: parseFloat(cfg.area || "140") || 1,
            beds: parseInt(cfg.beds || "3", 10) || 0,
            baths: parseInt(cfg.baths || "2", 10) || 0,
            parking: parseInt(cfg.parking || "1", 10) || 0,
          },
        };
      }),
      // `createProjectSchema` REQUIRES both. Steps 4 and 5 collect them, and in
      // real mode they are ids the Backend's own pickers returned.
      managerId: draft.manager?.id ?? "",
      primaryContractorId: draft.contractor?.id ?? "",
    };

    try {
      await createProject(payload);
      // Re-read rather than projecting the create response: `POST /projects`
      // answers the bare project record, without the rollups and the
      // manager/contractor names the card renders. Asking the list again is the
      // only way the new row is as complete as its neighbours.
      liveProjects.reload();
      liveSummary.reload();
    } catch (err) {
      // Real mode: no project row is fabricated for a creation the Backend
      // refused. The wizard stays open with the real reason.
      if (!DEMO_MODE) {
        flash(arabicMessageFor(err));
        return;
      }
      setProjects((list) => [
        {
          id: draft.id || "p" + Date.now(), name: draft.name, city: draft.city, district: draft.district, desc: draft.desc,
          status: "قيد التنفيذ", statusFg: "var(--a-700)",
          buildings: String(draft.buildings.length), units: String(totalUnits), occupied: "0", open: "0", satisfaction: "—", openFg: "var(--t-primary)",
          health: "ممتاز", manager: draft.manager?.name ?? "—", contractor: draft.contractor?.name ?? "—",
          created: "٢٦ يوليو ٢٠٢٦", active: true, simulatedStats: false,
        },
        ...list,
      ]);
    }
    setScreen("list");
    setStep(1);
    setTouched(false);
    flash("تم إنشاء المشروع مع المباني والوحدات والتعيينات.");
  }

  function prev() {
    setStep((s) => Math.max(1, s - 1));
    setTouched(false);
  }

  const isMgrStep = step === 4;
  const pickPool = isMgrStep ? DEMO_MANAGERS : DEMO_CONTRACTORS;
  const pq = pickQuery.trim();
  const selected = isMgrStep ? draft.manager : draft.contractor;
  // Demo Mode filters its own fixture pool; real mode renders whatever the
  // Backend's `?q=` search returned, in the same option shape.
  const pickOptions: DemoPickOption[] = DEMO_MODE
    ? pickPool.filter((o) => !pq || o.name.includes(pq) || o.meta.includes(pq))
    : itemsOf(picker.data).map((o) => ({
        id: o.id,
        name: o.name,
        meta: o.email ?? o.phone ?? "",
      }));

  const totalUnits = useMemo(() => unitsFor(draft), [draft]);

  const navItems: NavPillItem[] = [
    { key: "dash", label: "لوحة التحكم", href: SCREEN_PATHS.RE1_CompanyDashboard, icon: <DashIcon /> },
    { key: "proj", label: "المشاريع", current: true, icon: <BuildingIcon /> },
    { key: "res", label: "السكان", href: SCREEN_PATHS.RE4_HomeownersManagement, icon: <PeopleIcon /> },
    { key: "con", label: "المقاولون", href: SCREEN_PATHS.RE5_TechniciansManagement, icon: <WrenchIcon /> },
  ];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      {confirmDialog}
      <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px 130px" }}>
        {screen === "list" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "18px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <BuildingIconLg />
                </span>
                <div>
                  <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إدارة المشاريع</h1>
                  <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>إدارة جميع المشاريع السكنية التابعة للشركة.</div>
                </div>
              </div>
              <button onClick={startCreate} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, padding: "12px 20px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)", whiteSpace: "nowrap" }}>
                <PlusIcon />
                إضافة مشروع
              </button>
            </div>

            <CompanyTopNavPills items={navItems} />

            {anySimulated && (
              <div style={{ marginBottom: "14px" }}>
                <PendingBackendBadge note="مؤشرات المباني/الوحدات/البلاغات/الرضا لكل مشروع بانتظار واجهة تجميع بيانات من المباني والوحدات والبلاغات" />
              </div>
            )}

            <div style={{ position: "relative", marginBottom: "14px" }}>
              <span style={{ position: "absolute", top: "50%", insetInlineStart: "14px", transform: "translateY(-50%)" }}>
                <SearchIcon />
              </span>
              <input
                style={{ width: "100%", fontSize: "14px", padding: "12px 14px 12px 42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث باسم المشروع أو المدينة أو مدير المشروع"
                autoComplete="off"
              />
            </div>

            <div data-sk-scroll-row style={{ display: "flex", gap: "8px", marginBottom: "18px", overflowX: "auto", paddingBottom: "2px" }}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", borderRadius: "var(--r-full)", cursor: "pointer", whiteSpace: "nowrap",
                    border: `1.5px solid ${filter === f ? "var(--g-900)" : "var(--n-border-strong)"}`,
                    background: filter === f ? "var(--g-900)" : "var(--n-surface)",
                    color: filter === f ? "var(--t-on-dark)" : "var(--t-secondary)",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: "190px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />
                ))}
              </div>
            )}

            {hasResults && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {rows.map((p) => {
                  const h = HEALTH_STYLE[p.health];
                  return (
                    <div key={p.id} className="pm-card" style={{ display: "flex", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", overflow: "hidden", boxShadow: "var(--sh-1)", opacity: p.active ? 1 : 0.62 }}>
                      <div style={{ width: "190px", flex: "none", background: p.cover ? `url(${p.cover}) center/cover` : "linear-gradient(150deg,var(--g-800),var(--g-600))", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        {!p.cover && <BuildingIconLg color="var(--a-300)" />}
                        {!p.cover && <span style={{ position: "absolute", bottom: "10px", insetInlineEnd: "12px", fontSize: "10px", fontWeight: 600, color: "var(--t-on-dark-soft)" }}>صورة المشروع</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "16px", fontWeight: 700 }}>{p.name}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: h.bg, color: h.fg }}>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: h.dot }} />
                                {p.health}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "5px", fontSize: "12px", color: "var(--t-tertiary)", flexWrap: "wrap" }}>
                              <span>{p.city}</span>
                              <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--n-border-strong)" }} />
                              <span style={{ fontWeight: 600, color: p.statusFg }}>{p.status}</span>
                              <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--n-border-strong)" }} />
                              <span>أُنشئ {p.created}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "9px", marginBottom: "13px" }}>
                          {[
                            ["المباني", p.buildings],
                            ["الوحدات", p.units],
                            ["المشغولة", p.occupied],
                            ["بلاغات مفتوحة", p.open],
                            ["رضا السكان", p.satisfaction],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "10px 11px" }}>
                              <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "3px" }}>{label}</div>
                              <div style={{ fontSize: "14.5px", fontWeight: 700, color: label === "بلاغات مفتوحة" ? p.openFg : "var(--t-primary)" }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", paddingTop: "13px", borderTop: "1px solid var(--n-border)" }}>
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
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <button onClick={() => toggleActive(p)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 15px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-tertiary)", cursor: "pointer" }}>
                              {p.active ? "تعطيل المشروع" : "إعادة التفعيل"}
                            </button>
                            <button onClick={() => startEdit(p)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>
                              <EditIcon />
                              تعديل المشروع
                            </button>
                            <button onClick={() => router.push(SCREEN_PATHS.RE3_ProjectWorkspace(p.id))} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                              عرض المشروع
                              <ChevronIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {loadFailed && (
              <div style={{ background: "var(--n-surface)", border: "1px dashed var(--err-border)", borderRadius: "var(--r-lg)", padding: "46px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>تعذّر تحميل المشاريع.</div>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginBottom: "18px" }}>{liveProjects.errorMessage ?? "حدثت مشكلة أثناء جلب قائمة المشاريع."}</div>
                <button onClick={liveProjects.reload} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 22px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                  إعادة المحاولة
                </button>
              </div>
            )}

            {isEmpty && (
              <div style={{ background: "var(--n-surface)", border: "1px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "46px 24px", textAlign: "center" }}>
                <span style={{ width: "54px", height: "54px", borderRadius: "var(--r-lg)", background: "var(--n-surface2)", color: "var(--t-tertiary)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                  <BuildingIcon />
                </span>
                <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>{projects.length === 0 ? "لا توجد مشاريع." : "لا توجد نتائج مطابقة."}</div>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginBottom: "18px" }}>{projects.length === 0 ? "ابدأ بإنشاء أول مشروع سكني للشركة." : "جرّب تعديل البحث أو الفلتر."}</div>
                <button onClick={startCreate} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 22px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                  إنشاء مشروع جديد
                </button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", fontSize: "11.5px", color: "var(--t-tertiary)" }}>
              <InfoIcon />
              لا يمكن حذف المشاريع — يمكن تعطيلها فقط للحفاظ على سجل البلاغات التاريخي.
              {usingDemoData && <PendingBackendBadge note="الخادم غير متاح حالياً — تُعرض بيانات تجريبية" />}
            </div>
          </div>
        )}

        {screen === "wizard" && (
          <div>
            <button onClick={cancelWizard} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, padding: "8px 15px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer", marginBottom: "18px" }}>
              <BackChevronIcon />
              الرجوع إلى المشاريع
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "20px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <BuildingIconLg />
              </span>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{mode === "edit" ? "تعديل المشروع" : "إنشاء مشروع جديد"}</h1>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>
                  {mode === "edit" ? "جميع البيانات محمّلة مسبقاً — عدّل ما تحتاجه ثم احفظ." : "ستة خطوات لإنشاء المشروع والمباني والوحدات والتعيينات."}
                </div>
              </div>
            </div>

            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", boxShadow: "var(--sh-1)", marginBottom: "18px" }}>
              <div data-sk-scroll-row style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginBottom: "12px", overflowX: "auto" }}>
                {STEP_LABELS.map((label, i) => {
                  const n = i + 1;
                  const done = step > n;
                  const cur = step === n;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none", paddingInlineStart: "6px" }}>
                      <span style={{ width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11.5px", fontWeight: 700, flex: "none", background: cur ? "var(--g-900)" : done ? "var(--g-50)" : "var(--n-surface2)", color: cur ? "var(--t-on-dark)" : done ? "var(--g-700)" : "var(--t-tertiary)" }}>
                        {n}
                      </span>
                      <span style={{ fontSize: "11.5px", fontWeight: 600, color: cur ? "var(--t-primary)" : "var(--t-tertiary)", whiteSpace: "nowrap" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ height: "5px", borderRadius: "var(--r-full)", background: "var(--n-surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "var(--r-full)", background: "linear-gradient(90deg,var(--g-600),var(--a-400))", width: Math.round((step / 6) * 100) + "%" }} />
              </div>
            </div>

            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "22px" }}>
              {step === 1 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>معلومات المشروع</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>اسم المشروع</label>
                      <input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="مثال: مشروع أوج الشمال" autoComplete="off" />
                      {touched && step === 1 && !draft.name.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>المدينة</label>
                      <input style={inputStyle} value={draft.city} onChange={(e) => setDraft({ city: e.target.value })} placeholder="الرياض" autoComplete="off" />
                      {touched && step === 1 && !draft.city.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>الحي</label>
                      <input style={inputStyle} value={draft.district} onChange={(e) => setDraft({ district: e.target.value })} placeholder="حي الياسمين" autoComplete="off" />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>وصف المشروع</label>
                      <textarea style={{ ...inputStyle }} rows={3} value={draft.desc} onChange={(e) => setDraft({ desc: e.target.value })} placeholder="وصف مختصر للمشروع وموقعه ومكوناته" />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>صورة غلاف المشروع</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "14px", border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-md)", padding: "18px", background: "var(--n-surface2)" }}>
                        <span style={{ width: "56px", height: "56px", borderRadius: "var(--r-md)", background: "linear-gradient(150deg,var(--g-800),var(--g-600))", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                          <UploadIcon />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 600 }}>ارفع صورة غلاف المشروع</div>
                          <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>JPG أو PNG · الأبعاد المفضلة 1600×900</div>
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)" }}>اختيار ملف</span>
                      </div>
                      <div style={{ marginTop: "8px" }}>
                        <PendingBackendBadge note="لا توجد وحدة تخزين ملفات في الخادم بعد" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700 }}>المباني</div>
                      <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>أضف مباني المشروع — يمكن تعديلها أو حذفها قبل إنشاء الوحدات.</div>
                    </div>
                    <button
                      onClick={() => setDraft({ buildings: [...draft.buildings, { k: Date.now(), name: "مبنى " + String.fromCharCode(65 + draft.buildings.length), number: "0" + (draft.buildings.length + 1), floors: "5" }] })}
                      style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}
                    >
                      <PlusIcon />
                      إضافة مبنى
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                    {draft.buildings.map((b, i) => (
                      <div key={b.k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "11px", alignItems: "end", background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "14px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>اسم المبنى</label>
                          <input style={inputStyle} value={b.name} onChange={(e) => setDraft({ buildings: draft.buildings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="مبنى A" />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم المبنى</label>
                          <input style={inputStyle} value={b.number} onChange={(e) => setDraft({ buildings: draft.buildings.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)) })} placeholder="01" />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>عدد الطوابق</label>
                          <input style={inputStyle} value={b.floors} onChange={(e) => setDraft({ buildings: draft.buildings.map((x, j) => (j === i ? { ...x, floors: e.target.value } : x)) })} placeholder="5" />
                        </div>
                        <button
                          onClick={() => setDraft({ buildings: draft.buildings.filter((_, j) => j !== i) })}
                          title="حذف المبنى"
                          style={{ width: "42px", height: "42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    {draft.buildings.length === 0 && (
                      <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-md)", padding: "30px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>لم تتم إضافة أي مبنى بعد.</div>
                    )}
                    {touched && step === 2 && draft.buildings.length === 0 && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)" }}>يجب إضافة مبنى واحد على الأقل</div>}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>الوحدات السكنية</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "16px" }}>حدّد عدد الوحدات في الطابق ومواصفاتها الافتراضية — يولّد النظام الوحدات تلقائياً لكل مبنى.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {draft.buildings.map((b) => {
                      const cfg: UnitConfigDraft = draft.units[b.k] ?? { perFloor: "8", area: "140", beds: "3", baths: "2", parking: "1" };
                      const per = parseInt(cfg.perFloor || "0", 10) || 0;
                      const fl = parseInt(b.floors || "0", 10) || 0;
                      const set = (k: keyof UnitConfigDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
                        setDraft({ units: { ...draft.units, [b.k]: { ...cfg, [k]: e.target.value } } });
                      return (
                        <div key={b.k} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "13px", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                              <span style={{ width: "30px", height: "30px", borderRadius: "var(--r-sm)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                                <BuildingIcon />
                              </span>
                              <span style={{ fontSize: "13.5px", fontWeight: 700 }}>{b.name} · {b.floors || 0} طوابق</span>
                            </div>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, padding: "5px 12px", borderRadius: "var(--r-full)", background: "var(--g-50)", color: "var(--g-700)" }}>{per * fl} وحدة</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px" }}>
                            <div><label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "5px" }}>وحدات/طابق</label><input style={inputStyle} value={cfg.perFloor} onChange={set("perFloor")} placeholder="8" /></div>
                            <div><label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "5px" }}>المساحة م²</label><input style={inputStyle} value={cfg.area} onChange={set("area")} placeholder="140" /></div>
                            <div><label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "5px" }}>غرف النوم</label><input style={inputStyle} value={cfg.beds} onChange={set("beds")} placeholder="3" /></div>
                            <div><label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "5px" }}>دورات المياه</label><input style={inputStyle} value={cfg.baths} onChange={set("baths")} placeholder="2" /></div>
                            <div><label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "5px" }}>مواقف</label><input style={inputStyle} value={cfg.parking} onChange={set("parking")} placeholder="1" /></div>
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", marginTop: "11px" }}>
                            {fl} طوابق × {per} وحدات = {per * fl} وحدة · {cfg.area || 0} م² · {cfg.beds || 0} غرف · {cfg.baths || 0} دورات مياه · {cfg.parking || 0} موقف
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(step === 4 || step === 5) && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>{isMgrStep ? "تعيين مدير المشروع" : "تعيين المقاول الرئيسي"}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "10px" }}>{isMgrStep ? "مدير واحد فقط لكل مشروع." : "مقاول رئيسي واحد فقط في المرحلة الحالية."}</div>
                  {/* Real mode searches GET /api/managers?q= and
                      /api/contractors?q=, so the "no API yet" note is Demo-only. */}
                  {DEMO_MODE && (
                    <div style={{ marginBottom: "14px" }}>
                      <PendingBackendBadge note="لا توجد واجهة برمجية لقائمة المديرين/المقاولين بعد — قائمة تجريبية" />
                    </div>
                  )}
                  <div style={{ position: "relative", marginBottom: "14px" }}>
                    <span style={{ position: "absolute", top: "50%", insetInlineStart: "13px", transform: "translateY(-50%)" }}>
                      <SearchIcon />
                    </span>
                    <input
                      style={{ width: "100%", fontSize: "14px", padding: "12px 14px 12px 42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" }}
                      value={pickQuery}
                      onChange={(e) => setPickQuery(e.target.value)}
                      placeholder={isMgrStep ? "ابحث باسم مدير المشروع" : "ابحث باسم المقاول أو التخصص"}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {pickOptions.map((o) => {
                      const on = selected?.id === o.id;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setDraft(isMgrStep ? { manager: o } : { contractor: o })}
                          style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "start", background: on ? "var(--g-50)" : "var(--n-surface)", border: `1.5px solid ${on ? "var(--g-500)" : "var(--n-border)"}`, borderRadius: "var(--r-md)", padding: "14px 16px", cursor: "pointer" }}
                        >
                          <span style={{ width: "38px", height: "38px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "13px", fontWeight: 700 }}>{o.name.slice(0, 1)}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--t-primary)" }}>{o.name}</span>
                            <span style={{ display: "block", fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>{o.meta}</span>
                          </span>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", border: `2px solid ${on ? "var(--g-600)" : "var(--n-border-strong)"}`, background: on ? "var(--g-600)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                            {on && <CheckIcon />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {touched && !selected && <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)", marginTop: "12px" }}>يجب الاختيار للمتابعة.</div>}
                </div>
              )}

              {step === 6 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>مراجعة المشروع</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                    {[
                      ["اسم المشروع", draft.name || "—", "span 2"],
                      ["المدينة", draft.city || "—", "span 1"],
                      ["الحي", draft.district || "—", "span 1"],
                      ["عدد المباني", String(draft.buildings.length), "span 1"],
                      ["إجمالي الوحدات", String(totalUnits), "span 1"],
                      ["مدير المشروع", draft.manager?.name ?? "—", "span 1"],
                      ["المقاول الرئيسي", draft.contractor?.name ?? "—", "span 1"],
                    ].map(([label, value, span]) => (
                      <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "13px 15px", gridColumn: span }}>
                        <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "5px" }}>{label}</div>
                        <div style={{ fontSize: "14px", fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: "1px solid var(--n-border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px", background: "var(--n-surface2)", fontSize: "11.5px", fontWeight: 700, color: "var(--t-secondary)" }}>
                      <span>المباني والوحدات</span>
                      <span>{totalUnits} وحدة إجمالاً</span>
                    </div>
                    {draft.buildings.map((b) => {
                      const cfg = draft.units[b.k] ?? { perFloor: "8", area: "140" };
                      const per = parseInt(cfg.perFloor || "0", 10) || 0;
                      const fl = parseInt(b.floors || "0", 10) || 0;
                      return (
                        <div key={b.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "13px 15px", borderTop: "1px solid var(--n-border)" }}>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600 }}>{b.name} (رقم {b.number})</div>
                            <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "2px" }}>{fl} طوابق · {per} وحدات/طابق · {cfg.area || 0} م²</div>
                          </div>
                          <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{per * fl} وحدة</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px", marginTop: "16px" }}>
                    <InfoIconAccent />
                    <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.75 }}>
                      {mode === "edit" ? "الحفظ يحدّث بيانات المشروع والمباني والوحدات والتعيينات ثم يعيدك إلى قائمة المشاريع." : "الإنشاء يولّد المشروع ثم المباني ثم الوحدات ثم يربط مدير المشروع والمقاول الرئيسي."}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--n-border)", flexWrap: "wrap" }}>
                <button onClick={prev} disabled={step === 1} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, padding: "11px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer", opacity: step === 1 ? 0.4 : 1 }}>
                  السابق
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--t-tertiary)" }}>الخطوة {step} من 6</span>
                  <button onClick={() => void next()} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, padding: "12px 24px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                    {step < 6 ? "التالي" : mode === "edit" ? "حفظ" : "إنشاء المشروع"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div style={{ position: "fixed", bottom: "26px", insetInlineEnd: "50%", transform: "translateX(50%)", display: "flex", alignItems: "center", gap: "10px", background: "var(--g-900)", color: "var(--t-on-dark)", borderRadius: "var(--r-full)", padding: "13px 22px", boxShadow: "var(--sh-4)", zIndex: 60, fontSize: "13px", fontWeight: 600 }}>
            <CheckIcon color="var(--a-300)" />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- icons (ported 1:1 from the source file's inline SVGs) ----------

function DashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
}
function BuildingIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M10 21v-5h4v5" /></svg>;
}
function BuildingIconLg({ color = "var(--a-300)" }: { color?: string }) {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}><path d="M3 21h18" /><path d="M6 21V4h7v17" /><path d="M13 9h5v12" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /></svg>;
}
function PeopleIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
}
function WrenchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>;
}
function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}
function SearchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--t-tertiary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}
function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
}
function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
}
function BackChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
}
function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14H5V6" /></svg>;
}
function UploadIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" /></svg>;
}
function InfoIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>;
}
function InfoIconAccent() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>;
}
function CheckIcon({ color = "var(--t-on-dark)" }: { color?: string }) {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
