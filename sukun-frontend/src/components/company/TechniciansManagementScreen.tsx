"use client";

/**
 * RE5 · إدارة المقاولين — ported from `Sakn Technicians Management.dc.html`
 * (Sakn.d.zip, sole production source). No backend module exists for this
 * resource at all yet (`project-memory/04_Known_Issues.md`: "no task
 * number assigned"), so — unlike RE2/RE3 — there is no real/demo split to
 * make: the entire screen runs on local component state seeded from the
 * source's own literal `SEED` array, exactly as the production screen
 * itself does. One `PendingBackendBadge` states this plainly.
 *
 * Terminology standardization (2026-07-27 instruction, §12): every
 * occurrence of "فني"/"الفنيون" (technician) in the source is rendered here
 * as "مقاول"/"المقاولون" (contractor) — title, KPI labels, buttons, empty
 * states, breadcrumb — and "الملاك" (the nav pill this file's source also
 * carries) as "السكان". Layout/navigation/business logic unchanged.
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
import { useCompanyProjectsSummary, useMutation, useTechnicians } from "@/lib/hooks/useCompany";
import { backendAdmin } from "@/lib/backend/admin";

/** Demo Mode's four fixture projects. Never rendered in real mode — see below. */
const PROJECTS = [
  { id: "p1", name: "أوج الشمال", manager: "أحمد الغامدي", city: "الرياض" },
  { id: "p2", name: "أوج الواحة", manager: "سارة العتيبي", city: "جدة" },
  { id: "p3", name: "أوج الروابي", manager: "ماجد الحربي", city: "الدمام" },
  { id: "p4", name: "أوج النخيل", manager: "نورة الشمري", city: "الرياض" },
];

type ProjectRef = { id: string; name: string; manager: string; city: string };

/** The honest "we have no project for this row" value. */
const NO_PROJECT: ProjectRef = { id: "", name: "—", manager: "—", city: "—" };

/**
 * A real technician's `projectId` is a UUID that matches none of the fixture
 * ids above, and the old resolver answered `PROJECTS[0]` for any miss — so
 * every real technician row printed "أوج الشمال · مدير المشروع أحمد الغامدي",
 * a fixture project and a fixture manager next to a real person's name.
 *
 * Real mode resolves against the company's OWN projects and falls back to "—".
 */
function makeProjectResolver(real: ProjectRef[]): (id: string | null) => ProjectRef {
  if (DEMO_MODE) return (id) => PROJECTS.find((p) => p.id === id) ?? PROJECTS[0];
  return (id) => real.find((p) => p.id === id) ?? NO_PROJECT;
}

const SPECIALTIES = ["كهرباء", "سباكة", "تكييف وتبريد", "دهان", "صيانة عامة"];

interface Tech {
  id: string; name: string; specialty: string; projectId: string; phone: string; email: string;
  status: "متاح" | "ينفذ مهمة" | "غير نشط"; account: "مفعل" | "غير مفعل";
  open: number; done: number; rating: string; avgTime: string; sla: number; active: boolean;
}

const SEED: Tech[] = [
  { id: "t1", name: "ياسر الشمري", specialty: "سباكة", projectId: "p1", phone: "٠٥٠ ١١٢ ٣٣٤٥", email: "yasser@sukun.sa", status: "ينفذ مهمة", account: "مفعل", open: 3, done: 64, rating: "4.7", avgTime: "١.٨ يوم", sla: 94, active: true },
  { id: "t2", name: "عبدالعزيز الدوسري", specialty: "كهرباء", projectId: "p1", phone: "٠٥٥ ٤٤٤ ٢٢١١", email: "aziz@sukun.sa", status: "متاح", account: "مفعل", open: 0, done: 81, rating: "4.9", avgTime: "١.٢ يوم", sla: 97, active: true },
  { id: "t3", name: "مشعل القرني", specialty: "تكييف وتبريد", projectId: "p2", phone: "٠٥٣ ٧٧٧ ٨٨٩٩", email: "meshal@sukun.sa", status: "ينفذ مهمة", account: "مفعل", open: 2, done: 47, rating: "4.4", avgTime: "٢.٤ يوم", sla: 88, active: true },
  { id: "t4", name: "تركي العبدلي", specialty: "صيانة عامة", projectId: "p3", phone: "٠٥٦ ٢٢٢ ١١٠٠", email: "turki@sukun.sa", status: "ينفذ مهمة", account: "مفعل", open: 5, done: 38, rating: "3.9", avgTime: "٣.١ يوم", sla: 74, active: true },
  { id: "t5", name: "حسن الزهراني", specialty: "دهان", projectId: "p4", phone: "٠٥٩ ٦٦٦ ٥٥٤٤", email: "hassan@sukun.sa", status: "متاح", account: "مفعل", open: 0, done: 29, rating: "4.6", avgTime: "١.٦ يوم", sla: 92, active: true },
  { id: "t6", name: "سلطان المالكي", specialty: "كهرباء", projectId: "p3", phone: "٠٥٤ ٣٣٣ ٩٩٨٨", email: "sultan@sukun.sa", status: "غير نشط", account: "غير مفعل", open: 0, done: 0, rating: "—", avgTime: "—", sla: 0, active: true },
  { id: "t7", name: "نواف العتيبي", specialty: "سباكة", projectId: "p2", phone: "٠٥٠ ٨٨٨ ٧٧٦٦", email: "nawaf@sukun.sa", status: "غير نشط", account: "مفعل", open: 0, done: 52, rating: "4.2", avgTime: "٢.٢ يوم", sla: 85, active: false },
];

const ST_STYLE = {
  "متاح": { bg: "var(--ok-bg)", fg: "var(--ok-strong)", dot: "var(--ok)" },
  "ينفذ مهمة": { bg: "var(--warn-bg)", fg: "var(--warn-strong)", dot: "var(--warn)" },
  "غير نشط": { bg: "var(--n-surface2)", fg: "var(--t-tertiary)", dot: "var(--t-tertiary)" },
} as const;

