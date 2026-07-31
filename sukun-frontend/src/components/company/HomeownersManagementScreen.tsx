"use client";

/**
 * RE4 · إدارة السكان — ported from `Sakn Homeowners Management.dc.html`
 * (Sakn.d.zip, sole production source). No Homeowners CRM backend module
 * exists yet (Task 011, unbuilt) — like RE5, the entire screen runs on
 * local component state seeded from the source's own literal `SEED_OWNERS`/
 * `seedUnits()`, exactly as the production screen itself does. One
 * `PendingBackendBadge` states this plainly. (A real `GET /units/vacant`
 * endpoint does exist — Task 005 — but wiring only the unit-picker half for
 * real while owners stay fully local would produce a real/demo data
 * mismatch worse than staying consistently local; left as a TODO for when
 * Task 011 lands and the whole screen can move together.)
 *
 * Terminology standardization (2026-07-27 instruction, §12): every
 * occurrence of "مالك"/"الملاك" (owner) in the source is rendered here as
 * "ساكن"/"السكان" (resident) — title, breadcrumb, buttons, empty/error
 * copy, the "مشغولة بمالك نشط" unit-picker tooltip. Layout/navigation/
 * business logic unchanged.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { CompanyTopNavPills, type NavPillItem } from "@/components/company/CompanyTopNavPills";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { COMPANY_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";
import { useHomeowners, useMutation, itemsOf } from "@/lib/hooks/useCompany";
import { useAsyncResource } from "@/lib/hooks/useAsyncResource";
import { backendCompany } from "@/lib/backend/company";
import { backendAdmin } from "@/lib/backend/admin";
import { arabicMessageFor } from "@/lib/backend/errors";

const PROJECTS = [
  { id: "p1", name: "أوج الشمال", buildings: ["مبنى A", "مبنى B", "مبنى C"] },
  { id: "p2", name: "أوج الواحة", buildings: ["مبنى A", "مبنى B"] },
  { id: "p4", name: "أوج النخيل", buildings: ["مبنى A", "مبنى B"] },
];

interface Unit { id: string; project: string; projectId: string; building: string; number: string; ownerId: string | null; }
function seedUnits(): Unit[] {
  const out: Unit[] = [];
  PROJECTS.forEach((p) => p.buildings.forEach((b, bi) => {
    for (let i = 1; i <= 6; i++) out.push({ id: p.id + "-" + bi + "-" + i, project: p.name, projectId: p.id, building: b, number: String(bi + 1) + String(i).padStart(2, "0"), ownerId: null });
  }));
  return out;
}

type Activation = "مفعل" | "بانتظار التفعيل" | "بانتظار التحقق" | "غير مفعل";
/**
 * No National ID anywhere on this type.
 *
 * The field previously survived as a "non-rendered" property that still fed the
 * list search, which is why the search box still advertised "أو الهوية" and a
 * National ID was still a way to look a resident up. Both are removed: the
 * value is not read from the Backend, not held in state, not searchable and not
 * collected by any form.
 */
interface Owner { id: string; name: string; mobile: string; email: string; unitId: string; moveIn: string; activation: Activation; invitation: "تم إرسال الدعوة" | "لم يتم إرسال الدعوة"; warranty: "ضمان ساري" | "الضمان منتهٍ"; open: number; active: boolean; }

const SEED_OWNERS: Owner[] = [
  { id: "o1", name: "فهد المطيري", mobile: "٠٥٠ ١٢٣ ٤٤٥٦", email: "fahad@example.com", unitId: "p1-1-2", moveIn: "١٢ مايو ٢٠٢٦", activation: "بانتظار التفعيل", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 2, active: true },
  { id: "o2", name: "ليلى العمري", mobile: "٠٥٥ ٧٧٨ ١٢٣٤", email: "laila@example.com", unitId: "p2-0-3", moveIn: "٣ فبراير ٢٠٢٥", activation: "مفعل", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 0, active: true },
  { id: "o3", name: "خالد السبيعي", mobile: "٠٥٣ ٤٤٤ ٩٩٨٧", email: "khalid@example.com", unitId: "p4-1-1", moveIn: "٢٧ أغسطس ٢٠٢٤", activation: "مفعل", invitation: "تم إرسال الدعوة", warranty: "الضمان منتهٍ", open: 1, active: true },
  { id: "o4", name: "منال الزهراني", mobile: "٠٥٦ ٣٣٢ ٥٥٦٦", email: "manal@example.com", unitId: "p1-0-4", moveIn: "١٩ يونيو ٢٠٢٦", activation: "غير مفعل", invitation: "لم يتم إرسال الدعوة", warranty: "ضمان ساري", open: 0, active: true },
  { id: "o5", name: "سعود القحطاني", mobile: "٠٥٩ ٨٨٨ ٢٢٣٣", email: "saud@example.com", unitId: "p1-2-5", moveIn: "٨ مارس ٢٠٢٦", activation: "بانتظار التحقق", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 3, active: true },
  { id: "o6", name: "ريم الشهري", mobile: "٠٥٤ ٢٢٢ ٦٦٧٧", email: "reem@example.com", unitId: "p2-1-2", moveIn: "٢ نوفمبر ٢٠٢٥", activation: "مفعل", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 0, active: false },
  { id: "o7", name: "بدر العنزي", mobile: "٠٥٠ ٩٩٩ ٤٤٥٥", email: "bader@example.com", unitId: "p4-0-6", moveIn: "٢٣ يناير ٢٠٢٦", activation: "مفعل", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 1, active: true },
];

const ACT_STYLE: Record<Activation, { bg: string; fg: string; dot: string }> = {
  "مفعل": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "بانتظار التفعيل": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "بانتظار التحقق": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "غير مفعل": { bg: "var(--err-bg)", fg: "var(--err-strong)", dot: "var(--err)" },
};
const INV_STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  "تم إرسال الدعوة": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "لم يتم إرسال الدعوة": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
};
/** The chip a label with no authored style falls back to — never `undefined`. */
const NEUTRAL_CHIP = { bg: "var(--n-surface2)", fg: "var(--t-tertiary)", dot: "var(--t-tertiary)" };

