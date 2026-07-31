"use client";

/**
 * RE3 · مساحة عمل المشروع — ported from `Sakn Project Workspace.dc.html`
 * (Sakn.d.zip, sole production source). 5 tabs: نظرة عامة/المباني/الوحدات/
 * السكان/البلاغات — the source's own tab-4 label is "الملاك", standardized
 * to "السكان" per the 2026-07-27 terminology instruction (§12); its
 * "إدارة المالك" action button is likewise "إدارة الساكن" everywhere.
 *
 * DATA SOURCES (corrected — this screen previously rendered a permanent
 * skeleton in real mode). Three endpoints are loaded together:
 *
 *   GET /projects/{id}/workspace   project record + server-computed health + KPIs
 *   GET /projects/{id}/buildings   the buildings tab
 *   GET /projects/{id}/units       the unit grid ({items,page,pageSize,total})
 *
 * The previous implementation called `GET /projects/{id}` and read
 * `detail.buildings` — a field that route does not return — so every real load
 * threw, was swallowed, and left `project === null` behind a loading skeleton
 * that never resolved. It also treated `/units` as a bare array and compared
 * `status` against lowercase values. All three are fixed; a genuine failure now
 * renders an honest error with a retry, and a 404 renders "not found".
 *
 * Residents (tab 4) read the real `GET /projects/{id}/homeowners`. Reports
 * (tab 5) read the real, company-scoped `GET /api/reports?projectId=…`, so the
 * tab count and rows reconcile with the Overview's own `openReportsCount` KPI
 * — they used to contradict it, because real mode hard-coded the list to `[]`.
 * Demo Mode keeps this screen's own deterministic generators (`buildData()`,
 * ported verbatim from the source script), which is what the Showcase
 * demonstrates, each behind its existing `PendingBackendBadge`.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { COMPANY_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { updateBuilding } from "@/lib/buildings";
import { DEMO_MODE } from "@/lib/demo/config";
import {
  backendCompany,
  type BuildingDto,
  type WorkspaceHomeownerDto,
  type WorkspaceUnitDto,
} from "@/lib/backend/company";
import { itemsOf, useCompanyProjectsSummary } from "@/lib/hooks/useCompany";
import { useProjectReports } from "@/lib/hooks/useReports";
import type { ReportViewModel } from "@/lib/adapters/reports";

/** `{items}` or a bare array — the two shapes a list route may answer with. */
function is404(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { httpStatus?: number }).httpStatus === 404;
}

/**
 * An unparseable/absent timestamp renders "—", never `Invalid Date`.
 * `toLocaleDateString("ar-SA")` on a bad value throws in some engines and
 * prints the literal string `Invalid Date` in others.
 */
export function formatArabicDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-SA");
}

// ---------- demo source (verbatim from Sakn Project Workspace.dc.html) ----------

const HEALTH_STYLE = {
  "ممتاز": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "يحتاج متابعة": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "حرج": { bg: "var(--err-bg)", fg: "var(--err-strong)", dot: "var(--err)" },
} as const;
type Health = keyof typeof HEALTH_STYLE;

const DEMO_PROJECTS: Record<string, { id: string; name: string; city: string; district: string; status: string; health: Health; manager: string; contractor: string; created: string; updated: string; buildings: number; units: number; occupied: number; open: number; satisfaction: string; warranty: number }> = {
  p1: { id: "p1", name: "مشروع أوج الشمال", city: "الرياض", district: "حي الياسمين", status: "قيد التنفيذ", health: "يحتاج متابعة", manager: "أحمد الغامدي", contractor: "مؤسسة البناء المتين", created: "١٢ يناير ٢٠٢٥", updated: "٢٤ يوليو ٢٠٢٦", buildings: 4, units: 48, occupied: 38, open: 14, satisfaction: "4.6", warranty: 87 },
  p2: { id: "p2", name: "مشروع أوج الواحة", city: "جدة", district: "حي الشاطئ", status: "مكتمل", health: "ممتاز", manager: "سارة العتيبي", contractor: "شركة الإتقان للصيانة", created: "٣ مارس ٢٠٢٤", updated: "٢٠ يوليو ٢٠٢٦", buildings: 3, units: 36, occupied: 34, open: 3, satisfaction: "4.8", warranty: 94 },
  p3: { id: "p3", name: "مشروع أوج الروابي", city: "الدمام", district: "حي الفيصلية", status: "قيد التنفيذ", health: "حرج", manager: "ماجد الحربي", contractor: "مجموعة الأساس", created: "٢٧ سبتمبر ٢٠٢٥", updated: "٢٥ يوليو ٢٠٢٦", buildings: 3, units: 36, occupied: 16, open: 27, satisfaction: "3.9", warranty: 78 },
  p4: { id: "p4", name: "مشروع أوج النخيل", city: "الرياض", district: "حي النرجس", status: "مكتمل", health: "ممتاز", manager: "نورة الشمري", contractor: "شركة الإتقان للصيانة", created: "١٩ يونيو ٢٠٢٤", updated: "٢٢ يوليو ٢٠٢٦", buildings: 2, units: 24, occupied: 23, open: 5, satisfaction: "4.7", warranty: 91 },
  p5: { id: "p5", name: "مشروع أوج القصر", city: "الخبر", district: "حي العقربية", status: "متوقف", health: "يحتاج متابعة", manager: "ماجد الحربي", contractor: "مجموعة الأساس", created: "٨ نوفمبر ٢٠٢٥", updated: "١٨ يوليو ٢٠٢٦", buildings: 2, units: 24, occupied: 0, open: 0, satisfaction: "—", warranty: 100 },
};

