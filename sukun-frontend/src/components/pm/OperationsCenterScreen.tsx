"use client";

/**
 * PM1 · مركز العمليات (Operations Center) — ported from
 * `Sakn Operations Center.dc.html` (Downloads/Sakn.d.zip). No Reports/PM
 * Copilot backend (Tasks 007/008/015 not started) — fully local/demo,
 * including the AI Copilot chat (a fixed keyword→canned-answer map in the
 * source, same as H3 Discovery's advisor). Every "عرض البلاغ"/report-detail
 * action navigates to the one canonical PM2 route
 * (`SCREEN_PATHS.PM2_ReportMonitor`), per that screen's own "single source
 * of truth" rule.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { PM_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { SukunWordmark } from "@/components/brand/SukunBrand";
import { DEMO_MODE } from "@/lib/demo/config";
import { usePmCopilot, usePmOperations } from "@/lib/hooks/usePmTech";
import { toArabicIndic } from "@/lib/numeral";

const KPIS = [
  { label: "بلاغات مفتوحة", value: "12", tone: "err" },
  { label: "قيد التنفيذ", value: "8", tone: "warn" },
  { label: "بانتظار اعتماد المالك", value: "3", tone: "ok" },
  { label: "بلاغات حرجة", value: "2", tone: "err" },
  { label: "متوسط الاستجابة", value: "3.2 ساعة", tone: "info" },
  { label: "رضا الملاك", value: "4.8 من 5", tone: "gold" },
] as const;
const toneMap: Record<string, { t: string; b: string }> = { err: { t: "var(--err)", b: "var(--err-bg)" }, warn: { t: "var(--warn-strong)", b: "var(--warn-bg)" }, ok: { t: "var(--g-700)", b: "var(--g-50)" }, info: { t: "var(--info)", b: "var(--info-bg)" }, gold: { t: "var(--a-700)", b: "var(--a-50)" } };
const ALERTS = [
  { reason: "بلاغ عالي الأولوية لم يبدأ العمل عليه", meta: "#2418 · تسريب — مبنى A", tone: "err" as const },
  { reason: "المقاول خالد متأخر في مهمة", meta: "#2377 · تكييف — منذ 18 ساعة", tone: "warn" as const },
  { reason: "بلاغ أُعيد فتحه من قبل المالك", meta: "#2402 · كهرباء — مبنى C", tone: "warn" as const },
];
const REPORTS = [
  { number: "2418", building: "مبنى A", unit: "A-214", title: "تسريب في دورة المياه", priority: "عالية" as const, contractor: "خالد المطيري" },
  { number: "2402", building: "مبنى C", unit: "C-108", title: "عطل في مفتاح الإنارة", priority: "متوسطة" as const, contractor: "سعد القرني" },
  { number: "2390", building: "مبنى B", unit: "B-045", title: "تشقق في الجدار الخارجي", priority: "منخفضة" as const, contractor: "سعد القرني" },
];
const priMap = { "عالية": { c: "var(--err)", b: "var(--err-bg)" }, "متوسطة": { c: "var(--warn-strong)", b: "var(--warn-bg)" }, "منخفضة": { c: "var(--g-700)", b: "var(--g-50)" } };
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };

function answerFor(q: string): string {
  const has = (...k: string[]) => k.some((w) => q.includes(w));
  if (has("ملخص", "اليوم", "ملخّص")) return "ملخّص اليوم: ١٢ بلاغاً مفتوحاً، منها بلاغان عاليَا الأولوية لم يبدأ العمل على أحدهما بعد. المقاول خالد متأخر منذ ١٨ ساعة. معدّل رضا الملاك ارتفع إلى ٤.٨.";
  if (has("انتباه", "أولوية", "تدخل")) return "أهم ما يستحق انتباهك: البلاغ #2418 لم يبدأ العمل عليه بعد، والمقاول خالد متأخر ١٨ ساعة على مهمة تكييف.";
  if (has("أفضل", "أداء")) return "الأعلى أداءً هو سعد القرني: متوسط تقييم ٤.٩. خالد المطيري تقييمه ٤.٦ لكنه متأخر حالياً.";
  return "اعتماداً على بيانات مشروعك: يوجد ١٢ بلاغاً مفتوحاً، ٨ قيد التنفيذ، و٣ بانتظار اعتماد المالك. هل ترغب بتفصيل أي جانب؟";
}

export function OperationsCenterScreen() {
  return (
    <RouteGuard allow={PM_ONLY}>
      <OperationsCenterScreenInner />
    </RouteGuard>
  );
}

/**
 * "لا توجد نقاط…" / "نقطة واحدة" / "نقطتان" / "٣ نقاط" / "١٢ نقطة".
 *
 * Exported so the count the assistant states can be asserted directly against
 * the number of intervention items, which is the property that broke.
 */
