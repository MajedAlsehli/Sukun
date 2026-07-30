"use client";

/**
 * C1 · مهامي (Contractor Tasks) + C2 · تفاصيل البلاغ (Repair Details) —
 * ported from `Sakn Contractor Dashboard.dc.html` (Downloads/Sakn.d.zip).
 * The source itself keeps both as one file's internal `screen` state
 * (`list`/`c2`/`locked`/`success`) — there is no separate C2 export or
 * deep-linkable id (`C1_Contractor_Tasks.md`/`C2_Repair_Details.md` both
 * name the same source file) — so this stays one component/route, matching
 * the source exactly, rather than inventing a `/contractor/repair/{id}`
 * route nothing in the production export supports.
 *
 * No Repair backend (Task 009 not started) — fully local/demo seed tasks.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { TECHNICIAN_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { DEMO_MODE } from "@/lib/demo/config";
import { useTechnicianTasks } from "@/lib/hooks/usePmTech";
import { SukunWordmark } from "@/components/brand/SukunBrand";

interface Task {
  id: string; number: string; project: string; unit: string; building: string; floor: string;
  title: string; priority: "عالية" | "متوسطة" | "منخفضة"; ago: string; status: "new" | "inprogress" | "waiting";
  owner: string; warranty: "in" | "out"; category: string; confidence: number; aiDescription: string; homeownerNote: string;
  homeownerPhotos: string[]; district: string; city: string;
}

const SEED: Task[] = [
  { id: "t1", number: "#2418", project: "تلال الرياض", unit: "A-214", building: "مبنى A", floor: "الطابق 2", title: "تسريب في دورة المياه", priority: "عالية", ago: "منذ ساعتين", status: "new", owner: "محمد العتيبي", warranty: "in", category: "سباكة", confidence: 92, aiDescription: "تم اكتشاف تسريب بالقرب من المغسلة بناءً على تحليل الصور المرفقة.", homeownerNote: "المشكلة بدأت منذ يومين وتزداد سوءاً.", homeownerPhotos: ["h1", "h2", "h3"], district: "حي النرجس", city: "الرياض" },
  { id: "t2", number: "#2402", project: "تلال الرياض", unit: "C-108", building: "مبنى C", floor: "الطابق 1", title: "عطل في مفتاح الإنارة الرئيسي", priority: "متوسطة", ago: "منذ 5 ساعات", status: "new", owner: "سارة القحطاني", warranty: "in", category: "كهرباء", confidence: 87, aiDescription: "تم رصد عطل في مفتاح الإنارة الرئيسي بالصالة.", homeownerNote: "", homeownerPhotos: ["h1"], district: "حي النرجس", city: "الرياض" },
  { id: "t3", number: "#2390", project: "واحة النخيل", unit: "B-045", building: "مبنى B", floor: "الطابق 4", title: "تشقق بسيط في الجدار الخارجي", priority: "منخفضة", ago: "أمس", status: "inprogress", owner: "فيصل الدوسري", warranty: "out", category: "تشققات", confidence: 81, aiDescription: "تم رصد تشقق سطحي بسيط في الجدار الخارجي.", homeownerNote: "", homeownerPhotos: ["h1", "h2"], district: "حي الفلاح", city: "الرياض" },
  { id: "t4", number: "#2377", project: "تلال الرياض", unit: "A-092", building: "مبنى A", floor: "الطابق 3", title: "عطل في تكييف الصالة", priority: "عالية", ago: "منذ يومين", status: "inprogress", owner: "نورة الشمري", warranty: "in", category: "أخرى", confidence: 84, aiDescription: "تم رصد عطل في وحدة تكييف الصالة الرئيسية.", homeownerNote: "الصوت غريب عند التشغيل.", homeownerPhotos: [], district: "حي النرجس", city: "الرياض" },
  { id: "t5", number: "#2360", project: "واحة النخيل", unit: "D-021", building: "مبنى D", floor: "الطابق 1", title: "تسريب أسفل مغسلة المطبخ", priority: "متوسطة", ago: "منذ 3 أيام", status: "waiting", owner: "عبدالله الحربي", warranty: "in", category: "سباكة", confidence: 90, aiDescription: "تم اكتشاف تسريب أسفل مغسلة المطبخ.", homeownerNote: "", homeownerPhotos: ["h1", "h2", "h3", "h4"], district: "حي الفلاح", city: "الرياض" },
];
const priMap = { "عالية": { c: "var(--err)", b: "var(--err-bg)" }, "متوسطة": { c: "var(--warn-strong)", b: "var(--warn-bg)" }, "منخفضة": { c: "var(--g-700)", b: "var(--g-50)" } } as const;
const statusMap = { new: { text: "بانتظار البدء", c: "var(--info)", b: "var(--info-bg)" }, inprogress: { text: "قيد التنفيذ", c: "var(--warn-strong)", b: "var(--warn-bg)" }, waiting: { text: "بانتظار اعتماد المالك", c: "var(--t-secondary)", b: "var(--n-surface2)" } } as const;
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };

export function ContractorDashboardScreen() {
  return (
    <RouteGuard allow={TECHNICIAN_ONLY}>
      <ContractorDashboardScreenInner />
    </RouteGuard>
  );
}

function ContractorDashboardScreenInner() {
  const router = useRouter();
  const [tasks, setTasks] = useState(SEED);
  const [filter, setFilter] = useState("all");
  const [screen, setScreen] = useState<"list" | "c2" | "comparing" | "locked" | "success">("list");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeRepairId, setActiveRepairId] = useState<string | null>(null);
  const [repairPhotos, setRepairPhotos] = useState<string[]>([]);
  /**
   * The REAL after-repair photos. The approved "+ إضافة" control produces a
   * placeholder id for its demo journey; in real mode the same button opens a
   * file picker and the chosen bytes are staged here, because
   * `submitRepairSchema` requires at least one genuine image.
   */
  const [repairFiles, setRepairFiles] = useState<{ name: string; type: string; base64: string }[]>([]);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const [repairNote, setRepairNote] = useState("");
  const [submitError, setSubmitError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the `SEED` tasks, verbatim, with the local state machine.
   *   DEMO_MODE=false  `GET /api/technician/tasks` + `/tasks/summary`, and the
   *                    REAL `POST /api/reports/{id}/start` and
   *                    `/submit-repair`.
   *
   * The single-active-repair rule is the BACKEND's: starting a second repair
   * answers `409 ACTIVE_REPAIR_EXISTS`. The screen's own "locked" state is kept
   * for that case rather than the error being swallowed.
   */
  const live = useTechnicianTasks();

  const realTasks: Task[] = DEMO_MODE
    ? []
    : live.taskDtos.map((r) => ({
        id: r.id,
        number: `#${r.reportNumber}`,
        project: r.location.projectName,
        unit: r.location.unitNumber,
        building: r.location.buildingName,
        floor: `الطابق ${r.location.unitFloor}`,
        title: r.problemText,
        priority: (r.priority === "HIGH" ? "عالية" : r.priority === "LOW" ? "منخفضة" : "متوسطة") as Task["priority"],
        ago: new Date(r.createdAt).toISOString().slice(0, 10),
        status: (r.status === "ROUTED" ? "new" : r.status === "AWAITING_OWNER_APPROVAL" ? "waiting" : "inprogress") as Task["status"],
        owner: r.homeowner.name,
        warranty: (r.warranty.verdict === "COVERED" ? "in" : "out") as Task["warranty"],
        category: r.category,
        // Null on a manually-filed report; never back-filled.
        confidence: r.ai?.confidence ?? 0,
        aiDescription: r.ai?.problemText ?? "",
        homeownerNote: r.homeownerNote ?? "",
        homeownerPhotos: Array.from({ length: r.photoCounts.homeowner }, (_, i) => `h${i + 1}`),
        district: r.location.projectDistrict ?? "—",
        city: r.location.projectCity,
      } as unknown as Task));

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4200); }
  function tryOpen(id: string) {
    if (!activeRepairId) { setScreen("c2"); setActiveTaskId(id); setActiveRepairId(id); setRepairPhotos([]); setRepairNote(""); setSubmitError(false); return; }
    if (activeRepairId === id) { setScreen("c2"); setActiveTaskId(id); return; }
    setScreen("locked"); setActiveTaskId(activeRepairId);
  }
  async function startTask(id: string) {
    if (!DEMO_MODE) {
      // The REAL start. A 409 ACTIVE_REPAIR_EXISTS is the single-active-repair
      // rule and is SHOWN, never worked around.
      if (!(await live.startRepair(id))) {
        flash(live.actionError ?? "");
        return;
      }
      setActiveRepairId(id);
      flash("تمت مزامنة الحالة مع المالك: «بدأ المقاول العمل على بلاغك».");
      setScreen("c2"); setActiveTaskId(id); setRepairPhotos([]); setRepairNote(""); setSubmitError(false);
      return;
    }
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: "inprogress" } : t)));
    setActiveRepairId(id);
    flash("تمت مزامنة الحالة مع المالك: «بدأ المقاول العمل على بلاغك».");
    setTimeout(() => { setScreen("c2"); setActiveTaskId(id); setRepairPhotos([]); setRepairNote(""); setSubmitError(false); }, 500);
  }
  async function submitRepair() {
    if (repairPhotos.length < 1) { setSubmitError(true); return; }
    if (!DEMO_MODE) {
      const id = activeTaskId!;
      setScreen("comparing");
      // The Backend REQUIRES at least one real after-photo. The approved
      // capture control produces placeholder ids rather than files, so the
      // photos are staged from the picker below; see `repairFiles`.
      const photos = repairFiles.map((f, i) => ({
        fileName: f.name || `after-${i + 1}.jpg`,
        mimeType: (f.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp",
        contentBase64: f.base64,
      }));
      if (photos.length === 0) {
        setScreen("c2");
        setSubmitError(true);
        return;
      }
      const ok = await live.submitRepair(id, photos, repairNote || undefined);
      if (!ok) {
        setScreen("c2");
        flash(live.actionError ?? "");
        return;
      }
      setActiveRepairId(null);
      setScreen("success");
      flash("تم إشعار المالك: «قارن الذكاء الاصطناعي الصور، وبانتظار موافقتك على الإصلاح».");
      return;
    }
    setScreen("comparing");
    setTimeout(() => {
      const id = activeTaskId!;
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: "waiting" } : t)));
      setActiveRepairId(null);
      setScreen("success");
      flash("تم إشعار المالك: «قارن الذكاء الاصطناعي الصور، وبانتظار موافقتك على الإصلاح».");
    }, 1600);
  }

  const tasksView = DEMO_MODE ? tasks : realTasks;
  const withMeta = tasksView.map((t) => ({ ...t, pri: priMap[t.priority], st: statusMap[t.status], isActiveRepair: activeRepairId === t.id }));
  const filtered = filter === "all" ? withMeta : withMeta.filter((t) => t.status === filter);
  const activeTask = withMeta.find((t) => t.id === activeTaskId) ?? withMeta[0];

  if (screen === "c2" && activeTask) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", position: "relative" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 22px 120px" }}>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px" }}>تفاصيل البلاغ</h1>
          <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 12 }}>راجع تفاصيل البلاغ وأكمل عملية الإصلاح.</div>
          {DEMO_MODE && <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Repair Module في الخادم بعد (Task 009) — هذه الشاشة محلية." /></div>}

          <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: "24px 26px", color: "var(--t-on-dark)", boxShadow: "var(--sh-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}><span dir="ltr" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-300)" }}>{activeTask.number}</span><span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: "var(--r-full)", background: "rgba(201,138,43,.25)", color: "var(--warn-on-dark)" }}>قيد التنفيذ</span></div>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 16px" }}>{activeTask.title}</h2>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المشروع</div><div style={{ fontSize: 13, fontWeight: 600 }}>{activeTask.project}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المبنى / الطابق</div><div style={{ fontSize: 13, fontWeight: 600 }}>{activeTask.building} / {activeTask.floor}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>الوحدة</div><div style={{ fontSize: 13, fontWeight: 600 }} dir="ltr">{activeTask.unit}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المالك</div><div style={{ fontSize: 13, fontWeight: 600 }}>{activeTask.owner}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>الضمان</div><div style={{ fontSize: 13, fontWeight: 600 }}>{activeTask.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</div></div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>نظرة عامة على المشكلة</h3>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 5 }}>وصف الذكاء الاصطناعي</div>
              <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{activeTask.aiDescription}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 5 }}>ملاحظات المالك</div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: activeTask.homeownerNote ? "var(--t-primary)" : "var(--t-tertiary)" }}>{activeTask.homeownerNote || "لا توجد ملاحظات إضافية."}</div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>صور المالك ({activeTask.homeownerPhotos.length})</h3>
            {activeTask.homeownerPhotos.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                {activeTask.homeownerPhotos.map((p) => <div key={p} style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />)}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 24, color: "var(--t-tertiary)", fontSize: 13, ...card }}>لم يرفق المالك صوراً لهذا البلاغ.</div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>صور بعد الإصلاح ({repairPhotos.length} من ١٠)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
              {repairPhotos.map((p) => (
                <div key={p} style={{ position: "relative", aspectRatio: "1/1", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }}>
                  <button onClick={() => setRepairPhotos((ps) => ps.filter((x) => x !== p))} style={{ position: "absolute", top: 5, insetInlineStart: 5, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(var(--g-900-rgb), .72)", color: "var(--t-on-dark)", cursor: "pointer" }}>✕</button>
                </div>
              ))}
              {repairPhotos.length < 10 && (
                <button onClick={() => { if (DEMO_MODE) { setRepairPhotos((ps) => [...ps, `rep${ps.length + 1}`]); setSubmitError(false); } else { afterInputRef.current?.click(); } }} style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", border: "1.5px dashed var(--n-border-strong)", background: "var(--n-surface2)", color: "var(--g-700)", cursor: "pointer" }}>+ إضافة</button>
              )}
              {/* Real mode only, and visually hidden: the approved control above
                  is what the technician sees and clicks. */}
              <input
                ref={afterInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                style={{ display: "none" }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  for (const f of files) {
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const r = new FileReader();
                      r.onerror = () => reject(new Error("unreadable"));
                      r.onload = () => {
                        const v = typeof r.result === "string" ? r.result : "";
                        const c = v.indexOf(",");
                        resolve(c >= 0 ? v.slice(c + 1) : v);
                      };
                      r.readAsDataURL(f);
                    });
                    setRepairFiles((ps) => [...ps, { name: f.name, type: f.type, base64 }]);
                    setRepairPhotos((ps) => [...ps, `rep${ps.length + 1}`]);
                  }
                  setSubmitError(false);
                  e.target.value = "";
                }}
              />
            </div>
            {submitError && <div style={{ display: "flex", gap: 10, background: "var(--err-bg)", border: "1px solid var(--err-border)", borderRadius: "var(--r-md)", padding: "12px 14px", marginTop: 12 }}><span style={{ fontSize: 13, color: "var(--err)" }}>يجب رفع صورة واحدة على الأقل بعد الإصلاح.</span></div>}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>ملاحظات الإصلاح</h3>
            <textarea value={repairNote} onChange={(e) => setRepairNote(e.target.value)} placeholder="مثال: تم استبدال السيفون وإيقاف مصدر التسريب." style={{ width: "100%", minHeight: 88, padding: 13, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", resize: "vertical" }} />
          </div>

          <button onClick={() => void submitRepair()} style={{ width: "100%", fontSize: 16, fontWeight: 600, padding: 16, marginTop: 26, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>إرسال الإصلاح</button>
        </div>
        {toast && <div style={{ position: "fixed", bottom: 26, insetInlineStart: "50%", transform: "translateX(-50%)", background: "var(--g-900)", color: "var(--t-on-dark)", padding: "14px 20px", borderRadius: "var(--r-full)", boxShadow: "var(--sh-4)", fontSize: 13.5 }}>{toast}</div>}
      </div>
    );
  }

  if (screen === "comparing") {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", textAlign: "center", padding: "80px 24px" }}>
        <div style={{ width: 100, height: 100, margin: "0 auto 26px", borderRadius: "50%", border: "3px solid var(--g-100)", borderTopColor: "var(--g-600)" }} />
        <h2 style={{ fontSize: 21, fontWeight: 700, margin: 0 }}>الذكاء الاصطناعي يقارن صور قبل وبعد الإصلاح…</h2>
        <p style={{ fontSize: 14, color: "var(--t-secondary)", margin: "12px auto 0", maxWidth: 380 }}>سيتم تقييم جودة الإصلاح تلقائياً وإرسال النتيجة للمالك للاعتماد.</p>
      </div>
    );
  }

  if (screen === "locked") {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", textAlign: "center", padding: "60px 24px" }}>
        <div style={{ width: 74, height: 74, margin: "0 auto 22px", borderRadius: "50%", background: "var(--warn-bg)", color: "var(--warn)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>لديك عملية إصلاح قيد التنفيذ</h2>
        <p style={{ fontSize: 14, color: "var(--t-secondary)", margin: "11px auto 22px", maxWidth: 420 }}>أكمل عملية الإصلاح الحالية قبل البدء في بلاغ جديد.</p>
        <div style={{ ...card, padding: 18, maxWidth: 360, margin: "0 auto 24px", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--t-tertiary)" }} dir="ltr">{activeTask?.number}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{activeTask?.title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, maxWidth: 320, margin: "0 auto" }}>
          <button onClick={() => setScreen("c2")} style={{ fontSize: 14.5, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>العودة إلى الإصلاح الحالي</button>
          <button onClick={() => setScreen("list")} style={{ fontSize: 14, fontWeight: 600, padding: 13, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer" }}>العودة إلى مهامي</button>
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", textAlign: "center", padding: "60px 24px" }}>
        <div style={{ width: 88, height: 88, margin: "0 auto 22px", borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>✓</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>تم إرسال الإصلاح بنجاح</h2>
        <p style={{ fontSize: 14, color: "var(--t-secondary)", margin: "12px 0 24px" }}>تم إرسال صور الإصلاح وبانتظار اعتماد المالك.</p>
        <button onClick={() => setScreen("list")} style={{ fontSize: 14.5, fontWeight: 600, padding: "13px 28px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>العودة إلى مهامي</button>
      </div>
    );
  }

  const summary = [
    { label: "عاجلة", count: withMeta.filter((t) => t.priority === "عالية").length, dot: "var(--err)" },
    { label: "متوسطة", count: withMeta.filter((t) => t.priority === "متوسطة").length, dot: "var(--warn)" },
    { label: "منخفضة", count: withMeta.filter((t) => t.priority === "منخفضة").length, dot: "var(--g-500)" },
    { label: "بانتظار اعتماد المالك", count: withMeta.filter((t) => t.status === "waiting").length, dot: "var(--t-tertiary)" },
  ];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 22px 90px" }}>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><SukunWordmark size={15} tagline="للمقاولين" /><span className="sk-only-mobile"><AccountMenu variant="compact" /></span></div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 4px" }}>مهامي</h1>
        <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 16 }}>جميع البلاغات المسندة إليك.</div>
        <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Repair Module في الخادم بعد (Task 009) — هذه الشاشة محلية." /></div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: 6, background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", width: "fit-content" }}>
          <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)" }}>مهامي</button>
          <button onClick={() => router.push(SCREEN_PATHS.C3_RepairHistory)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>سجل الإصلاحات</button>
        </div>

        {withMeta.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}><h2 style={{ fontSize: 20, fontWeight: 700 }}>لا توجد مهام حالياً</h2></div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
              {summary.map((s) => (
                <div key={s.label} style={{ ...card, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: s.dot }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)" }}>{s.label}</span></div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{s.count}</div>
                </div>
              ))}
            </div>
            <div data-sk-scroll-row style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
              {[["all", "الكل"], ["new", "بانتظار البدء"], ["inprogress", "قيد التنفيذ"], ["waiting", "بانتظار اعتماد المالك"]].map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: `1.5px solid ${filter === k ? "var(--g-900)" : "var(--n-border)"}`, borderRadius: "var(--r-full)", background: filter === k ? "var(--g-900)" : "var(--n-surface)", color: filter === k ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {filtered.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 16, ...card, borderInlineEnd: `4px solid ${t.pri.c}`, padding: "17px 18px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 6 }} dir="ltr">{t.number} <span>· {t.project} — وحدة {t.unit}</span></div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 5 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 9 }}>المالك: {t.owner}</div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.pri.c, background: t.pri.b, padding: "5px 11px", borderRadius: "var(--r-full)" }}>أولوية {t.priority}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.st.c, background: t.st.b, padding: "5px 11px", borderRadius: "var(--r-full)" }}>{t.st.text}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.warranty === "in" ? "var(--g-700)" : "var(--warn-strong)", background: t.warranty === "in" ? "var(--g-50)" : "var(--warn-bg)", padding: "5px 11px", borderRadius: "var(--r-full)" }}>{t.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</span>
                      <span style={{ fontSize: 11.5, color: "var(--t-tertiary)" }}>{t.ago}</span>
                    </div>
                  </div>
                  <div style={{ flex: "none" }}>
                    {t.isActiveRepair ? (
                      <button onClick={() => tryOpen(t.id)} style={{ fontSize: 13.5, fontWeight: 600, padding: "12px 22px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>متابعة الإصلاح الحالي</button>
                    ) : t.status === "new" ? (
                      <button onClick={() => void startTask(t.id)} style={{ fontSize: 13.5, fontWeight: 600, padding: "12px 22px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>بدء الإصلاح</button>
                    ) : t.status === "inprogress" ? (
                      <button onClick={() => tryOpen(t.id)} style={{ fontSize: 13, fontWeight: 600, padding: "11px 18px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer" }}>متابعة المهمة</button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--t-tertiary)" }}>بانتظار المالك</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 26, insetInlineStart: "50%", transform: "translateX(-50%)", background: "var(--g-900)", color: "var(--t-on-dark)", padding: "14px 20px", borderRadius: "var(--r-full)", boxShadow: "var(--sh-4)", fontSize: 13.5 }}>{toast}</div>}
    </div>
  );
}