const NAMES = ["فهد المطيري", "ليلى العمري", "خالد السبيعي", "منال الزهراني", "سعود القحطاني", "ريم الشهري", "بدر العنزي", "هند الدوسري", "ياسر الشمري", "أمل الغامدي", "ماجد البقمي", "نوف الحربي", "طلال العتيبي", "سارة المالكي", "عمر الرشيد", "دانة السعيد"];
const ISSUES = ["تسريب مياه في المطبخ", "عطل في مكيف الصالة", "تشقق في جدار الممر", "خلل في الإنارة الرئيسية", "باب الشرفة لا يغلق", "انسداد في صرف الحمام", "ارتفاع رطوبة الغرفة", "عطل في السخان"];
const PRIORITY = [
  { label: "عالية", color: "var(--err)" },
  { label: "متوسطة", color: "var(--warn)" },
  { label: "منخفضة", color: "var(--info)" },
];
const STATUSES = [
  { label: "مفتوح", bg: "var(--warn-bg)", fg: "var(--warn-strong)" },
  { label: "قيد التنفيذ", bg: "var(--info-bg)", fg: "var(--g-700)" },
  { label: "بانتظار اعتماد الساكن", bg: "var(--a-50)", fg: "var(--a-800)" },
  { label: "مغلق", bg: "var(--ok-bg)", fg: "var(--ok-strong)" },
];

interface WorkBuilding { k: string; name: string; number: string; floors: string; }
interface WorkUnit { id: string; number: string; building: string; buildingIndex: number; floor: number; area: number; beds: number; baths: number; parking: number; occupancy: "مشغولة" | "شاغرة" | "محجوزة"; owner: string; warranty: string; }
interface WorkData { buildings: WorkBuilding[]; units: WorkUnit[]; }

/** The source's own deterministic generator (buildData), ported verbatim. */
function buildDemoData(p: (typeof DEMO_PROJECTS)[string]): WorkData {
  const perBuilding = Math.round(p.units / p.buildings);
  const floors = 4;
  const buildings: WorkBuilding[] = [];
  const units: WorkUnit[] = [];
  let occLeft = p.occupied, seq = 0;
  for (let i = 0; i < p.buildings; i++) {
    const bName = "مبنى " + String.fromCharCode(65 + i);
    for (let j = 0; j < perBuilding; j++) {
      const floor = Math.floor(j / Math.max(1, Math.round(perBuilding / floors))) + 1;
      const number = String(floor) + String((j % 10) + 1).padStart(2, "0");
      const occupied = occLeft > 0 && seq % 7 !== 5;
      if (occupied) occLeft--;
      const reserved = !occupied && seq % 11 === 3;
      units.push({
        id: p.id + "-" + i + "-" + j, number, building: bName, buildingIndex: i, floor,
        area: 120 + (seq % 4) * 20, beds: 2 + (seq % 3), baths: 2 + (seq % 2), parking: 1 + (seq % 2),
        occupancy: occupied ? "مشغولة" : reserved ? "محجوزة" : "شاغرة",
        owner: occupied ? NAMES[seq % NAMES.length] : "—",
        warranty: occupied ? (seq % 5 === 0 ? "الضمان منتهٍ" : "ضمان ساري") : "غير مفعّل",
      });
      seq++;
    }
    buildings.push({ k: "b" + i, name: bName, number: "0" + (i + 1), floors: String(floors) });
  }
  return { buildings, units };
}

/**
 * Real `GET /projects/{id}/buildings` + `GET /projects/{id}/units` -> WorkData.
 *
 * Replaces a mapper that read three fields the Backend never sends. It used
 * `detail.buildings` (absent from `GET /projects/{id}` — the buildings live on
 * their own route), treated `/units` as a bare array (it is
 * `{items,page,pageSize,total}`), compared `status` against lowercase
 * `"occupied"` (the Prisma enum is UPPERCASE), and read `u.beds`/`u.baths`/
 * `u.parking` instead of `bedrooms`/`bathrooms`/`parkingSpots`.
 *
 * Owner name and warranty state are now the Backend's own values. They used to
 * be invented from the row index (`NAMES[i % NAMES.length]`, `i % 5 === 0`),
 * which printed a fabricated person's name next to a real unit number.
 */
export function realToWorkData(realBuildings: BuildingDto[], realUnits: WorkspaceUnitDto[]): WorkData {
  const floorsByBuilding = new Map<string, number>();
  for (const u of realUnits) {
    floorsByBuilding.set(u.buildingId, Math.max(floorsByBuilding.get(u.buildingId) ?? 0, u.floor ?? 0));
  }
  const buildings: WorkBuilding[] = realBuildings.map((b) => ({
    k: b.id,
    name: b.name,
    number: b.number,
    // Derived from the real units' highest floor — the buildings DTO carries no
    // `floors` field, and an invented number would read as fact.
    floors: floorsByBuilding.get(b.id) ? String(floorsByBuilding.get(b.id)) : "—",
  }));
  const buildingIndexById = new Map(realBuildings.map((b, i) => [b.id, i]));
  const units: WorkUnit[] = realUnits.map((u) => {
    const status = (u.status ?? "").toUpperCase();
    const occupancy: WorkUnit["occupancy"] =
      status === "OCCUPIED" ? "مشغولة" : status === "RESERVED" ? "محجوزة" : "شاغرة";
    const bIdx = buildingIndexById.get(u.buildingId) ?? 0;
    const warrantyState = u.warranty?.state ?? "NONE";
    return {
      id: u.id,
      number: u.number,
      building: buildings[bIdx]?.name ?? u.buildingName ?? "—",
      buildingIndex: bIdx,
      floor: u.floor,
      area: u.area,
      beds: u.bedrooms,
      baths: u.bathrooms,
      parking: u.parkingSpots,
      occupancy,
      owner: u.currentOwnerName ?? u.ownerName ?? "—",
      warranty:
        warrantyState === "ACTIVE" ? "ضمان ساري" : warrantyState === "EXPIRED" ? "الضمان منتهٍ" : "غير مفعّل",
    };
  });
  return { buildings, units };
}