const OPEN_REPORTS: Record<string, { n: string; t: string; p: string; s: string; d: string }[]> = {
  t1: [{ n: "#4182", t: "تسريب مياه في المطبخ", p: "مبنى B · وحدة 214", s: "قيد التنفيذ", d: "var(--info)" }, { n: "#4190", t: "انسداد في صرف الحمام", p: "مبنى A · وحدة 105", s: "مفتوح", d: "var(--warn)" }, { n: "#4201", t: "تسريب في الشرفة", p: "مبنى C · وحدة 302", s: "قيد التنفيذ", d: "var(--info)" }],
  t3: [{ n: "#4166", t: "عطل في مكيف الصالة", p: "مبنى A · وحدة 45", s: "قيد التنفيذ", d: "var(--info)" }, { n: "#4177", t: "ضعف تبريد الغرفة", p: "مبنى B · وحدة 63", s: "بانتظار اعتماد الساكن", d: "var(--a-500)" }],
  t4: [{ n: "#4211", t: "تشقق في جدار الممر", p: "مبنى A · وحدة 12", s: "مفتوح", d: "var(--warn)" }, { n: "#4214", t: "باب الشرفة لا يغلق", p: "مبنى B · وحدة 27", s: "قيد التنفيذ", d: "var(--info)" }],
};
const REVIEWS: Record<string, { o: string; s: string; t: string; m: string }[]> = {
  t1: [{ o: "فهد المطيري", s: "5.0", t: "أنجز الإصلاح في نفس اليوم وترك المكان نظيفاً.", m: "بلاغ #4102 · ١٤ يوليو ٢٠٢٦" }, { o: "منال الزهراني", s: "4.5", t: "عمل جيد لكن التأخير في الوصول ساعة.", m: "بلاغ #4088 · ٢ يوليو ٢٠٢٦" }],
  t2: [{ o: "ليلى العمري", s: "5.0", t: "سريع ومحترف، شرح سبب العطل بالتفصيل.", m: "بلاغ #4121 · ١٩ يوليو ٢٠٢٦" }],
  t3: [{ o: "سعود القحطاني", s: "4.0", t: "حل المشكلة لكن احتاج زيارة ثانية.", m: "بلاغ #4055 · ٢٨ يونيو ٢٠٢٦" }],
  t4: [{ o: "بدر العنزي", s: "3.5", t: "الإصلاح استغرق وقتاً أطول من المتوقع.", m: "بلاغ #4031 · ٢١ يونيو ٢٠٢٦" }],
  t5: [{ o: "خالد السبيعي", s: "4.5", t: "دهان نظيف ومتقن.", m: "بلاغ #4144 · ٩ يوليو ٢٠٢٦" }],
};

const WIZ_LABELS = ["البيانات", "التخصص", "المشروع", "المراجعة", "الإنشاء"];
const blankDraft = () => ({ name: "", phone: "", email: "", specialty: null as string | null, projectId: null as string | null });
type HistEntry = { t: string; m: string; d: string };

type Screen = "list" | "wizard" | "profile" | "transfer";
const FILTERS = ["الكل", "متاح", "ينفذ مهمة", "غير نشط", "الأعلى تقييماً", "الأكثر إنجازاً", "حسب المشروع"] as const;

export function TechniciansManagementScreen() {
  return (
    <RouteGuard allow={COMPANY_ONLY}>
      <TechniciansManagementInner />
    </RouteGuard>
  );
}