export function attentionHeadline(count: number): string {
  if (count <= 0) return "لا توجد نقاط تحتاج انتباهك اليوم.";
  if (count === 1) return "يوجد اليوم نقطة واحدة تحتاج انتباهك.";
  if (count === 2) return "توجد اليوم نقطتان تحتاجان انتباهك.";
  const n = toArabicIndic(count);
  // 3–10 take the plural "نقاط"; 11+ take the singular "نقطة".
  return count <= 10
    ? `يوجد اليوم ${n} نقاط تحتاج انتباهك.`
    : `يوجد اليوم ${n} نقطة تحتاج انتباهك.`;
}

function OperationsCenterScreenInner() {
  const router = useRouter();
  const [copilot, setCopilot] = useState<"card" | "popup">("card");
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   `KPIS` / `ALERTS` / `REPORTS` + `answerFor()`, verbatim.
   *   DEMO_MODE=false  `GET /api/pm/{overview,alerts,reports,activity}` and the
   *                    REAL `POST /api/pm/copilot/chat`.
   *
   * Three Backend states are surfaced rather than smoothed over:
   *   `assigned: false`      — this manager has no project. Honest, not an error.
   *   `slaCompliancePercent` — `null` means no determined outcome, NOT 0 %.
   *   an unconfigured alert rule means that alert type was never generated.
   */
  const live = usePmOperations();
  const copilotApi = usePmCopilot();

  /**
   * The header chip and the Copilot's opening line both NAMED a project
   * ("تلال الرياض") and a manager ("أحمد") in their literal copy. In Demo Mode
   * that is the fixture's own project and stays exactly as authored; in real
   * mode it was claiming a project this manager may not manage — a fixture
   * string leaking into real data, caught by the production role sweep.
   *
   * `assigned: false` is an honest state, so an unassigned manager sees the
   * screen's own placeholder rather than a borrowed project name.
   */
  const projectChip = DEMO_MODE ? "تلال الرياض" : (live.overview?.project?.name ?? "—");
  const copilotIntro = DEMO_MODE
    ? "صباح الخير أحمد. راجعت بيانات مشروع تلال الرياض لهذا اليوم. المشروع مستقر بشكل عام، لكن توجد ثلاث نقاط أوصي بمراجعتها."
    : live.assigned && live.overview?.project
      ? `راجعت بيانات ${live.overview.project.name} لهذا اليوم. اسأل عمّا تريد معرفته.`
      : "لا يوجد مشروع مُسند إليك حالياً.";

  // Real KPIs mapped onto the SAME six tiles. A null figure renders "—".
  const k = live.kpis;
  const kpiRows = DEMO_MODE
    ? KPIS
    : ([
        { label: "بلاغات مفتوحة", value: String(k?.openReports ?? 0), tone: "err" },
        { label: "قيد التنفيذ", value: String(k?.inProgress ?? 0), tone: "warn" },
        { label: "بانتظار اعتماد المالك", value: String(k?.awaitingOwnerApproval ?? 0), tone: "ok" },
        { label: "بلاغات حرجة", value: String(live.alerts.filter((a) => a.severity === "CRITICAL").length), tone: "err" },
        {
          label: "متوسط الاستجابة",
          value: k?.averageResolutionTimeMinutes == null ? "—" : `${Math.round(k.averageResolutionTimeMinutes / 60)} ساعة`,
          tone: "info",
        },
        {
          // Compliance, not satisfaction: the Backend has no rating model, and
          // this is the figure it does compute. Null renders "—", never 0 %.
          label: "الالتزام بمستوى الخدمة",
          value: k?.slaCompliancePercent == null ? "—" : `${k.slaCompliancePercent}%`,
          tone: "gold",
        },
      ] as unknown as typeof KPIS);

  /**
   * The assistant's headline count.
   *
   * The source copy hard-coded "يوجد اليوم ٣ نقاط تحتاج انتباهك." — true of the
   * three-item fixture, and wrong against real data: production showed that
   * sentence above an intervention list containing two. It is now derived from
   * `alertRows`, the very list rendered under "يحتاج تدخلك", so the two can
   * never disagree. Arabic-Indic digits via the shared numeral policy, and the
   * grammatical forms Arabic actually needs for 0/1/2/3-10/11+.
   */
  const alertRows = DEMO_MODE
    ? ALERTS
    : live.alerts.map((a) => ({
        reason: a.problemText,
        meta: `#${a.reportNumber} · ${a.technicianName ?? "—"}`,
        tone: (a.severity === "CRITICAL" ? "err" : "warn") as "err" | "warn",
        reportId: a.reportId,
      }));

  const reportRows = DEMO_MODE
    ? REPORTS
    : live.reportDtos.map((r) => ({
        number: String(r.reportNumber),
        building: r.location.buildingName,
        unit: r.location.unitNumber,
        title: r.problemText,
        priority: (r.priority === "HIGH" ? "عالية" : r.priority === "LOW" ? "منخفضة" : "متوسطة") as "عالية" | "متوسطة" | "منخفضة",
        contractor: r.technician?.name ?? "—",
        reportId: r.id,
      }));

  const copilotHeadline = attentionHeadline(alertRows.length);

  async function ask(text: string) {
    if (!text.trim()) return;
    setChat((c) => [...c, { role: "user", text }]);
    setDraft("");
    setThinking(true);
    if (!DEMO_MODE) {
      // The REAL PM Copilot. An unavailable provider says so; it never gets a
      // canned answer in its place.
      await copilotApi.ask(text);
      setThinking(false);
      return;
    }
    setTimeout(() => { setChat((c) => [...c, { role: "ai", text: answerFor(text) }]); setThinking(false); }, 700);
  }

  // In real mode the assistant's reply is appended once the request settles.
  useEffect(() => {
    if (DEMO_MODE || !copilotApi.answer) return;
    const text = copilotApi.answer.available && copilotApi.answer.text
      ? copilotApi.answer.text
      : "مساعد مدير المشروع غير متاح حالياً.";
    setChat((c) => (c.length && c[c.length - 1].role === "ai" && c[c.length - 1].text === text ? c : [...c, { role: "ai", text }]));
  }, [copilotApi.answer]);

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 140px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <SukunWordmark size={15} tagline="لمدراء المشاريع" />
          <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--g-700)", background: "var(--g-50)", padding: "7px 13px", borderRadius: "var(--r-full)" }}>{`🏠 ${projectChip}`}</span>
            <span className="sk-only-mobile"><AccountMenu variant="compact" /></span>
          </span>
        </div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 4px" }}>مركز العمليات</h1>
        <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 16 }}>متابعة الحالة التشغيلية لمشروعك.</div>
        {/* The badge asserts this screen has no server data. True in Demo Mode,
            false once /api/pm/* is wired — so it renders only where accurate. */}
        {DEMO_MODE && <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Reports/PM Copilot في الخادم بعد (Tasks 007/008/015) — هذه الشاشة محلية." /></div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: 6, background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", width: "fit-content" }}>
          <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)" }}>مركز العمليات</button>
          <button onClick={() => router.push(SCREEN_PATHS.PM3_ContractorPerformance)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>أداء المقاولين</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 30 }}>
          {kpiRows.map((k) => (
            <div key={k.label} style={{ ...card, padding: 17 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)", marginBottom: 10 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: toneMap[k.tone].t }}>{k.value}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px" }}>يحتاج تدخلك</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 30 }}>
          {alertRows.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, ...card, borderInlineEnd: `4px solid ${a.tone === "err" ? "var(--err)" : "var(--warn)"}`, padding: "15px 17px" }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{a.reason}</div><div style={{ fontSize: 12, color: "var(--t-tertiary)", marginTop: 3 }}>{a.meta}</div></div>
              <button onClick={() => router.push(`${SCREEN_PATHS.PM2_ReportMonitor((a as { reportId?: string }).reportId ?? a.meta.split(" ")[0].replace("#", ""))}?back=${encodeURIComponent(SCREEN_PATHS.PM1_OperationsCenter)}`)} style={{ fontSize: 12.5, fontWeight: 600, padding: "9px 15px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer", flex: "none" }}>عرض سريع</button>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px" }}>البلاغات النشطة</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 30 }}>
          {reportRows.map((r) => (
            <div key={r.number} style={{ display: "flex", alignItems: "center", gap: 16, ...card, padding: "16px 18px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 5 }} dir="ltr">#{r.number} <span>· {r.building} · {r.unit}</span></div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 9 }}>{r.title}</div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: priMap[r.priority].c, background: priMap[r.priority].b, padding: "5px 11px", borderRadius: "var(--r-full)" }}>أولوية {r.priority}</span>
              </div>
              <button onClick={() => router.push(`${SCREEN_PATHS.PM2_ReportMonitor((r as { reportId?: string }).reportId ?? r.number)}?back=${encodeURIComponent(SCREEN_PATHS.PM1_OperationsCenter)}`)} style={{ fontSize: 13, fontWeight: 600, padding: "11px 18px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer", flex: "none" }}>عرض التفاصيل</button>
            </div>
          ))}
        </div>
      </div>

      {copilot === "card" && (
        <div data-sk-assistant-card style={{ position: "fixed", bottom: 22, insetInlineEnd: 22, zIndex: 118, width: 320, background: "var(--g-900)", borderRadius: "var(--r-xl)", boxShadow: "var(--sh-4)", padding: "18px 20px 20px", color: "var(--t-on-dark)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>مساعد سكن الذكي</div>
          {/* Derived from the SAME list the "يحتاج تدخلك" section renders, so
              the assistant cannot claim three items next to a list of two.
              The count was the literal Arabic numeral ٣ in the source copy. */}
          <div style={{ fontSize: 12.5, color: "var(--t-on-dark-soft)", lineHeight: 1.75, marginBottom: 16 }}>{copilotHeadline}</div>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => setCopilot("popup")} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: 11, border: "none", borderRadius: "var(--r-md)", background: "var(--t-on-dark)", color: "var(--g-900)", cursor: "pointer" }}>عرض الملخص</button>
            <button onClick={() => setCopilot("popup")} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: 11, border: "1.5px solid rgba(var(--t-on-dark-rgb), .2)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--t-on-dark)", cursor: "pointer" }}>اسأل مساعد سكن</button>
          </div>
        </div>
      )}

      {copilot === "popup" && (
        <div onClick={() => setCopilot("card")} style={{ position: "fixed", inset: 0, zIndex: 122, background: "rgba(var(--g-900-rgb), .5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ width: "min(700px,90vw)", height: "72vh", background: "var(--n-bg)", borderRadius: "var(--r-2xl)", boxShadow: "var(--sh-4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", background: "var(--g-900)", color: "var(--t-on-dark)" }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>مساعد سكن الذكي</div>
              <button onClick={() => setCopilot("card")} style={{ background: "rgba(var(--t-on-dark-rgb), .1)", border: "none", borderRadius: "var(--r-md)", color: "var(--t-on-dark)", cursor: "pointer", width: 30, height: 30 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.8, marginBottom: 16 }}>{copilotIntro}</div>
              {chat.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}>
                  <div style={{ maxWidth: "78%", fontSize: 13.5, lineHeight: 1.7, padding: "13px 15px", borderRadius: "var(--r-lg)", background: m.role === "user" ? "var(--g-900)" : "var(--n-surface)", color: m.role === "user" ? "var(--t-on-dark)" : "var(--t-primary)", border: m.role === "user" ? "none" : "1px solid var(--n-border)" }}>{m.text}</div>
                </div>
              ))}
              {thinking && <div style={{ fontSize: 13, color: "var(--t-tertiary)" }}>يكتب…</div>}
            </div>
            <div style={{ padding: "14px 20px 18px", borderTop: "1px solid var(--n-border)", background: "var(--n-surface)" }}>
              <div data-sk-scroll-row style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto" }}>
                {["لماذا انخفض أداء خالد؟", "أي مبنى سجل أعلى البلاغات؟"].map((s) => (
                  <button key={s} onClick={() => void ask(s)} style={{ fontSize: 12, fontWeight: 600, padding: "8px 13px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-bg)", cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(draft); }} placeholder="اكتب سؤالك عن المشروع…" style={{ flex: 1, fontSize: 13.5, padding: "12px 14px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)" }} />
                <button onClick={() => void ask(draft)} style={{ width: 44, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>➤</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