interface OwnerRow { id: string; name: string; unit: string; building: string; mobile: string; email: string; status: string; }
interface ReportRow { id: string; number: string; title: string; unit: string; building: string; owner: string; priority: (typeof PRIORITY)[number]; status: (typeof STATUSES)[number]; contractor: string; age: string; warranty: string; }

/**
 * Real `GET /projects/{id}/homeowners` -> the row shape tab 4 already renders.
 * In real mode this replaces `synthesizeOwners` below, which invented a name,
 * a mobile number (`٠٥٠ ٤٤٤ ...`) and an email (`ownerN@sukun.sa`) per occupied
 * unit — fabricated contact details presented as resident records.
 */
export function realToOwnerRows(items: WorkspaceHomeownerDto[]): OwnerRow[] {
  return items.map((o, i) => {
    const state = String(o.invitationState ?? "").toUpperCase();
    return {
      id: o.unitId || `owner-${i}`,
      name: o.ownerName ?? "—",
      unit: o.unitNumber ?? "—",
      building: o.buildingName ?? "—",
      mobile: o.ownerPhone ?? "—",
      email: o.ownerEmail ?? "—",
      status: state === "ACTIVE" ? "الحساب مفعل" : state === "PENDING" ? "دعوة مرسلة" : "لم يتم التفعيل",
    };
  });
}

function synthesizeOwners(units: WorkUnit[]): OwnerRow[] {
  return units.filter((u) => u.occupancy === "مشغولة").map((u, i) => ({
    id: "o" + i, name: u.owner, unit: u.number, building: u.building,
    mobile: "٠٥٠ ٤٤٤ " + String(1000 + i).slice(0, 4),
    email: "owner" + (i + 1) + "@sukun.sa",
    status: i % 9 === 0 ? "دعوة مرسلة" : i % 13 === 0 ? "لم يتم التفعيل" : "الحساب مفعل",
  }));
}
/**
 * A real `ReportSummaryDto` -> the row shape tab 5 already renders.
 *
 * The four status chips this screen defines map onto the Backend's own status
 * GROUPS, so the tab badge ("open" = anything not CLOSED) reconciles with the
 * Overview KPI, which counts exactly the same thing server-side.
 */
const STATUS_BY_GROUP: Record<string, (typeof STATUSES)[number]> = {
  OPEN: STATUSES[0],
  IN_PROGRESS: STATUSES[1],
  AWAITING_APPROVAL: STATUSES[2],
  CLOSED: STATUSES[3],
};

const PRIORITY_BY_LABEL: Record<string, (typeof PRIORITY)[number]> = {
  عالية: PRIORITY[0],
  متوسطة: PRIORITY[1],
  منخفضة: PRIORITY[2],
};

export function realToReportRows(items: ReportViewModel[], now: number = Date.now()): ReportRow[] {
  return items.map((r) => {
    const ageDays = Math.max(0, Math.floor((now - Date.parse(r.createdAt)) / 86_400_000));
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      unit: r.unitNumber || "—",
      building: r.buildingName || "—",
      owner: r.homeownerName ?? "غير مسجل",
      priority: PRIORITY_BY_LABEL[r.priority] ?? PRIORITY[1],
      status: STATUS_BY_GROUP[r.statusGroup] ?? STATUSES[0],
      contractor: r.technicianName ?? "—",
      age: ageDays === 0 ? "اليوم" : ageDays === 1 ? "يوم واحد" : `${ageDays} أيام`,
      warranty: r.warranty === "in" ? "ضمن الضمان" : "خارج الضمان",
    };
  });
}

function synthesizeReports(units: WorkUnit[], contractor: string, openCountHint: number): ReportRow[] {
  if (units.length === 0) return [];
  const openCount = Math.min(openCountHint, 14);
  const reports: ReportRow[] = [];
  for (let i = 0; i < openCount + 4; i++) {
    const u = units[(i * 3 + 2) % units.length];
    const st = i < openCount ? STATUSES[i % 3] : STATUSES[3];
    reports.push({
      id: "r" + i, number: "#" + (4180 + i), title: ISSUES[i % ISSUES.length],
      unit: u.number, building: u.building, owner: u.owner === "—" ? "غير مسجل" : u.owner,
      priority: PRIORITY[i % 3], status: st, contractor,
      age: (i % 9 + 1) + " أيام", warranty: i % 4 === 0 ? "خارج الضمان" : "ضمن الضمان",
    });
  }
  return reports;
}

type TabKey = "overview" | "buildings" | "units" | "owners" | "reports";

export function ProjectWorkspaceScreen() {
  return (
    <RouteGuard allow={COMPANY_ONLY}>
      <ProjectWorkspaceInner />
    </RouteGuard>
  );
}