const REPORTS: Record<string, { n: string; t: string; s: string; d: string }[]> = {
  o1: [{ n: "#4182", t: "تسريب مياه في المطبخ", s: "قيد التنفيذ", d: "var(--info)" }, { n: "#4190", t: "عطل في مكيف الصالة", s: "مفتوح", d: "var(--warn)" }],
  o3: [{ n: "#4141", t: "تشقق في جدار الممر", s: "بانتظار اعتماد الساكن", d: "var(--a-500)" }],
  o5: [{ n: "#4201", t: "خلل في الإنارة الرئيسية", s: "مفتوح", d: "var(--warn)" }, { n: "#4205", t: "انسداد في صرف الحمام", s: "قيد التنفيذ", d: "var(--info)" }, { n: "#4211", t: "باب الشرفة لا يغلق", s: "مفتوح", d: "var(--warn)" }],
  o7: [{ n: "#4166", t: "ارتفاع رطوبة الغرفة", s: "قيد التنفيذ", d: "var(--info)" }],
};

const WIZ_LABELS = ["البيانات", "الوحدة", "التفعيل", "المراجعة", "الإنشاء"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(seed: number): string {
  let out = "", x = (seed || Date.now()) >>> 0;
  for (let i = 0; i < 8; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out += CODE_CHARS[(x >>> 8) % CODE_CHARS.length];
    if (i === 3) out += "-";
  }
  return out;
}
function qrPattern(seed: number) {
  const cells: { key: string; fill: string }[] = [];
  let x = (Math.imul(seed || 7, 2654435761) >>> 0) || 7;
  for (let i = 0; i < 121; i++) {
    const r = Math.floor(i / 11), c = i % 11;
    const finder = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const on = finder || (x >>> 8) % 100 < 46;
    cells.push({ key: "q" + i, fill: on ? "var(--g-900)" : "transparent" });
  }
  return cells;
}
// No `nid`: the creation wizard does not collect a National ID, so there is no
// draft field that could be sent as an empty string.
const blankDraft = () => ({ name: "", mobile: "", email: "", projectId: null as string | null, building: null as string | null, unitId: null as string | null, code: "", seed: 0 });
type HistEntry = { t: string; m: string; d: string };
type Screen = "list" | "wizard" | "profile" | "transfer";
const FILTERS = ["الكل", "نشط", "دعوة مرسلة", "بانتظار التفعيل", "غير نشط"] as const;

export function HomeownersManagementScreen() {
  return (
    <RouteGuard allow={COMPANY_ONLY}>
      <HomeownersManagementInner />
    </RouteGuard>
  );
}

/** Backend `HomeownerStatus` -> the approved chip vocabulary. */
function activationLabel(status: string): Owner["activation"] {
  if (status === "ACTIVE") return "مفعل";
  if (status === "PENDING") return "بانتظار التفعيل";
  return "غير مفعل";
}

/**
 * The invitation chip renders through `INV_STYLE`, which offers exactly TWO
 * labels. Anything else — an em dash, a future status — is not a key, and
 * `INV_STYLE[label].bg` on a miss throws and takes the whole screen down. That
 * is precisely what happened in real mode: every non-PENDING homeowner mapped
 * to "—", so a single ACTIVE owner crashed RE4.
 *
 * The mapping below is total over the Backend's four statuses:
 *  ACTIVE / PENDING       an invitation demonstrably went out (one was redeemed,
 *                         one is outstanding);
 *  NOT_ACTIVATED /        no live activation exists, so none has been sent.
 *  DEACTIVATED
 */
function invitationLabel(status: string): Owner["invitation"] {
  return status === "ACTIVE" || status === "PENDING" ? "تم إرسال الدعوة" : "لم يتم إرسال الدعوة";
}

function HomeownersManagementInner() {
  const router = useRouter();

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   `SEED_OWNERS` + `seedUnits()`, verbatim. No request.
   *   DEMO_MODE=false  `GET /api/homeowners` for the list, and every mutation
   *                    below is the REAL endpoint. The activation code is NEVER
   *                    generated client-side in real mode — `genCode` stays a
   *                    Demo Mode device; the real code is issued, hashed and
   *                    delivered server-side.
   */
  const liveOwners = useHomeowners();
  const liveVacant = useAsyncResource(
    (sig) => backendCompany.listVacantUnits({ signal: sig }),
    [],
    { enabled: !DEMO_MODE },
  );
  const mutation = useMutation();

  const [loading, setLoading] = useState(true);
  const [confirm, confirmDialog] = useConfirm();
  const [screen, setScreen] = useState<Screen>("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("الكل");
  const [owners, setOwners] = useState<Owner[]>(SEED_OWNERS);
  const [units, setUnits] = useState<Unit[]>(() => seedUnits().map((u) => {
    const o = SEED_OWNERS.find((x) => x.unitId === u.id);
    return o ? { ...u, ownerId: o.id } : u;
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(blankDraft());
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMobile, setEditMobile] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [tProject, setTProject] = useState<string | null>(null);
  const [tBuilding, setTBuilding] = useState<string | null>(null);
  const [tUnit, setTUnit] = useState<string | null>(null);
  const [tTouched, setTTouched] = useState(false);
  const [history, setHistory] = useState<Record<string, HistEntry[]>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    const h = decodeURIComponent((window.location.hash || "").replace("#", ""));
    if (h === "new") {
      setScreen("wizard");
      setStep(1);
      setDraft(blankDraft());
    } else if (h) {
      const byId = owners.find((o) => o.id === h);
      const unit = units.find((u) => u.number === h);
      const byUnit = unit ? owners.find((o) => o.unitId === unit.id) : null;
      const target = byId ?? byUnit;
      if (target) {
        setScreen("profile");
        setSelectedId(target.id);
      }
    }
    const t = window.setTimeout(() => setLoading(false), 560);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }
  /**
   * The REAL CSV. `GET /api/homeowners/export` is not a JSON envelope, so it
   * goes through the client's `getBlob`. Demo Mode keeps the toast it always
   * had, because there is no server to export from.
   */
  async function exportCsv() {
    if (DEMO_MODE) {
      flash("تم تجهيز ملف بيانات السكان للتصدير (CSV).");
      return;
    }
    try {
      const blob = await backendAdmin.exportHomeowners({});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "homeowners.csv";
      a.click();
      URL.revokeObjectURL(url);
      flash("تم تجهيز ملف بيانات السكان للتصدير (CSV).");
    } catch (err) {
      flash(arabicMessageFor(err));
    }
  }

  function addHistory(ownerId: string, entry: HistEntry) {
    setHistory((h) => ({ ...h, [ownerId]: [entry, ...(h[ownerId] ?? [])] }));
  }
  async function resend(o: Owner) {
    if (!DEMO_MODE) {
      // The REAL re-invitation. The Backend revokes the previous code and
      // issues a new one; the code itself never reaches this client.
      if (!(await mutation.run(() => backendAdmin.resendHomeownerInvitation(o.id)))) {
        flash(mutation.error ?? "");
        return;
      }
      liveOwners.reload();
      flash("تم إلغاء الرمز السابق وإصدار رمز تفعيل و QR جديدين وإرسال الدعوة.");
      return;
    }
    setOwners((list) => list.map((x) => (x.id === o.id ? { ...x, invitation: "تم إرسال الدعوة", activation: x.activation === "مفعل" ? x.activation : "بانتظار التفعيل" } : x)));
    addHistory(o.id, { t: "إعادة إرسال الدعوة", m: "أُلغي الرمز السابق · رمز جديد " + genCode(o.id.length * 97 + (Date.now() % 9973)) + " · ٢٦ يوليو ٢٠٢٦", d: "var(--a-500)" });
    flash("تم إلغاء الرمز السابق وإصدار رمز تفعيل و QR جديدين وإرسال الدعوة.");
  }

  async function toggleActive(id: string) {
    const current = ownersView.find((o) => o.id === id);
    if (current?.active) {
      const ok = await confirm({
        title: "تعطيل حساب الساكن؟",
        body: `سيفقد ${current.name} الوصول إلى حسابه. سجلّ الملكية والبلاغات يبقى محفوظاً، ويمكنك إعادة التفعيل لاحقاً.`,
        confirmLabel: "تعطيل الحساب",
        destructive: true,
      });
      if (!ok) return;
    }
    if (!DEMO_MODE) {
      if (!current) return;
      // Ask first, reflect second.
      if (!(await mutation.run(() => backendAdmin.setHomeownerStatus(id, !current.active)))) {
        flash(mutation.error ?? "");
        return;
      }
      liveOwners.reload();
      flash(current.active ? "تم تعطيل الحساب — يبقى سجل الملكية والبلاغات محفوظاً." : "تمت إعادة تفعيل الحساب.");
      return;
    }
    let becameActive = false;
    setOwners((list) => list.map((o) => { if (o.id !== id) return o; becameActive = o.active; return { ...o, active: !o.active }; }));
    flash(becameActive ? "تم تعطيل الحساب — يبقى سجل الملكية والبلاغات محفوظاً." : "تمت إعادة تفعيل الحساب.");
  }

  // Real mode projects the Backend's records into the SAME `Owner`/`Unit`
  // shapes the JSX already renders, so the markup has no branch of its own.
  const realUnits: Unit[] = DEMO_MODE
    ? []
    : itemsOf(liveVacant.data as { items?: never[] }).map((u: {
        id: string; number: string; buildingName: string; projectId: string; projectName: string;
      }) => ({
        id: u.id, number: u.number, building: u.buildingName, project: u.projectName,
        projectId: u.projectId, ownerId: null,
      } as unknown as Unit));

  const realOwners: Owner[] = DEMO_MODE
    ? []
    : liveOwners.homeowners.map((h) => ({
        id: h.id,
        name: h.name,
        mobile: h.phone,
        email: h.email,
        unitId: h.unit?.id ?? "",
        moveIn: h.moveInDate ? h.moveInDate.slice(0, 10) : "—",
        activation: activationLabel(h.status),
        invitation: invitationLabel(h.status),
        warranty: "—",
        open: 0,
        active: h.status !== "DEACTIVATED",
      } as unknown as Owner));

  const ownersView = DEMO_MODE ? owners : realOwners;
  /**
   * `realUnits` is `GET /api/units/vacant` — the create/transfer wizards need
   * exactly that, but an OCCUPIED owner's unit is by definition absent from it,
   * so looking a row's unit up there always missed and every real row rendered
   * a blank project/building/number. The list endpoint already returns each
   * owner's unit inline, so those are folded in here; the vacant set stays the
   * source for the pickers.
   */
  const ownedUnits: Unit[] = DEMO_MODE
    ? []
    : liveOwners.homeowners.flatMap((h) =>
        h.unit
          ? [{ id: h.unit.id, number: h.unit.number, building: h.unit.buildingName, project: h.unit.projectName, ownerId: h.id } as unknown as Unit]
          : [],
      );
  const unitsView = DEMO_MODE ? units : [...realUnits, ...ownedUnits];

  const sel = ownersView.find((o) => o.id === selectedId) ?? null;
  const unitOf = (id: string | null) => unitsView.find((u) => u.id === id) ?? null;
  const selUnit = sel ? unitOf(sel.unitId) : null;

  const q = query.trim();
  const rows = ownersView.filter((o) => {
    const u = unitOf(o.unitId) ?? { project: "", building: "", number: "" };
    if (q && !(o.name.includes(q) || o.mobile.includes(q) || o.email.includes(q) || u.project.includes(q) || u.building.includes(q) || u.number.includes(q))) return false;
    if (filter === "نشط") return o.active && o.activation === "مفعل";
    if (filter === "دعوة مرسلة") return o.invitation === "تم إرسال الدعوة";
    if (filter === "بانتظار التفعيل") return o.activation === "بانتظار التفعيل" || o.activation === "بانتظار التحقق";
    if (filter === "غير نشط") return !o.active || o.activation === "غير مفعل";
    return true;
  });

  const isTransfer = screen === "transfer";
  const pickProject = isTransfer ? tProject : draft.projectId;
  const pickBuilding = isTransfer ? tBuilding : draft.building;
  const pickUnit = isTransfer ? tUnit : draft.unitId;
  function setPick(patch: { projectId?: string | null; building?: string | null; unitId?: string | null }) {
    if (isTransfer) {
      if (patch.projectId !== undefined) setTProject(patch.projectId);
      if (patch.building !== undefined) setTBuilding(patch.building);
      if (patch.unitId !== undefined) setTUnit(patch.unitId);
    } else {
      setDraft((d) => ({ ...d, ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}), ...(patch.building !== undefined ? { building: patch.building } : {}), ...(patch.unitId !== undefined ? { unitId: patch.unitId } : {}) }));
    }
  }
  /**
   * The project and building dropdowns.
   *
   * The UNITS were already real (`GET /api/units/vacant`), but these two lists
   * were the fixture `PROJECTS` constant — so the wizard offered "أوج الشمال /
   * أوج الواحة / أوج النخيل" on a company that owns none of them, and because
   * `unitOptions` filters on `u.projectId === pickProject`, a fixture id could
   * never match a real unit: choosing a project produced an empty unit list and
   * the wizard could not be completed at all.
   *
   * Both lists are now derived from the vacant units themselves, so every
   * option shown is a project and a building that genuinely has a free unit.
   */
  const realPickerProjects = DEMO_MODE
    ? []
    : Array.from(
        realUnits.reduce((acc, u) => {
          const entry = acc.get(u.projectId) ?? { id: u.projectId, name: u.project, buildings: new Set<string>() };
          entry.buildings.add(u.building);
          acc.set(u.projectId, entry);
          return acc;
        }, new Map<string, { id: string; name: string; buildings: Set<string> }>()),
      ).map(([, p]) => ({ id: p.id, name: p.name, buildings: [...p.buildings] }));

  const pickerProjects = DEMO_MODE ? PROJECTS : realPickerProjects;
  const curProject = pickerProjects.find((p) => p.id === pickProject);
  const buildingOptions = curProject ? curProject.buildings : [];
  // The pickers must offer VACANT units only. In real mode that is exactly the
  // `/units/vacant` set — the occupied units folded into `unitsView` for the
  // row lookup are deliberately excluded here.
  const pickableUnits = DEMO_MODE ? unitsView : realUnits;
  const unitOptions = pickableUnits.filter((u) => u.projectId === pickProject && u.building === pickBuilding);

  function wizValid() {
    if (step === 1) return !!(draft.name.trim() && draft.mobile.trim());
    if (step === 2) return !!(draft.projectId && draft.building && draft.unitId);
    return true;
  }
  function wizNext() {
    if (!wizValid()) {
      setTouched(true);
      return;
    }
    if (step === 2 && !draft.code) {
      const seed = Date.now() % 99991;
      setDraft((d) => ({ ...d, code: genCode(seed), seed }));
    }
    if (step < 5) {
      setStep(step + 1);
      setTouched(false);
      return;
    }
    if (!DEMO_MODE) {
      // The REAL creation. The Backend issues the activation code and the
      // invitation; nothing about the credential is decided here.
      void (async () => {
        const ok = await mutation.run(() =>
          // No `nationalId` key at all — not an empty string, not a generated
          // value, not the phone number. The Backend treats an absent key as
          // "not provided" and runs no national-ID rule for it.
          backendAdmin.createHomeowner({
            name: draft.name,
            email: draft.email,
            phone: draft.mobile,
            unitId: draft.unitId as string,
          }),
        );
        if (!ok) { flash(mutation.error ?? ""); return; }
        liveOwners.reload();
        liveVacant.reload();
        setScreen("list");
        setStep(1);
        setDraft(blankDraft());
        setTouched(false);
        flash("تم إنشاء الحساب وربط الوحدة وإصدار رمز QR ورمز التفعيل وإرسال الدعوة.");
      })();
      return;
    }
    const id = "o" + Date.now();
    const owner: Owner = { id, name: draft.name, mobile: draft.mobile, email: draft.email || "—", unitId: draft.unitId!, moveIn: "٢٦ يوليو ٢٠٢٦", activation: "بانتظار التفعيل", invitation: "تم إرسال الدعوة", warranty: "ضمان ساري", open: 0, active: true };
    setOwners((list) => [owner, ...list]);
    setUnits((list) => list.map((u) => (u.id === draft.unitId ? { ...u, ownerId: id } : u)));
    setHistory((h) => ({ ...h, [id]: [{ t: "إرسال الدعوة", m: "رمز التفعيل " + draft.code + " · ٢٦ يوليو ٢٠٢٦", d: "var(--a-500)" }, { t: "إنشاء الحساب", m: "حساب غير مفعّل · ٢٦ يوليو ٢٠٢٦", d: "var(--g-600)" }] }));
    setScreen("list");
    setStep(1);
    setDraft(blankDraft());
    setTouched(false);
    flash("تم إنشاء الحساب وربط الوحدة وإصدار رمز QR ورمز التفعيل وإرسال الدعوة.");
  }

  async function saveEdit() {
    if (!sel) return;
    if (!DEMO_MODE) {
      const body: { email?: string; phone?: string } = {};
      if (editEmail && editEmail !== sel.email) body.email = editEmail;
      if (editMobile && editMobile !== sel.mobile) body.phone = editMobile;
      // The real schema requires at least one field; sending nothing would 400.
      if (Object.keys(body).length === 0) { setEditing(false); return; }
      if (!(await mutation.run(() => backendAdmin.updateHomeowner(sel.id, body)))) {
        flash(mutation.error ?? "");
        return;
      }
      liveOwners.reload();
      setEditing(false);
      flash("تم حفظ بيانات التواصل.");
      return;
    }
    setOwners((list) => list.map((o) => (o.id === sel.id ? { ...o, mobile: editMobile || o.mobile, email: editEmail || o.email } : o)));
    setEditing(false);
    flash("تم حفظ بيانات التواصل.");
  }
  async function confirmTransfer() {
    if (!tUnit || !sel) {
      setTTouched(true);
      return;
    }
    if (!DEMO_MODE) {
      if (!(await mutation.run(() => backendAdmin.transferHomeowner(sel.id, tUnit)))) {
        flash(mutation.error ?? "");
        return;
      }
      liveOwners.reload();
      liveVacant.reload();
      setScreen("profile");
      flash("تم نقل الساكن — الوحدة السابقة أصبحت شاغرة وسجل الملكية محفوظ.");
      return;
    }
    const oldId = sel.unitId, newUnit = unitOf(tUnit)!;
    const oldUnit = unitOf(oldId);
    setUnits((list) => list.map((u) => (u.id === oldId ? { ...u, ownerId: null } : u.id === tUnit ? { ...u, ownerId: sel.id } : u)));
    setOwners((list) => list.map((o) => (o.id === sel.id ? { ...o, unitId: tUnit } : o)));
    setHistory((h) => ({ ...h, [sel.id]: [{ t: "نقل الوحدة", m: "من " + (oldUnit?.number ?? "") + " إلى " + newUnit.number + " · ٢٦ يوليو ٢٠٢٦", d: "var(--info)" }, ...(h[sel.id] ?? [])] }));
    setScreen("profile");
    flash("تم نقل الساكن — الوحدة السابقة أصبحت شاغرة وسجل الملكية محفوظ.");
  }

  const navItems: NavPillItem[] = [
    { key: "dash", label: "لوحة التحكم", href: SCREEN_PATHS.RE1_CompanyDashboard, icon: <DashIcon /> },
    { key: "proj", label: "المشاريع", href: SCREEN_PATHS.RE2_ProjectsManagement, icon: <BuildingIcon /> },
    { key: "res", label: "السكان", current: true, icon: <PeopleIcon /> },
    { key: "con", label: "المقاولون", href: SCREEN_PATHS.RE5_TechniciansManagement, icon: <WrenchIcon /> },
  ];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      {confirmDialog}
      <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px 130px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "18px", fontSize: "12.5px", flexWrap: "wrap" }}>
          <button onClick={() => router.push(SCREEN_PATHS.RE1_CompanyDashboard)} style={{ background: "none", border: "none", color: "var(--t-secondary)", fontWeight: 600, cursor: "pointer", padding: 0 }}>لوحة التحكم</button>
          <span style={{ color: "var(--t-tertiary)" }}>›</span>
          {screen === "list" ? (
            <span style={{ color: "var(--t-primary)", fontWeight: 700 }}>السكان</span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <button onClick={() => { setScreen("list"); setEditing(false); }} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>السكان</button>
              <span style={{ color: "var(--t-tertiary)" }}>›</span>
              <span style={{ color: "var(--t-primary)", fontWeight: 700 }}>{screen === "wizard" ? "إضافة ساكن" : screen === "transfer" ? "نقل الوحدة" : sel?.name ?? ""}</span>
            </span>
          )}
        </div>

        {screen === "list" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><PeopleIconLg /></span>
                <div>
                  <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إدارة السكان</h1>
                  <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>إدارة دورة حياة جميع سكان الوحدات السكنية.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <button onClick={() => void exportCsv()} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, padding: "11px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}><ExportIcon />تصدير البيانات</button>
                <button onClick={() => { setScreen("wizard"); setStep(1); setDraft(blankDraft()); setTouched(false); }} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, padding: "12px 20px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)", whiteSpace: "nowrap" }}><PlusIcon />إضافة ساكن</button>
              </div>
            </div>

            <CompanyTopNavPills items={navItems} />

            <div style={{ marginBottom: "16px" }}>
              <PendingBackendBadge note="لا توجد وحدة إدارة سكان حقيقية بعد (المهمة 011) — كل البيانات تجريبية محلية" />
            </div>

            <div style={{ position: "relative", marginBottom: "13px" }}>
              <span style={{ position: "absolute", top: "50%", insetInlineStart: "14px", transform: "translateY(-50%)" }}><SearchIcon /></span>
              <input data-sk-search-field style={searchStyle} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الجوال أو البريد أو المشروع أو المبنى أو رقم الوحدة" autoComplete="off" />
            </div>

            <div data-sk-scroll-row style={{ display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto", paddingBottom: "2px" }}>
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", borderRadius: "var(--r-full)", cursor: "pointer", whiteSpace: "nowrap", border: `1.5px solid ${filter === f ? "var(--g-900)" : "var(--n-border-strong)"}`, background: filter === f ? "var(--g-900)" : "var(--n-surface)", color: filter === f ? "var(--t-on-dark)" : "var(--t-secondary)" }}>{f}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                {[0, 1, 2].map((i) => <div key={i} style={{ height: "150px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />)}
              </div>
            ) : rows.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                {rows.map((o) => {
                  const u = unitOf(o.unitId) ?? { project: "—", building: "—", number: "—" };
                  // Total lookups: a label with no authored style degrades to the
                  // neutral chip instead of throwing and erasing the screen.
                  const a = ACT_STYLE[o.activation] ?? NEUTRAL_CHIP, iv = INV_STYLE[o.invitation] ?? NEUTRAL_CHIP;
                  const canResend = o.active && o.activation !== "مفعل";
                  return (
                    <div key={o.id} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)", opacity: o.active ? 1 : 0.62 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "14px" }}>
                        <span style={{ width: "46px", height: "46px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "15px", fontWeight: 700 }}>{o.name.slice(0, 1)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "15.5px", fontWeight: 700 }}>{o.name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: o.active ? a.bg : "var(--n-surface2)", color: o.active ? a.fg : "var(--t-tertiary)" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: o.active ? a.dot : "var(--t-tertiary)" }} />
                              {o.active ? o.activation : "حساب معطّل"}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: iv.bg, color: iv.fg }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: iv.dot }} />
                              {o.invitation}
                            </span>
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "5px" }}>انتقل في {o.moveIn}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "7px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11.5px", color: "var(--t-secondary)" }}>{o.mobile}</span>
                            <span style={{ fontSize: "11.5px", color: "var(--t-secondary)" }}>{o.email}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "14px" }}>
                        <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>المشروع</div><div style={{ fontSize: "12.5px", fontWeight: 700 }}>{u.project}</div></div>
                        <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>المبنى / الوحدة</div><div style={{ fontSize: "12.5px", fontWeight: 700 }}>{u.building} · {u.number}</div></div>
                        <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>الضمان</div><div style={{ fontSize: "12.5px", fontWeight: 700, color: o.warranty === "ضمان ساري" ? "var(--ok)" : "var(--err)" }}>{o.warranty}</div></div>
                        <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>بلاغات مفتوحة</div><div style={{ fontSize: "12.5px", fontWeight: 700 }}>{o.open}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", paddingTop: "13px", borderTop: "1px solid var(--n-border)" }}>
                        <button onClick={() => { setScreen("profile"); setSelectedId(o.id); setEditing(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>إدارة الساكن<ChevronIcon /></button>
                        {canResend && <button onClick={() => resend(o)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}><ResendIcon />إعادة إرسال الدعوة</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: "var(--n-surface)", border: "1px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "44px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>لا يوجد سكان مطابقون.</div>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginBottom: "18px" }}>جرّب تعديل البحث أو الفلتر، أو أضف ساكناً جديداً.</div>
                <button onClick={() => { setScreen("wizard"); setStep(1); setDraft(blankDraft()); setTouched(false); }} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 22px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>إضافة ساكن</button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", fontSize: "11.5px", color: "var(--t-tertiary)" }}>
              <InfoIcon />
              الشركة هي الجهة الوحيدة المخوّلة بإنشاء حسابات السكان — لا يمكن للساكن التسجيل ذاتياً، ولا تُحذف الحسابات بل تُعطَّل فقط.
            </div>
          </div>
        )}

        {screen === "wizard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "20px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><AddPersonIconLg /></span>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إضافة ساكن</h1>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>إنشاء حساب غير مفعّل، ربطه بوحدة، وإصدار بيانات التفعيل.</div>
              </div>
            </div>

            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", boxShadow: "var(--sh-1)", marginBottom: "18px" }}>
              <div data-sk-scroll-row style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginBottom: "12px", overflowX: "auto" }}>
                {WIZ_LABELS.map((label, i) => {
                  const n = i + 1, done = step > n, cur = step === n;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none", paddingInlineStart: "6px" }}>
                      <span style={{ width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11.5px", fontWeight: 700, flex: "none", background: cur ? "var(--g-900)" : done ? "var(--g-50)" : "var(--n-surface2)", color: cur ? "var(--t-on-dark)" : done ? "var(--g-700)" : "var(--t-tertiary)" }}>{n}</span>
                      <span style={{ fontSize: "11.5px", fontWeight: 600, color: cur ? "var(--t-primary)" : "var(--t-tertiary)", whiteSpace: "nowrap" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ height: "5px", borderRadius: "var(--r-full)", background: "var(--n-surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "var(--r-full)", background: "linear-gradient(90deg,var(--g-600),var(--a-400))", width: Math.round((step / 5) * 100) + "%" }} />
              </div>
            </div>

            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "22px" }}>
              {step === 1 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>البيانات الشخصية</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>الاسم الكامل</label>
                      <input style={inputStyle} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="مثال: فهد المطيري" />
                      {touched && step === 1 && !draft.name.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    {/* National ID is no longer collected anywhere in this journey.
                        Mobile takes the full row the two fields used to share, so
                        the form keeps its own rhythm rather than leaving a hole. */}
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم الجوال</label>
                      <input style={inputStyle} value={draft.mobile} onChange={(e) => setDraft((d) => ({ ...d, mobile: e.target.value }))} placeholder="٠٥xxxxxxxx" />
                      {touched && step === 1 && !draft.mobile.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>البريد الإلكتروني</label>
                      <input style={inputStyle} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@email.com" />
                    </div>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>ربط الوحدة</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "16px" }}>الوحدات المشغولة غير قابلة للاختيار — وحدة واحدة لساكن واحد.</div>
                  <UnitPicker projects={pickerProjects} pickProject={pickProject} pickBuilding={pickBuilding} pickUnit={pickUnit} buildingOptions={buildingOptions} unitOptions={unitOptions} setPick={setPick} />
                  {touched && step === 2 && !(draft.projectId && draft.building && draft.unitId) && <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)", marginTop: "14px" }}>يجب اختيار المشروع والمبنى ووحدة شاغرة.</div>}
                </div>
              )}
              {step === 3 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>بيانات التفعيل</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "16px" }}>تُصدر هذه البيانات وتُسلَّم للساكن عند استلام الوحدة — وهي مرتبطة بالمشروع والمبنى والوحدة والساكن.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "18px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "10px" }}>رمز التفعيل</div>
                      <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "3px", color: "var(--g-800)", direction: "ltr", textAlign: "center", padding: "14px", background: "var(--n-surface)", border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-md)" }}>{draft.code || genCode(1)}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "12px", lineHeight: 1.7 }}>صالح لمرة واحدة · يُلغى تلقائياً عند إعادة إرسال الدعوة.</div>
                    </div>
                    <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "18px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "10px" }}>رمز QR</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(11,1fr)", gap: "2px", width: "154px", margin: "0 auto", padding: "10px", background: "var(--n-surface)", borderRadius: "var(--r-sm)" }}>
                        {qrPattern(draft.seed || 7).map((c) => <span key={c.key} style={{ aspectRatio: "1", background: c.fill, borderRadius: "1px" }} />)}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "12px", lineHeight: 1.7, textAlign: "center" }}>يُطبع ويُسلَّم مع مفاتيح الوحدة.</div>
                    </div>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>مراجعة البيانات</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {[["الاسم الكامل", draft.name || "—", "span 2"], ["رقم الجوال", draft.mobile || "—", "span 2"], ["البريد الإلكتروني", draft.email || "—", "span 2"], ["المشروع", draft.projectId ? (pickerProjects.find((p) => p.id === draft.projectId)?.name ?? "—") : "—", "span 1"], ["المبنى", draft.building || "—", "span 1"], ["الوحدة", draft.unitId ? unitOf(draft.unitId)?.number : "—", "span 1"], ["طريقة التفعيل", "رمز QR أو رمز التفعيل", "span 1"], ["رمز التفعيل", draft.code || "—", "span 2"]].map(([label, value, span]) => (
                      <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "13px 15px", gridColumn: span }}>
                        <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "5px" }}>{label}</div>
                        <div style={{ fontSize: "13.5px", fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {step === 5 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>إنشاء الحساب</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {["إنشاء حساب الساكن بحالة غير مفعّل", "ربط الساكن بالوحدة المختارة", "إصدار رمز QR فريد", "إصدار رمز تفعيل فريد", "إرسال دعوة إنشاء كلمة المرور", "ضبط الحالة على «بانتظار التفعيل»"].map((label, i) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "11px", background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "13px 15px" }}>
                        <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "11px", fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t-secondary)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px", marginTop: "16px" }}>
                    <InfoIconAccent />
                    <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.75 }}>لا يصل الساكن إلى المنصة مباشرة — بعد إنشاء كلمة المرور يجب التحقق من الملكية بمسح رمز QR أو إدخال رمز التفعيل المسلَّم عند الاستلام. تبقى الحالة «بانتظار التفعيل» حتى نجاح التحقق.</div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--n-border)", flexWrap: "wrap" }}>
                <button onClick={() => (step === 1 ? (setScreen("list"), setDraft(blankDraft())) : (setStep(step - 1), setTouched(false)))} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>{step === 1 ? "إلغاء" : "السابق"}</button>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--t-tertiary)" }}>الخطوة {step} من 5</span>
                  <button onClick={wizNext} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 24px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>{step < 5 ? "التالي" : "إنشاء الحساب"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "profile" && sel && selUnit && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "13px", minWidth: 0 }}>
                <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "17px", fontWeight: 700 }}>{sel.name.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{sel.name}</h1>
                    {/* Same `?? NEUTRAL_CHIP` guard the list rows already use. The
                        list was hardened after `INV_STYLE[label].bg` took the whole
                        screen down on an unmapped label (see the note above
                        `invitationLabel`); this profile chip was missed. */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: sel.active ? (ACT_STYLE[sel.activation] ?? NEUTRAL_CHIP).bg : "var(--n-surface2)", color: sel.active ? (ACT_STYLE[sel.activation] ?? NEUTRAL_CHIP).fg : "var(--t-tertiary)" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: sel.active ? (ACT_STYLE[sel.activation] ?? NEUTRAL_CHIP).dot : "var(--t-tertiary)" }} />
                      {sel.active ? sel.activation : "حساب معطّل"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "3px" }}>{selUnit.project} · {selUnit.building} · وحدة {selUnit.number} · انتقل في {sel.moveIn}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: "18px" }}>
              <button onClick={() => { setEditing(!editing); setEditMobile(sel.mobile); setEditEmail(sel.email); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}><EditIcon />تعديل البيانات</button>
              <button onClick={() => { setScreen("transfer"); setTProject(null); setTBuilding(null); setTUnit(null); setTTouched(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}><TransferIcon />نقل الوحدة</button>
              {sel.active && sel.activation !== "مفعل" && <button onClick={() => resend(sel)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}><ResendIcon />إعادة إرسال الدعوة</button>}
              <button onClick={() => toggleActive(sel.id)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-tertiary)", cursor: "pointer" }}>{sel.active ? "تعطيل الحساب" : "إعادة تفعيل الحساب"}</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>البيانات الشخصية</div>
                  {editing ? (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم الجوال</label><input style={inputStyle} value={editMobile} onChange={(e) => setEditMobile(e.target.value)} /></div>
                        <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>البريد الإلكتروني</label><input style={inputStyle} value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></div>
                        {/* The read-only National ID row is gone; the unit takes the
                            row it used to share so the two-column card stays even. */}
                        <div style={{ gridColumn: "span 2" }}><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>الوحدة (غير قابلة للتعديل)</label><input style={inputStyle} value={`${selUnit.project} · ${selUnit.building} · وحدة ${selUnit.number}`} disabled /></div>
                      </div>
                      <div style={{ display: "flex", gap: "9px", marginTop: "14px" }}>
                        <button onClick={saveEdit} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>حفظ التعديل</button>
                        <button onClick={() => setEditing(false)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* One row removed. The separator logic is index-based, so the
                          remaining four keep their spacing and the last stays borderless. */}
                      {[["الاسم الكامل", sel.name], ["رقم الجوال", sel.mobile], ["البريد الإلكتروني", sel.email], ["حالة الدعوة", sel.invitation]].map(([label, value], i, arr) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                          <span style={{ fontSize: "12px", color: "var(--t-tertiary)" }}>{label}</span>
                          <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "end" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>سجل الدعوات والتفعيل</div>
                  {(history[sel.id] ?? [
                    { t: "التحقق من الملكية", m: sel.activation === "مفعل" ? "تم التحقق برمز QR · " + sel.moveIn : "بانتظار التحقق برمز QR أو رمز التفعيل", d: sel.activation === "مفعل" ? "var(--ok)" : "var(--warn)" },
                    { t: "إرسال الدعوة", m: sel.invitation === "تم إرسال الدعوة" ? "دعوة إنشاء كلمة المرور · " + sel.moveIn : "لم تُرسل بعد", d: sel.invitation === "تم إرسال الدعوة" ? "var(--a-500)" : "var(--t-tertiary)" },
                    { t: "إنشاء الحساب", m: "أنشأته الشركة العقارية · " + sel.moveIn, d: "var(--g-600)" },
                  ]).map((h, i, arr) => (
                    <div key={h.t + i} style={{ display: "flex", gap: "13px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                        <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: h.d, border: "2px solid var(--n-surface)", boxShadow: `0 0 0 2px ${h.d}` }} />
                        <span style={{ width: "2px", flex: 1, background: i === arr.length - 1 ? "transparent" : "var(--n-border)", minHeight: "24px" }} />
                      </div>
                      <div style={{ paddingBottom: "16px", flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600 }}>{h.t}</div>
                        <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "3px" }}>{h.m}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>الوحدة والضمان</div>
                  {[["المشروع", selUnit.project, "var(--t-primary)"], ["المبنى", selUnit.building, "var(--t-primary)"], ["رقم الوحدة", selUnit.number, "var(--t-primary)"], ["تاريخ الانتقال", sel.moveIn, "var(--t-primary)"], ["حالة الضمان", sel.warranty, sel.warranty === "ضمان ساري" ? "var(--ok)" : "var(--err)"]].map(([label, value, color], i, arr) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                      <span style={{ fontSize: "12px", color: "var(--t-tertiary)" }}>{label}</span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "end", color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>البلاغات الحالية</div>
                  {(REPORTS[sel.id] ?? []).map((r, i, arr) => (
                    <div key={r.n} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: r.d, flex: "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{r.t}</div>
                        <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "2px" }}>{r.n} · {r.s}</div>
                      </div>
                      <button onClick={() => router.push(SCREEN_PATHS.PM2_ReportMonitor(r.n.replace("#", "")))} style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--g-700)", flex: "none", background: "none", border: "none", cursor: "pointer" }}>عرض البلاغ</button>
                    </div>
                  ))}
                  {(REPORTS[sel.id] ?? []).length === 0 && <div style={{ fontSize: "12px", color: "var(--t-tertiary)", padding: "8px 0" }}>لا توجد بلاغات مفتوحة لهذه الوحدة.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "transfer" && sel && selUnit && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "20px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><TransferIconLg /></span>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>نقل الوحدة</h1>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>{sel.name} — الوحدة الحالية {selUnit.building} · {selUnit.number}</div>
              </div>
            </div>
            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "22px", boxShadow: "var(--sh-1)" }}>
              <UnitPicker projects={pickerProjects} pickProject={pickProject} pickBuilding={pickBuilding} pickUnit={pickUnit} buildingOptions={buildingOptions} unitOptions={unitOptions} setPick={setPick} unitLabel="الوحدة الشاغرة" />
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px", marginTop: "18px" }}>
                <InfoIconAccent />
                <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.75 }}>عند التأكيد: تصبح الوحدة الحالية شاغرة، وتصبح الوحدة الجديدة مشغولة، ويُحفظ سجل الملكية السابق كاملاً مع بلاغاته.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                <button onClick={confirmTransfer} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 24px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>تأكيد النقل</button>
                <button onClick={() => setScreen("profile")} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إلغاء</button>
                {tTouched && !tUnit && <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)" }}>اختر وحدة شاغرة لإتمام النقل.</span>}
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div style={{ position: "fixed", bottom: "26px", insetInlineEnd: "50%", transform: "translateX(50%)", display: "flex", alignItems: "center", gap: "10px", background: "var(--g-900)", color: "var(--t-on-dark)", borderRadius: "var(--r-full)", padding: "13px 22px", boxShadow: "var(--sh-4)", zIndex: 60, fontSize: "13px", fontWeight: 600, maxWidth: "90vw" }}>
            <CheckIcon />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function UnitPicker({ projects, pickProject, pickBuilding, pickUnit, buildingOptions, unitOptions, setPick, unitLabel = "الوحدة" }: {
  projects: { id: string; name: string; buildings: string[] }[]; pickProject: string | null; pickBuilding: string | null; pickUnit: string | null;
  buildingOptions: string[]; unitOptions: Unit[];
  setPick: (patch: { projectId?: string | null; building?: string | null; unitId?: string | null }) => void;
  unitLabel?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "8px" }}>المشروع</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "9px", marginBottom: "18px" }}>
        {projects.map((p) => (
          <button key={p.id} onClick={() => setPick({ projectId: p.id, building: null, unitId: null })} style={{ fontSize: "12.5px", fontWeight: 600, padding: "12px 14px", border: `1.5px solid ${pickProject === p.id ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: pickProject === p.id ? "var(--g-50)" : "var(--n-surface)", color: pickProject === p.id ? "var(--g-700)" : "var(--t-secondary)", cursor: "pointer", textAlign: "start" }}>{p.name}</button>
        ))}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "8px" }}>المبنى</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "9px", marginBottom: "18px" }}>
        {buildingOptions.map((b) => (
          <button key={b} onClick={() => setPick({ building: b, unitId: null })} style={{ fontSize: "12.5px", fontWeight: 600, padding: "12px 14px", border: `1.5px solid ${pickBuilding === b ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: pickBuilding === b ? "var(--g-50)" : "var(--n-surface)", color: pickBuilding === b ? "var(--g-700)" : "var(--t-secondary)", cursor: "pointer", textAlign: "start" }}>{b}</button>
        ))}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "8px" }}>{unitLabel}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "9px" }}>
        {unitOptions.map((u) => {
          const taken = !!u.ownerId;
          const on = pickUnit === u.id;
          return (
            <button key={u.id} disabled={taken} title={taken ? "الوحدة مشغولة بساكن نشط" : "وحدة شاغرة"} onClick={() => !taken && setPick({ unitId: u.id })} style={{ fontSize: "12.5px", fontWeight: 600, padding: "12px 10px", border: `1.5px solid ${on ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: on ? "var(--g-50)" : "var(--n-surface)", color: on ? "var(--g-700)" : "var(--t-primary)", cursor: taken ? "not-allowed" : "pointer", textAlign: "center", opacity: taken ? 0.5 : 1 }}>
              {u.number}
              <span style={{ display: "block", fontSize: "10px", fontWeight: 600, marginTop: "4px", color: taken ? "var(--t-tertiary)" : "var(--ok)" }}>{taken ? "مشغولة" : "شاغرة"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", fontSize: "13.5px", padding: "11px 13px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };
const searchStyle: React.CSSProperties = { width: "100%", fontSize: "14px", padding: "12px 14px 12px 42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };

function DashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>; }
function BuildingIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /></svg>; }
function PeopleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function PeopleIconLg() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function AddPersonIconLg() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></svg>; }
function WrenchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>; }
function PlusIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
function ExportIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 21h16" /></svg>; }
function SearchIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--t-tertiary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
function ChevronIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>; }
function ResendIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>; }
function InfoIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>; }
function InfoIconAccent() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>; }
function CheckIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function EditIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>; }
function TransferIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>; }
function TransferIconLg() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>; }