function TechniciansManagementInner() {
  const router = useRouter();

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the `SEED` array, verbatim. No request.
   *   DEMO_MODE=false  `GET /api/technicians` + `/summary`, and every mutation
   *                    below is the REAL endpoint.
   *
   * `averageRating` arrives as `null` when a technician has no reviews. It is
   * rendered as the screen's own "—", never as 0 — an unrated technician is
   * not a badly-rated one.
   */
  const live = useTechnicians();
  const mutation = useMutation();
  /**
   * The company's real projects, so a technician row can name the project it is
   * genuinely attached to (and its real manager) instead of the fixture the old
   * `projectOf` fallback returned for every unmatched id.
   */
  const liveProjects = useCompanyProjectsSummary();
  const projectOf = makeProjectResolver(liveProjects.projects);
  const projectOptions: ProjectRef[] = DEMO_MODE ? PROJECTS : liveProjects.projects;

  const [loading, setLoading] = useState(true);
  const [confirm, confirmDialog] = useConfirm();
  const [screen, setScreen] = useState<Screen>("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("الكل");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [techs, setTechs] = useState<Tech[]>(SEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(blankDraft());
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSpecialty, setEditSpecialty] = useState<string | null>(null);
  const [tProject, setTProject] = useState<string | null>(null);
  const [tTouched, setTTouched] = useState(false);
  const [history, setHistory] = useState<Record<string, HistEntry[]>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    const h = decodeURIComponent((window.location.hash || "").replace("#", ""));
    if (h === "new") {
      setScreen("wizard");
      setStep(1);
      setDraft(blankDraft());
    }
    const t = window.setTimeout(() => setLoading(false), 560);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }
  function log(id: string, entry: HistEntry) {
    setHistory((h) => ({ ...h, [id]: [entry, ...(h[id] ?? [])] }));
  }
  async function resend(t: Tech) {
    if (!DEMO_MODE) {
      if (!(await mutation.run(() => backendAdmin.resendTechnicianInvitation(t.id)))) {
        flash(mutation.error ?? "");
        return;
      }
      live.reload();
      flash("تم إلغاء الدعوة السابقة وإرسال دعوة تفعيل جديدة.");
      return;
    }
    log(t.id, { t: "إعادة إرسال الدعوة", m: "أُلغيت الدعوة السابقة · دعوة جديدة · ٢٦ يوليو ٢٠٢٦", d: "var(--a-500)" });
    flash("تم إلغاء الدعوة السابقة وإرسال دعوة تفعيل جديدة.");
  }

  async function toggleActive(id: string) {
    const current = techsView.find((t) => t.id === id);
    // Deactivation is a visible state change that sits next to "تعديل البيانات";
    // it must be asked for, not triggered by a mis-tap.
    if (current?.active) {
      const ok = await confirm({
        title: "تعطيل حساب المقاول؟",
        body: `سيتوقّف ${current.name} عن استلام بلاغات جديدة. سجلّه التاريخي يبقى محفوظاً، ويمكنك إعادة التفعيل لاحقاً.`,
        confirmLabel: "تعطيل الحساب",
        destructive: true,
      });
      if (!ok) return;
    }
    if (!DEMO_MODE) {
      if (!current) return;
      if (!(await mutation.run(() => backendAdmin.setTechnicianStatus(id, !current.active)))) {
        flash(mutation.error ?? "");
        return;
      }
      live.reload();
      flash(current.active ? "تم تعطيل الحساب — لا يستلم بلاغات جديدة، وسجله التاريخي محفوظ." : "تمت إعادة تفعيل الحساب.");
      return;
    }
    let becameActive = false;
    setTechs((list) => list.map((x) => {
      if (x.id !== id) return x;
      becameActive = x.active;
      return { ...x, active: !x.active, status: !x.active ? "متاح" : "غير نشط" };
    }));
    flash(becameActive ? "تم تعطيل الحساب — لا يستلم بلاغات جديدة، وسجله التاريخي محفوظ." : "تمت إعادة تفعيل الحساب.");
  }

  // Real records projected into the SAME `Tech` shape the JSX renders.
  const realTechs: Tech[] = DEMO_MODE
    ? []
    : live.technicians.map((t) => ({
        id: t.id,
        name: t.name,
        specialty: t.specialty ?? "—",
        projectId: t.projectId,
        phone: t.phone,
        email: t.email,
        status: t.status === "ACTIVE" ? "متاح" : t.status === "BUSY" ? "ينفذ مهمة" : "غير نشط",
        account: t.status === "INACTIVE" ? "غير مفعل" : "مفعل",
        open: t.assignedRepairsCount,
        done: 0,
        // Honest "—": no reviews means no rating, never a zero.
        rating: "—",
        avgTime: "—",
        sla: 0,
        active: t.status !== "INACTIVE",
      } as unknown as Tech));

  const techsView = DEMO_MODE ? techs : realTechs;

  /**
   * The `#<id>` profile deep link. Resolved against the list this screen
   * actually renders rather than the fixture array, and re-checked when that
   * list arrives — in real mode it is empty on the first paint, so a
   * mount-only check could never match a real technician id.
   */
  const deepLinkIds = techsView.map((t) => t.id).join(",");
  useEffect(() => {
    const h = decodeURIComponent((window.location.hash || "").replace("#", ""));
    if (!h || h === "new") return;
    if (!deepLinkIds.split(",").includes(h)) return;
    setScreen("profile");
    setSelectedId(h);
  }, [deepLinkIds]);

  const sel = techsView.find((t) => t.id === selectedId) ?? null;
  const selProject = sel ? projectOf(sel.projectId) : null;

  const act = techsView.filter((t) => t.active);
  const ratedActive = act.filter((t) => t.rating !== "—").map((t) => parseFloat(t.rating));
  const avgRating = ratedActive.length ? (ratedActive.reduce((a, b) => a + b, 0) / ratedActive.length).toFixed(1) : "—";
  const toNum = (str: string) => {
    const ar = "٠١٢٣٤٥٦٧٨٩";
    const norm = str.replace(/[٠-٩]/g, (ch) => String(ar.indexOf(ch))).replace(/[^0-9.]/g, "");
    const n = parseFloat(norm);
    return isNaN(n) ? 0 : n;
  };
  const timeVals = act.filter((t) => t.done > 0).map((t) => toNum(t.avgTime)).filter(Boolean);
  const avgTime = timeVals.length ? (timeVals.reduce((a, b) => a + b, 0) / timeVals.length).toFixed(1) : "—";
  /**
   * `techsView` is THE list this screen renders, in both modes — the `SEED`
   * fixtures in Demo Mode, the real `GET /api/technicians` records otherwise.
   *
   * It existed before, but only `sel` and `act` read it: the KPI totals, the
   * filter predicate, the rendered rows and the empty-state conditions all
   * still read `techs`, which is the fixture `useState(SEED)` and is NEVER
   * replaced in real mode. That is why production showed seven fixture
   * technicians (ياسر الشمري, عبدالعزيز الدوسري, …) instead of the two real
   * ones. Every read below now goes through `techsView`; `techs` is reachable
   * only through it, and only in Demo Mode.
   */
  const kpis: [string, string | number, string, string][] = [
    ["إجمالي المقاولين", techsView.length, "مقاول", "var(--t-primary)"],
    ["متاح", act.filter((t) => t.status === "متاح").length, "مقاول", "var(--ok)"],
    ["ينفذ مهمة", act.filter((t) => t.status === "ينفذ مهمة").length, "مقاول", "var(--warn)"],
    ["متوسط التقييم", avgRating, "من 5", "var(--t-primary)"],
    ["متوسط مدة الإصلاح", avgTime, "يوم", "var(--t-primary)"],
    ["البلاغات النشطة", techsView.reduce((a, t) => a + t.open, 0), "بلاغ", "var(--t-primary)"],
  ];

  const q = query.trim();
  let rows = techsView.filter((t) => {
    const pr = projectOf(t.projectId);
    if (q && !(t.name.includes(q) || t.phone.includes(q) || t.email.includes(q) || t.specialty.includes(q) || pr.name.includes(q))) return false;
    if (filter === "متاح") return t.active && t.status === "متاح";
    if (filter === "ينفذ مهمة") return t.active && t.status === "ينفذ مهمة";
    if (filter === "غير نشط") return !t.active || t.status === "غير نشط";
    if (filter === "حسب المشروع") return projectFilter ? t.projectId === projectFilter : true;
    return true;
  });
  if (filter === "الأعلى تقييماً") rows = [...rows].sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
  if (filter === "الأكثر إنجازاً") rows = [...rows].sort((a, b) => b.done - a.done);

  function wizValid() {
    if (step === 1) return !!(draft.name.trim() && draft.phone.trim());
    if (step === 2) return !!draft.specialty;
    if (step === 3) return !!draft.projectId;
    return true;
  }
  function wizNext() {
    if (!wizValid()) {
      setTouched(true);
      return;
    }
    if (step < 5) {
      setStep(step + 1);
      setTouched(false);
      return;
    }
    if (!DEMO_MODE) {
      void (async () => {
        const ok = await mutation.run(() =>
          backendAdmin.createTechnician({
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            specialty: draft.specialty as string,
            projectId: draft.projectId as string,
          }),
        );
        if (!ok) { flash(mutation.error ?? ""); return; }
        live.reload();
        setScreen("list");
        setStep(1);
        setDraft(blankDraft());
        setTouched(false);
        flash("تم إنشاء المقاول وربطه بالمشروع وإرسال دعوة التفعيل.");
      })();
      return;
    }
    const id = "t" + Date.now();
    const tech: Tech = { id, name: draft.name, specialty: draft.specialty!, projectId: draft.projectId!, phone: draft.phone, email: draft.email || "—", status: "غير نشط", account: "غير مفعل", open: 0, done: 0, rating: "—", avgTime: "—", sla: 0, active: true };
    setTechs((list) => [tech, ...list]);
    setHistory((h) => ({ ...h, [id]: [{ t: "إرسال الدعوة", m: "دعوة إنشاء كلمة المرور · ٢٦ يوليو ٢٠٢٦", d: "var(--a-500)" }, { t: "إنشاء الحساب", m: "حساب غير مفعّل · مرتبط بمشروع " + projectOf(draft.projectId).name, d: "var(--g-600)" }] }));
    setScreen("list");
    setStep(1);
    setDraft(blankDraft());
    setTouched(false);
    flash("تم إنشاء المقاول وربطه بالمشروع وإرسال دعوة التفعيل.");
  }

  async function saveEdit() {
    if (!sel) return;
    if (!DEMO_MODE) {
      const body: { specialty?: string; phone?: string } = {};
      if (editSpecialty && editSpecialty !== sel.specialty) body.specialty = editSpecialty;
      if (editPhone && editPhone !== sel.phone) body.phone = editPhone;
      if (Object.keys(body).length === 0) { setEditing(false); return; }
      if (!(await mutation.run(() => backendAdmin.updateTechnician(sel.id, body)))) {
        flash(mutation.error ?? "");
        return;
      }
      live.reload();
      setEditing(false);
      flash("تم حفظ بيانات المقاول.");
      return;
    }
    setTechs((list) => list.map((x) => (x.id === sel.id ? { ...x, phone: editPhone || x.phone, email: editEmail || x.email, specialty: editSpecialty || x.specialty } : x)));
    setEditing(false);
    flash("تم حفظ بيانات المقاول.");
  }

  async function confirmTransfer() {
    if (!tProject || !sel) {
      setTTouched(true);
      return;
    }
    if (!DEMO_MODE) {
      if (!(await mutation.run(() => backendAdmin.transferTechnician(sel.id, tProject)))) {
        flash(mutation.error ?? "");
        return;
      }
      live.reload();
      setScreen("profile");
      flash("تم نقل المقاول — البلاغات التاريخية بقيت مرتبطة بمشروعه السابق.");
      return;
    }
    const from = selProject!.name, to = projectOf(tProject).name;
    setTechs((list) => list.map((x) => (x.id === sel.id ? { ...x, projectId: tProject, open: 0 } : x)));
    setHistory((h) => ({ ...h, [sel.id]: [{ t: "نقل المشروع", m: "من " + from + " إلى " + to + " · البلاغات التاريخية بقيت في " + from, d: "var(--info)" }, ...(h[sel.id] ?? [])] }));
    setScreen("profile");
    flash("تم نقل المقاول إلى " + to + " — البلاغات التاريخية بقيت مرتبطة بـ" + from + ".");
  }

  const navItems: NavPillItem[] = [
    { key: "dash", label: "لوحة التحكم", href: SCREEN_PATHS.RE1_CompanyDashboard, icon: <DashIcon /> },
    { key: "proj", label: "المشاريع", href: SCREEN_PATHS.RE2_ProjectsManagement, icon: <BuildingIcon /> },
    { key: "res", label: "السكان", href: SCREEN_PATHS.RE4_HomeownersManagement, icon: <PeopleIcon /> },
    { key: "con", label: "المقاولون", current: true, icon: <WrenchIcon /> },
  ];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh" }}>
      {confirmDialog}
      <div style={{ position: "relative", maxWidth: "1080px", margin: "0 auto", padding: "24px 22px 130px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "18px", fontSize: "12.5px", flexWrap: "wrap" }}>
          <button onClick={() => router.push(SCREEN_PATHS.RE1_CompanyDashboard)} style={{ background: "none", border: "none", color: "var(--t-secondary)", fontWeight: 600, cursor: "pointer", padding: 0 }}>لوحة التحكم</button>
          <span style={{ color: "var(--t-tertiary)" }}>›</span>
          {screen === "list" ? (
            <span style={{ color: "var(--t-primary)", fontWeight: 700 }}>المقاولون</span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <button onClick={() => { setScreen("list"); setEditing(false); }} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>المقاولون</button>
              <span style={{ color: "var(--t-tertiary)" }}>›</span>
              <span style={{ color: "var(--t-primary)", fontWeight: 700 }}>{screen === "wizard" ? "إضافة مقاول" : screen === "transfer" ? "نقل المشروع" : sel?.name ?? ""}</span>
            </span>
          )}
        </div>

        {screen === "list" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginBottom: "18px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><WrenchIconLg /></span>
                <div>
                  <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إدارة المقاولين</h1>
                  <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>إدارة جميع المقاولين العاملين في مشاريع الشركة.</div>
                </div>
              </div>
              <button onClick={() => { setScreen("wizard"); setStep(1); setDraft(blankDraft()); setTouched(false); }} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, padding: "12px 20px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)", whiteSpace: "nowrap" }}>
                <PlusIcon />
                إضافة مقاول
              </button>
            </div>

            <CompanyTopNavPills items={navItems} />

            {/* Only accurate in Demo Mode: real mode reads GET /api/technicians. */}
            {DEMO_MODE && (
              <div style={{ marginBottom: "18px" }}>
                <PendingBackendBadge note="لا توجد وحدة إدارة مقاولين حقيقية بعد — كل البيانات تجريبية محلية" />
              </div>
            )}

            {/* A failed request is a failure, never "no technicians yet". */}
            {!DEMO_MODE && live.status === "error" && (
              <div style={{ marginBottom: "18px", background: "var(--err-bg)", border: "1px solid var(--err-border)", borderRadius: "var(--r-lg)", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--err)" }}>{live.errorMessage ?? "تعذّر تحميل قائمة المقاولين."}</span>
                <button onClick={live.reload} style={{ fontSize: "12.5px", fontWeight: 600, padding: "8px 16px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>إعادة المحاولة</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "22px" }}>
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

            <div style={{ position: "relative", marginBottom: "13px" }}>
              <span style={{ position: "absolute", top: "50%", insetInlineStart: "14px", transform: "translateY(-50%)" }}><SearchIcon /></span>
              <input data-sk-search-field style={searchStyle} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الجوال أو البريد أو التخصص أو المشروع" autoComplete="off" />
            </div>

            <div data-sk-scroll-row style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "2px" }}>
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", borderRadius: "var(--r-full)", cursor: "pointer", whiteSpace: "nowrap", border: `1.5px solid ${filter === f ? "var(--g-900)" : "var(--n-border-strong)"}`, background: filter === f ? "var(--g-900)" : "var(--n-surface)", color: filter === f ? "var(--t-on-dark)" : "var(--t-secondary)" }}>{f}</button>
              ))}
            </div>

            {filter === "حسب المشروع" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "9px", marginBottom: "14px" }}>
                {projectOptions.map((p) => (
                  <button key={p.id} onClick={() => setProjectFilter(projectFilter === p.id ? null : p.id)} style={{ fontSize: "12px", fontWeight: 600, padding: "10px 12px", border: `1.5px solid ${projectFilter === p.id ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: projectFilter === p.id ? "var(--g-50)" : "var(--n-surface)", color: projectFilter === p.id ? "var(--g-700)" : "var(--t-secondary)", cursor: "pointer", textAlign: "start" }}>{p.name}</button>
                ))}
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                {[0, 1, 2].map((i) => <div key={i} style={{ height: "170px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />)}
              </div>
            ) : rows.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                {rows.map((t) => {
                  const pr = projectOf(t.projectId);
                  const st = ST_STYLE[t.active ? t.status : "غير نشط"];
                  const inactiveAccount = t.account === "غير مفعل";
                  return (
                    <div key={t.id} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)", opacity: t.active ? 1 : 0.62 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "14px" }}>
                        <span style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "15px", fontWeight: 700 }}>{t.name.slice(0, 1)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "15.5px", fontWeight: 700 }}>{t.name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: st.bg, color: st.fg }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.dot }} />
                              {t.active ? t.status : "حساب معطّل"}
                            </span>
                            {inactiveAccount && <span style={{ fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: "var(--err-bg)", color: "var(--err-strong)" }}>الحساب غير مفعل</span>}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginTop: "5px" }}>{t.specialty} · {pr.name} · مدير المشروع {pr.manager}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "7px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11.5px", color: "var(--t-secondary)" }}>{t.phone}</span>
                            <span style={{ fontSize: "11.5px", color: "var(--t-secondary)" }}>{t.email}</span>
                          </div>
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 700, color: "var(--a-700)", flex: "none" }}><StarIcon />{t.rating}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px", marginBottom: "14px" }}>
                        {[["بلاغات مفتوحة", t.open], ["إصلاحات منجزة", t.done], ["متوسط التقييم", t.rating], ["متوسط الإصلاح", t.avgTime], ["الالتزام بالمدة", t.sla + "%"]].map(([label, value], i) => (
                          <div key={label} style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}>
                            <div style={{ fontSize: "10.5px", color: "var(--t-tertiary)", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: i === 4 ? (t.sla >= 90 ? "var(--ok)" : t.sla >= 80 ? "var(--warn)" : "var(--err)") : "var(--t-primary)" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "13px", borderTop: "1px solid var(--n-border)" }}>
                        <button onClick={() => { setScreen("profile"); setSelectedId(t.id); setEditing(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>عرض المقاول<ChevronIcon /></button>
                        <button onClick={() => { setScreen("profile"); setSelectedId(t.id); setEditing(true); setEditPhone(t.phone); setEditEmail(t.email); setEditSpecialty(t.specialty); }} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>تعديل البيانات</button>
                        <button onClick={() => { setScreen("transfer"); setSelectedId(t.id); setTProject(null); setTTouched(false); }} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>نقل المشروع</button>
                        {inactiveAccount && <button onClick={() => resend(t)} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}><ResendIcon />إعادة إرسال الدعوة</button>}
                        <button onClick={() => toggleActive(t.id)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-tertiary)", cursor: "pointer", marginInlineStart: "auto" }}>{t.active ? "تعطيل الحساب" : "إعادة التفعيل"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: "var(--n-surface)", border: "1px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "46px 24px", textAlign: "center" }}>
                <span style={{ width: "54px", height: "54px", borderRadius: "var(--r-lg)", background: "var(--n-surface2)", color: "var(--t-tertiary)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}><WrenchIcon /></span>
                <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>{techsView.length === 0 ? "لا يوجد مقاولون حتى الآن." : "لا يوجد مقاولون مطابقون."}</div>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginBottom: "18px" }}>{techsView.length === 0 ? "ابدأ بإضافة أول مقاول وربطه بأحد مشاريع الشركة." : "جرّب تعديل البحث أو الفلتر."}</div>
                <button onClick={() => { setScreen("wizard"); setStep(1); setDraft(blankDraft()); setTouched(false); }} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 22px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>{techsView.length === 0 ? "إضافة أول مقاول" : "إضافة مقاول"}</button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", fontSize: "11.5px", color: "var(--t-tertiary)" }}>
              <InfoIcon />
              كل مقاول يتبع مشروعاً واحداً فقط · لا تُحذف الحسابات بل تُعطَّل · البلاغات التاريخية تبقى مرتبطة بمشروعها الأصلي بعد النقل.
            </div>
          </div>
        )}

        {screen === "wizard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "20px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><WrenchIconLg /></span>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إضافة مقاول</h1>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>إنشاء حساب غير مفعّل، تحديد التخصص، وربط المقاول بمشروع واحد.</div>
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
                      <input style={inputStyle} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="مثال: ياسر الشمري" />
                      {touched && step === 1 && !draft.name.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم الجوال</label>
                      <input style={inputStyle} value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="٠٥xxxxxxxx" />
                      {touched && step === 1 && !draft.phone.trim() && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--err)", marginTop: "5px" }}>هذا الحقل مطلوب</div>}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>البريد الإلكتروني</label>
                      <input style={inputStyle} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@sukun.sa" />
                    </div>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>البيانات المهنية</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "16px" }}>اختر تخصص المقاول — يحدد نوع البلاغات التي يُوجَّه إليها تلقائياً.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "9px" }}>
                    {SPECIALTIES.map((sp) => (
                      <button key={sp} onClick={() => setDraft((d) => ({ ...d, specialty: sp }))} style={{ fontSize: "12.5px", fontWeight: 600, padding: "13px 14px", border: `1.5px solid ${draft.specialty === sp ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: draft.specialty === sp ? "var(--g-50)" : "var(--n-surface)", color: draft.specialty === sp ? "var(--g-700)" : "var(--t-secondary)", cursor: "pointer", textAlign: "start" }}>{sp}</button>
                    ))}
                  </div>
                  {touched && step === 2 && !draft.specialty && <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)", marginTop: "14px" }}>يجب اختيار التخصص.</div>}
                </div>
              )}
              {step === 3 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>ربط المشروع</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t-tertiary)", marginBottom: "16px" }}>مشروع واحد إلزامي لكل مقاول — لا يمكن ربط المقاول بأكثر من مشروع.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
                    {projectOptions.map((p) => (
                      <button key={p.id} onClick={() => setDraft((d) => ({ ...d, projectId: p.id }))} style={{ display: "flex", alignItems: "center", gap: "11px", textAlign: "start", fontSize: "12.5px", fontWeight: 600, padding: "14px", border: `1.5px solid ${draft.projectId === p.id ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: draft.projectId === p.id ? "var(--g-50)" : "var(--n-surface)", color: draft.projectId === p.id ? "var(--g-700)" : "var(--t-primary)", cursor: "pointer" }}>
                        <span style={{ width: "34px", height: "34px", borderRadius: "var(--r-sm)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><BuildingIcon /></span>
                        <span style={{ flex: 1 }}><span style={{ display: "block" }}>{p.name}</span><span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-tertiary)", marginTop: "3px" }}>{p.city} · مدير المشروع {p.manager}</span></span>
                      </button>
                    ))}
                  </div>
                  {touched && step === 3 && !draft.projectId && <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)", marginTop: "14px" }}>يجب اختيار المشروع.</div>}
                </div>
              )}
              {step === 4 && (
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>مراجعة البيانات</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {[["الاسم الكامل", draft.name || "—", "span 2"], ["رقم الجوال", draft.phone || "—", "span 1"], ["البريد الإلكتروني", draft.email || "—", "span 1"], ["التخصص", draft.specialty || "—", "span 1"], ["المشروع", draft.projectId ? projectOf(draft.projectId).name : "—", "span 1"], ["مدير المشروع", draft.projectId ? projectOf(draft.projectId).manager : "—", "span 1"], ["حالة الحساب عند الإنشاء", "غير مفعل — بانتظار إنشاء كلمة المرور", "span 2"]].map(([label, value, span]) => (
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
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>إنشاء المقاول</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {["إنشاء حساب المقاول بحالة غير مفعّل", "ربط المقاول بالمشروع المحدد", "إرسال دعوة إنشاء كلمة المرور", "تسجيل الدعوة في سجل الحساب", "إتاحة لوحة المقاول بعد التفعيل لاستلام بلاغات مشروعه"].map((label, i) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "11px", background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "13px 15px" }}>
                        <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "11px", fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t-secondary)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "16px", marginTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "9px" }}><MailIcon /><span style={{ fontSize: "12px", fontWeight: 700, color: "var(--a-800)" }}>نص الدعوة المرسلة</span></div>
                    <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", lineHeight: 1.85 }}>«تمت إضافتك إلى منصة سكن. تم إنشاء حسابك بنجاح. يرجى إنشاء كلمة المرور لتفعيل الحساب.»</div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--n-border)", flexWrap: "wrap" }}>
                <button onClick={() => (step === 1 ? (setScreen("list"), setDraft(blankDraft())) : (setStep(step - 1), setTouched(false)))} style={{ fontSize: "13px", fontWeight: 600, padding: "11px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>{step === 1 ? "إلغاء" : "السابق"}</button>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--t-tertiary)" }}>الخطوة {step} من 5</span>
                  <button onClick={wizNext} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 24px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>{step < 5 ? "التالي" : "إنشاء المقاول"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "profile" && sel && selProject && (
          <ProfileView
            sel={sel} selProject={selProject}
            editing={editing} setEditing={setEditing}
            editPhone={editPhone} setEditPhone={setEditPhone}
            editEmail={editEmail} setEditEmail={setEditEmail}
            editSpecialty={editSpecialty} setEditSpecialty={setEditSpecialty}
            saveEdit={saveEdit}
            onTransfer={() => { setScreen("transfer"); setTProject(null); setTTouched(false); }}
            onResend={() => resend(sel)}
            onToggleActive={() => toggleActive(sel.id)}
            history={history[sel.id]}
          />
        )}

        {screen === "transfer" && sel && selProject && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "13px", marginBottom: "20px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-900)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><TransferIcon /></span>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>نقل المشروع</h1>
                <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "2px" }}>{sel.name} · {sel.specialty}</div>
              </div>
            </div>
            <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "22px", boxShadow: "var(--sh-1)", maxWidth: "820px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>هل تريد نقل المقاول إلى مشروع آخر؟</div>
              <div style={{ fontSize: "12px", color: "var(--t-secondary)", marginBottom: "18px" }}>المشروع الحالي: <span style={{ fontWeight: 700, color: "var(--t-primary)" }}>{selProject.name}</span></div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "8px" }}>المشروع الجديد</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
                {projectOptions.map((p) => {
                  const same = sel.projectId === p.id;
                  return (
                    <button key={p.id} disabled={same} title={same ? "المقاول مرتبط بهذا المشروع حالياً" : "نقل المقاول إلى هذا المشروع"} onClick={() => !same && setTProject(p.id)} style={{ display: "flex", alignItems: "center", gap: "11px", textAlign: "start", fontSize: "12.5px", fontWeight: 600, padding: "14px", border: `1.5px solid ${tProject === p.id ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: tProject === p.id ? "var(--g-50)" : "var(--n-surface)", color: tProject === p.id ? "var(--g-700)" : "var(--t-primary)", cursor: same ? "not-allowed" : "pointer", opacity: same ? 0.5 : 1 }}>
                      <span style={{ width: "34px", height: "34px", borderRadius: "var(--r-sm)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><BuildingIcon /></span>
                      <span style={{ flex: 1 }}><span style={{ display: "block" }}>{p.name}</span><span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--t-tertiary)", marginTop: "3px" }}>{same ? "المشروع الحالي" : `${p.city} · ${p.manager}`}</span></span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px", marginTop: "18px" }}>
                <InfoIconAccent />
                <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.75 }}>البلاغات المستقبلية ستُوجَّه للمشروع الجديد، أما البلاغات التاريخية فتبقى مرتبطة بمشروعها الأصلي ولا يُعاد إسنادها أبداً.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                <button onClick={confirmTransfer} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 24px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>تأكيد النقل</button>
                <button onClick={() => setScreen("profile")} style={{ fontSize: "13px", fontWeight: 600, padding: "12px 20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إلغاء</button>
                {tTouched && !tProject && <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--err)" }}>اختر المشروع الجديد لإتمام النقل.</span>}
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

function ProfileView(props: {
  sel: Tech; selProject: ProjectRef;
  editing: boolean; setEditing: (v: boolean) => void;
  editPhone: string; setEditPhone: (v: string) => void;
  editEmail: string; setEditEmail: (v: string) => void;
  editSpecialty: string | null; setEditSpecialty: (v: string) => void;
  saveEdit: () => void; onTransfer: () => void; onResend: () => void; onToggleActive: () => void;
  history?: HistEntry[];
}) {
  const { sel, selProject, editing, setEditing, editPhone, setEditPhone, editEmail, setEditEmail, editSpecialty, setEditSpecialty, saveEdit, onTransfer, onResend, onToggleActive, history } = props;
  const st = ST_STYLE[sel.active ? sel.status : "غير نشط"];
  const rep = OPEN_REPORTS[sel.id] ?? [];
  const rv = REVIEWS[sel.id] ?? [];
  /**
   * Demo Mode's illustrative account history. In real mode there is no
   * per-technician audit endpoint, so this stays EMPTY rather than printing
   * four invented events ("اعتمد الساكن الإصلاح · قبل يومين") under a real
   * person's profile. Entries added by this session's own real mutations still
   * appear — they come in through `history`.
   */
  const baseHist: HistEntry[] =
    history ??
    (DEMO_MODE
      ? [
          { t: "إغلاق بلاغ", m: "اعتمد الساكن الإصلاح · قبل يومين", d: "var(--ok)" },
          { t: "بدء إصلاح", m: "بلاغ داخل " + selProject.name + " · قبل 3 أيام", d: "var(--info)" },
          { t: "تفعيل الحساب", m: "أنشأ المقاول كلمة المرور وسجّل الدخول", d: "var(--g-600)" },
          { t: "إنشاء الحساب", m: "أنشأته الشركة العقارية", d: "var(--t-tertiary)" },
        ]
      : []);
  const infoRows = [["الاسم الكامل", sel.name], ["رقم الجوال", sel.phone], ["البريد الإلكتروني", sel.email], ["التخصص", sel.specialty], ["المشروع", selProject.name], ["مدير المشروع", selProject.manager], ["حالة الحساب", sel.account === "مفعل" ? "مفعل" : "غير مفعل"]];
  const pfStats: [string, string, string][] = [["بلاغات مفتوحة", String(sel.open), "var(--t-primary)"], ["إصلاحات منجزة", String(sel.done), "var(--t-primary)"], ["متوسط التقييم", sel.rating, "var(--a-700)"], ["متوسط الإصلاح", sel.avgTime, "var(--t-primary)"], ["الالتزام بالمدة", sel.sla + "%", sel.sla >= 90 ? "var(--ok)" : sel.sla >= 80 ? "var(--warn)" : "var(--err)"]];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "13px", minWidth: 0 }}>
          <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: "17px", fontWeight: 700 }}>{sel.name.slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{sel.name}</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--r-full)", background: st.bg, color: st.fg }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.dot }} />
                {sel.active ? sel.status : "حساب معطّل"}
              </span>
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--t-secondary)", marginTop: "3px" }}>{sel.specialty} · {selProject.name} · مدير المشروع {selProject.manager}</div>
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "15px", fontWeight: 700, color: "var(--a-700)", flex: "none" }}><StarIcon />{sel.rating}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: "18px" }}>
        <button onClick={() => setEditing(!editing)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>تعديل البيانات</button>
        <button onClick={onTransfer} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>نقل المشروع</button>
        {sel.account === "غير مفعل" && <button onClick={onResend} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>إعادة إرسال الدعوة</button>}
        <button onClick={onToggleActive} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-tertiary)", cursor: "pointer" }}>{sel.active ? "تعطيل الحساب" : "إعادة تفعيل الحساب"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", marginBottom: "16px" }}>
        {pfStats.map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "15px", boxShadow: "var(--sh-1)" }}>
            <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginBottom: "7px" }}>{label}</div>
            <div style={{ fontSize: "19px", fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: "14px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>البيانات الشخصية والمهنية</div>
            {editing ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>رقم الجوال</label><input style={inputStyle} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
                  <div><label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>البريد الإلكتروني</label><input style={inputStyle} value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "6px" }}>التخصص</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                      {SPECIALTIES.map((sp) => (
                        <button key={sp} onClick={() => setEditSpecialty(sp)} style={{ fontSize: "12px", fontWeight: 600, padding: "10px 12px", border: `1.5px solid ${editSpecialty === sp ? "var(--g-500)" : "var(--n-border-strong)"}`, borderRadius: "var(--r-md)", background: editSpecialty === sp ? "var(--g-50)" : "var(--n-surface)", color: editSpecialty === sp ? "var(--g-700)" : "var(--t-secondary)", cursor: "pointer", textAlign: "start" }}>{sp}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "9px", marginTop: "14px" }}>
                  <button onClick={saveEdit} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>حفظ التعديل</button>
                  <button onClick={() => setEditing(false)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "9px 16px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            ) : (
              <div>
                {infoRows.map(([label, value], i) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 0", borderBottom: i === infoRows.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                    <span style={{ fontSize: "12px", color: "var(--t-tertiary)" }}>{label}</span>
                    <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "end" }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>البلاغات المفتوحة حالياً</div>
            {rep.map((r, i) => (
              <div key={r.n} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 0", borderBottom: i === rep.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: r.d, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{r.t}</div>
                  <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "2px" }}>{r.n} · {r.p} · {r.s}</div>
                </div>
              </div>
            ))}
            {rep.length === 0 && <div style={{ fontSize: "12px", color: "var(--t-tertiary)", padding: "8px 0" }}>لا توجد بلاغات مفتوحة حالياً.</div>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>تقييمات السكان</div>
            {rv.map((r, i) => (
              <div key={r.o + i} style={{ padding: "12px 0", borderBottom: i === rv.length - 1 ? "none" : "1px solid var(--n-border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{r.o}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 700, color: "var(--a-700)" }}><StarIcon small />{r.s}</span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--t-secondary)", lineHeight: 1.7 }}>{r.t}</div>
                <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "5px" }}>{r.m}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "18px", boxShadow: "var(--sh-1)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px" }}>النشاط الأخير</div>
            {baseHist.map((h, i) => (
              <div key={h.t + i} style={{ display: "flex", gap: "13px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                  <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: h.d, border: "2px solid var(--n-surface)", boxShadow: `0 0 0 2px ${h.d}` }} />
                  <span style={{ width: "2px", flex: 1, background: i === baseHist.length - 1 ? "transparent" : "var(--n-border)", minHeight: "22px" }} />
                </div>
                <div style={{ paddingBottom: "14px", flex: 1 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{h.t}</div>
                  <div style={{ fontSize: "11px", color: "var(--t-tertiary)", marginTop: "3px" }}>{h.m}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", fontSize: "13.5px", padding: "11px 13px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };
const searchStyle: React.CSSProperties = { width: "100%", fontSize: "14px", padding: "12px 14px 12px 42px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none" };

function DashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>; }
function BuildingIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /></svg>; }
function PeopleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function WrenchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>; }
function WrenchIconLg() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>; }
function PlusIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
function SearchIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--t-tertiary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
function ChevronIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>; }
function ResendIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>; }
function InfoIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>; }
function InfoIconAccent() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>; }
function CheckIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function MailIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--a-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></svg>; }
function TransferIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>; }
function StarIcon({ small }: { small?: boolean }) {
  const s = small ? 13 : 15;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="var(--a-500)" stroke="var(--a-500)" strokeWidth="1.4"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" /></svg>;
}