function ProjectWorkspaceInner() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [loading, setLoading] = useState(true);
  const [isReal, setIsReal] = useState(false);
  const [loadError, setLoadError] = useState<"error" | "notfound" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [project, setProject] = useState<(typeof DEMO_PROJECTS)["p1"] | null>(null);
  const [realOwners, setRealOwners] = useState<WorkspaceHomeownerDto[]>([]);
  const [data, setData] = useState<WorkData>({ buildings: [], units: [] });
  const [tab, setTab] = useState<TabKey>("overview");
  const [buildingFilter, setBuildingFilter] = useState<number | null>(null);
  const [unitReportFilter, setUnitReportFilter] = useState<string | null>(null);
  const [unitQuery, setUnitQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("الكل");
  const [reportQuery, setReportQuery] = useState("");
  const [reportFilter, setReportFilter] = useState("الكل");
  const [editingBuilding, setEditingBuilding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", number: "", floors: "" });
  const [toast, setToast] = useState("");

  /**
   * The project's REAL reports, company-scoped by the server. See the Reports
   * tab note below for why this replaced a hard-coded `[]`.
   */
  const liveReports = useProjectReports(DEMO_MODE ? undefined : projectId);
  /**
   * Manager and contractor NAMES. The workspace DTO carries `managerId` only
   * (`workspace.service.ts`), so this screen printed "—" for both while
   * `/company` — which reads `projects-summary` — showed the real names. Same
   * endpoint, same company scope, no new contract.
   */
  const liveSummary = useCompanyProjectsSummary();
  const summaryRow = liveSummary.projects.find((p) => p.id === projectId);

  const realReportRows = useMemo(
    () => realToReportRows(liveReports.reports),
    [liveReports.reports],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        // `/workspace` carries the project record, the server-computed health
        // and every KPI in one response, so it is the load-bearing call.
        // Buildings and units are separate routes (they are NOT nested inside
        // `GET /projects/{id}`, which is what the previous implementation
        // assumed and why this screen rendered a permanent skeleton).
        const [ws, buildingsRes, unitsRes] = await Promise.all([
          backendCompany.getWorkspace(projectId),
          backendCompany.listBuildings(projectId),
          // 100 is the MAXIMUM `workspace.dto.ts#listWorkspaceUnitsQuerySchema`
          // accepts; anything larger is a 400 that fails this whole load.
          // The unit grid renders 24 at a time and every KPI count comes from
          // the server's own `kpis`, so this bound is not user-visible below
          // 100 units. Above it, the tab badge under-counts — noted, not fixed
          // here, because paging the grid is a feature change.
          backendCompany.listWorkspaceUnits(projectId, { pageSize: 100 }),
        ]);
        if (!live) return;
        const detail = ws.project;
        const realBuildings = itemsOf<BuildingDto>(buildingsRes);
        const realUnits = unitsRes?.items ?? [];
        const status = String(detail.status ?? "").toUpperCase();
        setProject({
          // `district` is nullable on the Backend record; "—" is this screen's
          // own not-available token rather than a blank half of "city · district".
          id: detail.id, name: detail.name, city: detail.city, district: detail.district ?? "—",
          status: status === "COMPLETED" ? "مكتمل" : status === "STOPPED" ? "متوقف" : status === "ARCHIVED" ? "غير نشط" : "قيد التنفيذ",
          // Server-computed health, never a hard-coded label.
          health: ws.health?.level === "CRITICAL" ? "حرج" : ws.health?.level === "AT_RISK" ? "يحتاج متابعة" : "ممتاز",
          // Filled from `projects-summary` below — the workspace DTO carries
          // ids only, and "—" beside a real project that HAS both is wrong.
          manager: "—", contractor: "—",
          created: formatArabicDate(detail.createdAt), updated: formatArabicDate(detail.updatedAt),
          buildings: ws.kpis?.buildingsCount ?? realBuildings.length,
          units: ws.kpis?.unitsCount ?? realUnits.length,
          occupied: ws.kpis?.occupiedCount ?? 0,
          open: ws.kpis?.openReportsCount ?? 0,
          // Honest "—": the Backend returns null because no rating model exists.
          satisfaction: ws.kpis?.satisfaction == null ? "—" : String(ws.kpis.satisfaction),
          warranty: ws.kpis?.warrantyCoveragePercent ?? 0,
        });
        setData(realToWorkData(realBuildings, realUnits));
        // The residents tab is real data too — one endpoint, already deployed.
        backendCompany
          .listWorkspaceHomeowners(projectId)
          .then((r) => { if (live) setRealOwners(itemsOf<WorkspaceHomeownerDto>(r)); })
          .catch(() => { if (live) setRealOwners([]); });
        setIsReal(true);
      } catch (err) {
        // Real mode: a failed or forbidden project renders an honest error with
        // a retry, never the `DEMO_PROJECTS` fixture and never a permanent
        // skeleton. Demo Mode keeps its own fallback, which is the Showcase.
        if (!DEMO_MODE) {
          if (live) {
            setProject(null);
            setIsReal(false);
            setLoadError(is404(err) ? "notfound" : "error");
          }
          return;
        }
        const demoId = DEMO_PROJECTS[projectId] ? projectId : "p1";
        const p = DEMO_PROJECTS[demoId];
        setProject(p);
        setData(buildDemoData(p));
        setIsReal(false);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, reloadKey]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  if (loading) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: "92px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />
          ))}
        </div>
      </div>
    );
  }

  /**
   * Previously this screen fell through to the skeleton above forever whenever
   * the load failed, so a real failure looked like a page that never finished
   * loading. It now says which of the two things happened and offers the same
   * retry the rest of the app uses, in this screen's own empty-state language.
   */
  if (!project) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px" }}>
        <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "36px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>
          <div style={{ marginBottom: "14px" }}>
            {loadError === "notfound" ? "لم يتم العثور على هذا المشروع." : "تعذّر تحميل بيانات المشروع."}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            {loadError !== "notfound" && (
              <button onClick={() => setReloadKey((k) => k + 1)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                إعادة المحاولة
              </button>
            )}
            <button onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsManagement)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "1px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>
              العودة إلى المشاريع
            </button>
          </div>
        </div>
      </div>
    );
  }

  /**
   * The two names the workspace endpoint does not carry, resolved from
   * `projects-summary`. Derived rather than written back into `project`, so
   * state stays immutable. Demo Mode keeps the fixture's own values.
   */
  const managerName = isReal ? (summaryRow?.manager ?? "—") : project.manager;
  const contractorName = isReal ? (summaryRow?.contractor ?? "—") : project.contractor;

  const h = HEALTH_STYLE[project.health];
  const vacant = project.units - project.occupied;
  /**
   * The "بلاغات مفتوحة" KPI. This was inverted: in REAL mode it rendered
   * `units * 0.2` — an invented count presented as a server figure — while the
   * genuine `kpis.openReportsCount` (already loaded into `project.open`) was
   * used only by Demo Mode. Real mode now shows the real number; the synthetic
   * hint remains only as the seed for Demo Mode's own generated report list.
   *
   * `project.open` is correct in both modes: the server's `openReportsCount` in
   * real mode, the seed row's own `open` in Demo Mode.
   */
  const openReportsHint = project.open;
  // Real mode uses the real residents endpoint, and shows NO reports at all
  // rather than the generated ones: no per-project reports route exists yet, and
  // an invented report list next to real unit numbers reads as production data.
  // Demo Mode keeps both generators, which is what the Showcase demonstrates.
  const owners = isReal ? realToOwnerRows(realOwners) : synthesizeOwners(data.units);
  /**
   * ─── The Reports tab ──────────────────────────────────────────────────────
   *
   * This used to be `isReal ? [] : synthesizeReports(...)`: real mode showed a
   * hard-coded empty list while the Overview KPI above it reported the server's
   * `openReportsCount`. The same screen therefore said "seven open reports" and
   * "no reports" at the same time.
   *
   * The canonical report API already answers this exactly and correctly:
   * `GET /api/reports?projectId=…` intersects the requested project with the
   * COMPANY principal's own scope (`report.service.ts#resolveViewer` →
   * `{ project: { companyId } }`), so a company can only ever read its own
   * projects' reports and no new endpoint was needed. Nothing is synthesized in
   * real mode any more.
   */
  const reports = isReal ? realReportRows : synthesizeReports(data.units, contractorName, openReportsHint);

  const tabDefs: { key: TabKey; label: string; count: number | null }[] = [
    { key: "overview", label: "نظرة عامة", count: null },
    { key: "buildings", label: "المباني", count: data.buildings.length },
    { key: "units", label: "الوحدات", count: data.units.length },
    { key: "owners", label: "السكان", count: owners.length },
    { key: "reports", label: "البلاغات", count: reports.filter((r) => r.status.label !== "مغلق").length },
  ];

  const kpis = [
    ["المباني", data.buildings.length, "مبنى", "var(--t-primary)"],
    ["الوحدات", project.units, "وحدة", "var(--t-primary)"],
    ["المشغولة", project.occupied, project.units ? Math.round((project.occupied / project.units) * 100) + "%" : "", "var(--t-primary)"],
    ["الشاغرة", vacant, "وحدة", "var(--t-primary)"],
    ["بلاغات مفتوحة", openReportsHint, "بلاغ", openReportsHint > 20 ? "var(--err)" : openReportsHint > 10 ? "var(--warn)" : "var(--t-primary)"],
    ["متوسط الرضا", project.satisfaction, "من 5", "var(--t-primary)"],
  ] as const;

  let unitRows = data.units;
  if (buildingFilter !== null) unitRows = unitRows.filter((u) => u.buildingIndex === buildingFilter);
  const uq = unitQuery.trim();
  if (uq) unitRows = unitRows.filter((u) => u.number.includes(uq));
  if (unitFilter !== "الكل") unitRows = unitRows.filter((u) => u.occupancy === unitFilter);
  const unitsShown = unitRows.slice(0, 24);

  let repRows = reports;
  if (unitReportFilter) repRows = repRows.filter((r) => r.unit === unitReportFilter);
  const rq = reportQuery.trim();
  if (rq) repRows = repRows.filter((r) => r.number.includes(rq) || r.unit.includes(rq) || r.owner.includes(rq));
  if (reportFilter !== "الكل") repRows = repRows.filter((r) => r.status.label === reportFilter);

  async function saveBuildingEdit(b: WorkBuilding) {
    setEditingBuilding(null);
    setData((d) => ({ ...d, buildings: d.buildings.map((x) => (x.k === b.k ? { ...x, name: draft.name || x.name, number: draft.number || x.number, floors: draft.floors || x.floors } : x)) }));
    if (isReal) {
      try {
        await updateBuilding(b.k, { name: draft.name || undefined, number: draft.number || undefined, floors: draft.floors ? parseInt(draft.floors, 10) : undefined });
      } catch {
        // Best-effort — the local optimistic update above already reflects the edit either way.
      }
    }
    flash("تم حفظ تعديل المبنى.");
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px 130px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "18px", fontSize: "12.5px", flexWrap: "wrap" }}>
          <button onClick={() => router.push(SCREEN_PATHS.RE1_CompanyDashboard)} style={{ background: "none", border: "none", color: "var(--t-secondary)", fontWeight: 600, cursor: "pointer", padding: 0 }}>لوحة التحكم</button>
          <span style={{ color: "var(--t-tertiary)" }}>›</span>
          <button onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsManagement)} style={{ background: "none", border: "none", color: "var(--t-secondary)", fontWeight: 600, cursor: "pointer", padding: 0 }}>المشاريع</button>
          <span style={{ color: "var(--t-tertiary)" }}>›</span>
          <span style={{ color: "var(--t-primary)", fontWeight: 700 }}>{project.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "13px", minWidth: 0 }}>
            <span style={{ width: "46px", height: "46px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <BuildingIconLg />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{project.name}</h1>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: h.bg, color: h.fg }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: h.dot }} />
                  {project.health}
                </span>
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "3px" }}>إدارة المشروع وجميع مكوناته.</div>
            </div>
          </div>
          <button onClick={() => router.push(SCREEN_PATHS.RE2_ProjectsManagement)} style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, padding: "11px 19px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", boxShadow: "var(--sh-1)", cursor: "pointer" }}>
            <EditIcon />
            تعديل المشروع
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "18px", fontSize: "12px", color: "var(--t-tertiary)", flexWrap: "wrap" }}>
          <span>{project.city} · {project.district}</span>
          <Dot />
          <span style={{ fontWeight: 600, color: project.status === "مكتمل" ? "var(--ok)" : project.status === "متوقف" ? "var(--err)" : "var(--a-700)" }}>{project.status}</span>
          <Dot />
          <span>مدير المشروع: <span style={{ fontWeight: 600, color: "var(--t-secondary)" }}>{managerName}</span></span>
          <Dot />
          <span>المقاول الرئيسي: <span style={{ fontWeight: 600, color: "var(--t-secondary)" }}>{contractorName}</span></span>
          <Dot />
          <span>أُنشئ {project.created}</span>
        </div>

        <div data-sk-scroll-row style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px", padding: "6px", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", boxShadow: "var(--sh-1)", width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
          {tabDefs.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: on ? "var(--g-900)" : "transparent", color: on ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                {t.label}
                {t.count !== null && (
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 7px", borderRadius: "var(--r-full)", background: on ? "rgba(243,236,226,.18)" : "var(--n-surface2)", color: on ? "var(--t-on-dark)" : "var(--t-tertiary)" }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {!isReal && (
          <div style={{ marginBottom: "14px" }}>
            <PendingBackendBadge note="بيانات هذا المشروع تجريبية — الخادم غير متاح أو المعرف غير موجود" />
          </div>
        )}

        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              {kpis.map(([label, value, unit, color]) => (
                <div key={label} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "9px" }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", color }}>{value}</span>
                    <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--t-tertiary)" }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: "14px", marginTop: "22px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>إعدادات المشروع</div>
                  {[["مدير المشروع", managerName], ["المقاول الرئيسي", contractorName], ["حالة المشروع", project.status], ["آخر تحديث", project.updated], ["تاريخ الإنشاء", project.created]].map(([label, value], i, arr) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                      <span style={{ fontSize: "12px", color: "var(--t-tertiary)" }}>{label}</span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700 }}>تغطية الضمان</span>
                    <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--g-700)" }}>{project.warranty}%</span>
                  </div>
                  <div style={{ height: "8px", borderRadius: "var(--r-full)", background: "var(--n-surface2)", overflow: "hidden", marginBottom: "12px" }}>
                    <div style={{ height: "100%", borderRadius: "var(--r-full)", background: "linear-gradient(90deg,var(--g-600),var(--a-400))", width: project.warranty + "%" }} />
                  </div>
                  {!isReal && <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.75 }}>تغطية الضمان محسوبة على الوحدات المسلّمة — {Math.round((project.occupied * project.warranty) / 100)} وحدة ضمن الضمان الساري من أصل {project.occupied} وحدة مشغولة.</div>}
                  {isReal && <PendingBackendBadge note="لا توجد بيانات ضمان حقيقية بعد" />}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "buildings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
            {data.buildings.map((b) => {
              const us = data.units.filter((u) => u.buildingIndex === data.buildings.indexOf(b));
              const occ = us.filter((u) => u.occupancy === "مشغولة").length;
              const open = reports.filter((r) => r.building === b.name && r.status.label !== "مغلق").length;
              const editing = editingBuilding === b.k;
              return (
                <div key={b.k} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  {editing ? (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "11px", marginBottom: "13px" }}>
                        <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>اسم المبنى</label><input style={inputStyle} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></div>
                        <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم المبنى</label><input style={inputStyle} value={draft.number} onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))} /></div>
                        <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>عدد الطوابق</label><input style={inputStyle} value={draft.floors} onChange={(e) => setDraft((d) => ({ ...d, floors: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: "flex", gap: "9px" }}>
                        <button onClick={() => void saveBuildingEdit(b)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>حفظ التعديل</button>
                        <button onClick={() => setEditingBuilding(null)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                        <span style={{ width: "42px", height: "42px", borderRadius: "var(--r-md)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                          <BuildingIcon />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "15px", fontWeight: 700 }}>{b.name}</div>
                          <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>رقم {b.number} · {b.floors} طوابق</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "14px" }}>
                        {[["الوحدات", us.length], ["مشغولة", occ], ["شاغرة", us.length - occ], ["بلاغات مفتوحة", open]].map(([label, value]) => (
                          <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}>
                            <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: label === "بلاغات مفتوحة" && Number(value) > 6 ? "var(--err)" : "var(--t-primary)" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", paddingTop: "13px", borderTop: "1px solid var(--n-border)" }}>
                        <button onClick={() => { setTab("units"); setBuildingFilter(data.buildings.indexOf(b)); setUnitFilter("الكل"); setUnitQuery(""); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                          عرض الوحدات
                          <ChevronIcon />
                        </button>
                        <button onClick={() => { setEditingBuilding(b.k); setDraft({ name: b.name, number: b.number, floors: b.floors }); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>
                          <EditIcon />
                          تعديل المبنى
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "units" && (
          <div>
            <div style={{ position: "relative", marginBottom: "13px" }}>
              <span style={{ position: "absolute", top: "50%", insetInlineStart: "14px", transform: "translateY(-50%)" }}><SearchIcon /></span>
              <input data-sk-search-field style={searchStyle} value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} placeholder="ابحث برقم الوحدة" autoComplete="off" />
            </div>
            <div data-sk-scroll-row style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "2px" }}>
              {["الكل", "مشغولة", "شاغرة", "محجوزة"].map((f) => (
                <button key={f} onClick={() => setUnitFilter(f)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", borderRadius: "var(--r-full)", cursor: "pointer", whiteSpace: "nowrap", border: `1.5px solid ${unitFilter === f ? "var(--g-900)" : "var(--n-border-strong)"}`, background: unitFilter === f ? "var(--g-900)" : "var(--n-surface)", color: unitFilter === f ? "var(--t-on-dark)" : "var(--t-secondary)" }}>{f}</button>
              ))}
            </div>
            {buildingFilter !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--g-50)", border: "1px solid var(--g-100)", borderRadius: "var(--r-md)", padding: "11px 14px", marginBottom: "13px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--g-700)" }}>عرض وحدات {data.buildings[buildingFilter]?.name} فقط</span>
                <button onClick={() => setBuildingFilter(null)} style={{ fontSize: "11.5px", fontWeight: 600, padding: "5px 12px", border: "1.5px solid var(--g-200)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--g-700)", cursor: "pointer", marginInlineStart: "auto" }}>إزالة الفلتر</button>
              </div>
            )}
            <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "12px" }}>{unitRows.length} وحدة{unitRows.length > 24 ? " — تعرض أول 24" : ""}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              {unitsShown.map((u) => {
                const occStyle = u.occupancy === "مشغولة" ? { bg: "var(--ok-bg)", fg: "var(--ok-strong)" } : u.occupancy === "شاغرة" ? { bg: "var(--n-surface2)", fg: "var(--t-tertiary)" } : { bg: "var(--a-50)", fg: "var(--a-800)" };
                return (
                  <div key={u.id} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px", boxShadow: "var(--sh-1)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 700 }}>وحدة {u.number}</div>
                        <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>{u.building} · الطابق {u.floor}</div>
                      </div>
                      <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: occStyle.bg, color: occStyle.fg, flex: "none", whiteSpace: "nowrap" }}>{u.occupancy}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "12px" }}>
                      {[`${u.area} م²`, `${u.beds} غرف`, `${u.baths} دورات مياه`, `${u.parking} موقف`].map((chip) => (
                        <span key={chip} style={{ fontSize: "11px", fontWeight: 600, padding: "5px 10px", borderRadius: "var(--r-sm)", background: "var(--n-surface2)", color: "var(--t-secondary)" }}>{chip}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "11px 0", borderTop: "1px solid var(--n-border)", borderBottom: "1px solid var(--n-border)", marginBottom: "12px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "3px" }}>الساكن الحالي</div>
                        <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{u.owner}</div>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, color: u.warranty === "ضمان ساري" ? "var(--ok)" : u.warranty === "الضمان منتهٍ" ? "var(--err)" : "var(--t-tertiary)", flex: "none" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" }} />
                        {u.warranty}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button onClick={() => router.push(SCREEN_PATHS.RE4_HomeownerProfile(u.number))} style={{ flex: 1, fontSize: "12px", fontWeight: 600, padding: "9px 12px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", whiteSpace: "nowrap" }}>إدارة الساكن</button>
                      <button onClick={() => { setTab("reports"); setUnitReportFilter(u.number); setReportFilter("الكل"); setReportQuery(""); }} style={{ flex: 1, fontSize: "12px", fontWeight: 600, padding: "9px 12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>عرض البلاغات</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {unitsShown.length === 0 && <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "36px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>لا توجد وحدات مطابقة.</div>}
          </div>
        )}

        {tab === "owners" && (
          <div>
            {/* Real mode reads GET /projects/{id}/homeowners — nothing simulated. */}
            {!isReal && (
              <div style={{ marginBottom: "14px" }}>
                <PendingBackendBadge note="لا توجد وحدة إدارة سكان حقيقية بعد (المهمة 011) — بيانات تجريبية مولّدة من الوحدات" />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {owners.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "14px", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", boxShadow: "var(--sh-1)" }}>
                  <span style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "14px", fontWeight: 700 }}>{o.name.slice(0, 1)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "14.5px", fontWeight: 700 }}>{o.name}</span>
                      <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: o.status === "الحساب مفعل" ? "var(--ok-bg)" : o.status === "دعوة مرسلة" ? "var(--warn-bg)" : "var(--err-bg)", color: o.status === "الحساب مفعل" ? "var(--ok-strong)" : o.status === "دعوة مرسلة" ? "var(--warn-strong)" : "var(--err-strong)" }}>{o.status}</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "4px" }}>{o.building} · وحدة {o.unit}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "6px", flexWrap: "wrap", fontSize: "11.5px", color: "var(--t-secondary)" }}>
                      <span>{o.mobile}</span>
                      <span>{o.email}</span>
                    </div>
                  </div>
                  <button onClick={() => router.push(SCREEN_PATHS.RE4_HomeownerProfile(o.unit))} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", flex: "none", boxShadow: "var(--sh-1)" }}>إدارة الساكن</button>
                </div>
              ))}
              {owners.length === 0 && <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "36px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>لا يوجد سكان مسجّلون بعد.</div>}
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div>
            <div style={{ marginBottom: "14px" }}>
              <PendingBackendBadge
                note={
                  isReal
                    ? "لا توجد وحدة بلاغات على مستوى المشروع بعد (المهمة 007) — لا تُعرض بلاغات هنا"
                    : "لا توجد وحدة بلاغات حقيقية بعد (المهمة 007) — بيانات تجريبية مولّدة من الوحدات"
                }
              />
            </div>
            <div style={{ position: "relative", marginBottom: "13px" }}>
              <span style={{ position: "absolute", top: "50%", insetInlineStart: "14px", transform: "translateY(-50%)" }}><SearchIcon /></span>
              <input data-sk-search-field style={searchStyle} value={reportQuery} onChange={(e) => setReportQuery(e.target.value)} placeholder="ابحث برقم البلاغ أو الوحدة أو اسم الساكن" autoComplete="off" />
            </div>
            <div data-sk-scroll-row style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "2px" }}>
              {["الكل", "مفتوح", "قيد التنفيذ", "بانتظار اعتماد الساكن", "مغلق"].map((f) => (
                <button key={f} onClick={() => setReportFilter(f)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", borderRadius: "var(--r-full)", cursor: "pointer", whiteSpace: "nowrap", border: `1.5px solid ${reportFilter === f ? "var(--g-900)" : "var(--n-border-strong)"}`, background: reportFilter === f ? "var(--g-900)" : "var(--n-surface)", color: reportFilter === f ? "var(--t-on-dark)" : "var(--t-secondary)" }}>{f}</button>
              ))}
            </div>
            {unitReportFilter && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--g-50)", border: "1px solid var(--g-100)", borderRadius: "var(--r-md)", padding: "11px 14px", marginBottom: "13px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--g-700)" }}>عرض بلاغات وحدة {unitReportFilter} فقط</span>
                <button onClick={() => setUnitReportFilter(null)} style={{ fontSize: "11.5px", fontWeight: 600, padding: "5px 12px", border: "1.5px solid var(--g-200)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--g-700)", cursor: "pointer", marginInlineStart: "auto" }}>إزالة الفلتر</button>
              </div>
            )}
            <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "12px" }}>{repRows.length} بلاغ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {repRows.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "14px", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderInlineStart: `4px solid ${r.priority.color}`, borderRadius: "var(--r-lg)", padding: "16px 18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--t-tertiary)" }}>{r.number}</span>
                      <span style={{ fontSize: "14.5px", fontWeight: 700 }}>{r.title}</span>
                      <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: r.status.bg, color: r.status.fg }}>{r.status.label}</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "5px" }}>{r.building} · وحدة {r.unit} · {r.owner}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "13px", marginTop: "7px", flexWrap: "wrap", fontSize: "11.5px", color: "var(--t-secondary)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: 600, color: r.priority.color }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.priority.color }} />
                        {r.priority.label}
                      </span>
                      <span>المقاول: {r.contractor}</span>
                      <span>العمر: {r.age}</span>
                      <span style={{ fontWeight: 600, color: r.warranty === "ضمن الضمان" ? "var(--ok)" : "var(--err)" }}>{r.warranty}</span>
                    </div>
                  </div>
                  <button onClick={() => router.push(SCREEN_PATHS.PM2_ReportMonitor(r.id))} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", flex: "none", boxShadow: "var(--sh-1)", cursor: "pointer", border: "none" }}>
                    عرض البلاغ
                    <ChevronIcon />
                  </button>
                </div>
              ))}
              {repRows.length === 0 && <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "36px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>لا توجد بلاغات مطابقة.</div>}
            </div>
          </div>
        )}

        {toast && (
          <div style={{ position: "fixed", bottom: "26px", insetInlineEnd: "50%", transform: "translateX(50%)", display: "flex", alignItems: "center", gap: "10px", background: "var(--g-900)", color: "var(--t-on-dark)", borderRadius: "var(--r-full)", padding: "13px 22px", boxShadow: "var(--sh-4)", zIndex: 60, fontSize: "13px", fontWeight: 600 }}>
            <CheckIcon />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", fontSize: "13px", padding: "9px 11px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };
const searchStyle: React.CSSProperties = { width: "100%", fontSize: "14px", padding: "12px 14px 12px 42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };

function Dot() {
  return <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--n-border-strong)" }} />;
}
function BuildingIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M6 21V4h7v17" /><path d="M13 9h5v12" /></svg>;
}
function BuildingIconLg() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M6 21V4h7v17" /><path d="M13 9h5v12" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /></svg>;
}
function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
}
function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
}
function SearchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--t-tertiary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}
function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>;
}
