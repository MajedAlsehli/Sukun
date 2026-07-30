"use client";

/**
 * PM2 · مراقبة البلاغ (Report Monitor) — ported from
 * `Sakn Report Monitor.dc.html` (Downloads/Sakn.d.zip). "The one canonical
 * single-report view ... every 'عرض البلاغ' in RE3, RE4, RE5, PM1, and PM3
 * opens this exact screen. No module may render its own report detail"
 * (`PM2_Report_Monitor.md`) — this is the one component every other screen's
 * "عرض البلاغ"/"عرض التفاصيل" action navigates to
 * (`SCREEN_PATHS.PM2_ReportMonitor(id)`), never a second copy.
 *
 * Strictly read-only by design — no mutating buttons exist on this screen
 * in the source either. No Reports backend (Task 007 not started) — the
 * source itself hardcodes 4 demo scenarios keyed by nothing (its own demo
 * launcher just switches between them) — per its own spec, "a missing/
 * unknown report id falls back to the default demo report rather than
 * erroring," so this component maps whichever id it's given onto one of
 * the 4 canned scenarios by a simple hash rather than inventing per-id data
 * nothing in the source or backend actually provides.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { PM_OR_COMPANY } from "@/lib/auth/roles";
import { DEMO_MODE } from "@/lib/demo/config";
import { useReportMonitor } from "@/lib/hooks/usePmTech";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { SukunWordmark } from "@/components/brand/SukunBrand";

type ScenarioKey = "healthy" | "breach" | "reopened" | "closed";

const SCENARIOS: Record<ScenarioKey, {
  number: string; title: string; project: string; building: string; floor: string; unit: string;
  priority: "عالية" | "متوسطة" | "منخفضة"; warranty: "in" | "out"; category: string; confidence: number;
  aiDescription: string; homeownerNote: string; createdAt: string; age: string; stage: number;
  status: string; statusTone: "info" | "warn" | "closed"; sla: "ok" | "near" | "breach";
  intervention: boolean; interventionReason: string; aiRec: string;
  contractor: string; contractorOp: string; contractorOpColor: string; contractorRating: string;
  repairStarted: string; repairDuration: string; contractorActive: string;
  coverageType: string; coveragePeriod: string; coverageNotes: string;
  homeownerPhotos: number; repairPhotos: number; repairNote: string; closed: boolean; rating: number; comment: string; approvalDate: string;
  opAlerts: { tone: "err" | "warn"; text: string }[];
}> = {
  healthy: { number: "#2402", title: "عطل في مفتاح الإنارة الرئيسي", project: "تلال الرياض", building: "مبنى C", floor: "الطابق 1", unit: "C-108", priority: "متوسطة", warranty: "in", category: "كهرباء", confidence: 87, aiDescription: "تم رصد عطل في مفتاح الإنارة الرئيسي بالصالة.", homeownerNote: "", createdAt: "اليوم، 04:20 صباحًا", age: "منذ 6 ساعات", stage: 5, status: "قيد التنفيذ", statusTone: "warn", sla: "ok", intervention: false, interventionReason: "", aiRec: "لا يحتاج البلاغ أي تدخل حالياً — يسير العمل ضمن الوقت المتوقع.", contractor: "سعد القرني", contractorOp: "ينفذ مهمة", contractorOpColor: "var(--warn)", contractorRating: "4.9", repairStarted: "اليوم، 05:10 صباحًا", repairDuration: "قيد الاحتساب", contractorActive: "2", coverageType: "كهرباء أساسية", coveragePeriod: "سنتان من تاريخ الاستلام", coverageNotes: "يشمل التمديدات الأساسية ولوحة التوزيع.", homeownerPhotos: 1, repairPhotos: 0, repairNote: "", closed: false, rating: 0, comment: "", approvalDate: "", opAlerts: [] },
  breach: { number: "#2418", title: "تسريب في دورة المياه", project: "تلال الرياض", building: "مبنى A", floor: "الطابق 2", unit: "A-214", priority: "عالية", warranty: "in", category: "سباكة", confidence: 92, aiDescription: "تم اكتشاف تسريب بالقرب من المغسلة بناءً على تحليل الصور.", homeownerNote: "المشكلة بدأت منذ يومين وتزداد سوءاً.", createdAt: "أمس، 03:10 مساءً", age: "منذ 22 ساعة", stage: 3, status: "بانتظار البدء", statusTone: "info", sla: "breach", intervention: true, interventionReason: "المقاول لم يبدأ المهمة خلال الفترة المستهدفة (٤ ساعات لبلاغ عالي الأولوية).", aiRec: "يُنصح بالتواصل مع المقاول — البلاغ عالي الأولوية ولم يبدأ العمل عليه منذ إسناده.", contractor: "خالد المطيري", contractorOp: "خارج الدوام", contractorOpColor: "var(--err)", contractorRating: "4.6", repairStarted: "لم يبدأ بعد", repairDuration: "—", contractorActive: "3", coverageType: "سباكة أساسية", coveragePeriod: "سنتان من تاريخ الاستلام", coverageNotes: "يشمل الأنابيب الرئيسية، ولا يشمل الانسداد الناتج عن سوء الاستخدام.", homeownerPhotos: 3, repairPhotos: 0, repairNote: "", closed: false, rating: 0, comment: "", approvalDate: "", opAlerts: [{ tone: "err", text: "تجاوز البلاغ المدة المستهدفة (SLA)" }, { tone: "warn", text: "المقاول متأخر في بدء المهمة" }] },
  reopened: { number: "#2360", title: "تسريب أسفل مغسلة المطبخ", project: "واحة النخيل", building: "مبنى D", floor: "الطابق 1", unit: "D-021", priority: "متوسطة", warranty: "in", category: "سباكة", confidence: 90, aiDescription: "تم اكتشاف تسريب أسفل مغسلة المطبخ.", homeownerNote: "", createdAt: "قبل 3 أيام، 06:15 مساءً", age: "منذ 3 أيام", stage: 4, status: "قيد التنفيذ", statusTone: "warn", sla: "near", intervention: true, interventionReason: "أعاد المالك فتح البلاغ بعد رفض الإصلاح الأول — يحتاج متابعة لضمان عدم التكرار.", aiRec: "أُعيد فتح البلاغ من قبل المالك ويحتاج متابعة قبل تسليم الإصلاح مرة أخرى.", contractor: "خالد المطيري", contractorOp: "ينفذ مهمة", contractorOpColor: "var(--warn)", contractorRating: "4.6", repairStarted: "اليوم، 09:00 صباحًا", repairDuration: "قيد الاحتساب", contractorActive: "3", coverageType: "سباكة أساسية", coveragePeriod: "سنتان من تاريخ الاستلام", coverageNotes: "يشمل الأنابيب الرئيسية.", homeownerPhotos: 4, repairPhotos: 2, repairNote: "تم استبدال الحلقة المطاطية وإحكام الوصلة.", closed: false, rating: 0, comment: "", approvalDate: "", opAlerts: [{ tone: "warn", text: "أُعيد فتح البلاغ من قبل المالك" }, { tone: "warn", text: "يقترب البلاغ من تجاوز المدة المستهدفة" }] },
  closed: { number: "#2311", title: "مشكلة في إنارة الممر", project: "واحة النخيل", building: "مبنى D", floor: "الطابق 1", unit: "D-021", priority: "منخفضة", warranty: "out", category: "كهرباء", confidence: 81, aiDescription: "تم رصد خلل في تمديدات إنارة الممر.", homeownerNote: "الإنارة تنطفئ من تلقاء نفسها.", createdAt: "18 يناير 2026", age: "—", stage: 7, status: "مغلق", statusTone: "closed", sla: "ok", intervention: false, interventionReason: "", aiRec: "لا يحتاج البلاغ أي تدخل — تم إغلاقه بعد اعتماد المالك.", contractor: "سعد القرني", contractorOp: "متاح", contractorOpColor: "var(--ok)", contractorRating: "4.9", repairStarted: "17 يناير 2026", repairDuration: "6 ساعات", contractorActive: "2", coverageType: "غير مشمول", coveragePeriod: "—", coverageNotes: "خارج فترة الضمان — تم التنفيذ برسوم مباشرة.", homeownerPhotos: 1, repairPhotos: 2, repairNote: "تم استبدال الأسلاك التالفة وتركيب قاطع جديد.", closed: true, rating: 5, comment: "", approvalDate: "18 يناير 2026", opAlerts: [] },
};

const statusMap = { info: { c: "var(--info)", b: "var(--info-bg)" }, warn: { c: "var(--warn-strong)", b: "var(--warn-bg)" }, closed: { c: "var(--t-secondary)", b: "var(--n-surface2)" } } as const;
const slaMap = { ok: { t: "ضمن المدة", c: "var(--g-700)", b: "var(--g-50)" }, near: { t: "يقترب من تجاوز المدة", c: "var(--warn-strong)", b: "var(--warn-bg)" }, breach: { t: "تجاوز المدة", c: "var(--err)", b: "var(--err-bg)" } } as const;
const priColorMap = { "عالية": "var(--err)", "متوسطة": "var(--warn-strong)", "منخفضة": "var(--g-700)" } as const;
const MASTER = ["رفع البلاغ", "تحليل AI", "التحقق من الضمان", "تعيين المقاول", "بدأ المقاول الإصلاح", "رفع صور الإصلاح", "بانتظار اعتماد المالك", "أغلق البلاغ"];
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };

function warrantyExplanation(d: (typeof SCENARIOS)[ScenarioKey]): string {
  if (d.warranty === "in") {
    return `هذا البلاغ مشمول بالضمان: عطل «${d.category}» يقع ضمن تغطية «${d.coverageType}» السارية لمدة ${d.coveragePeriod}. ${d.coverageNotes}`;
  }
  return `هذا البلاغ غير مشمول بالضمان: ${d.coverageNotes || `فترة الضمان الخاصة بـ«${d.coverageType}» منتهية أو لا تغطي هذا النوع من الأعطال.`}`;
}

function scenarioForId(id: string): ScenarioKey {
  const keys: ScenarioKey[] = ["healthy", "breach", "reopened", "closed"];
  const exact = keys.find((k) => SCENARIOS[k].number === `#${id}` || SCENARIOS[k].number === id);
  if (exact) return exact;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return keys[hash % keys.length];
}

export function ReportMonitorScreen({ reportId }: { reportId: string }) {
  return (
    <RouteGuard allow={PM_OR_COMPANY}>
      <ReportMonitorScreenInner reportId={reportId} />
    </RouteGuard>
  );
}

function ReportMonitorScreenInner({ reportId }: { reportId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = searchParams.get("back");

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the four `SCENARIOS` fixtures, keyed as before.
   *   DEMO_MODE=false  `GET /api/reports/{id}` in the PM/COMPANY viewer
   *                    projection, plus `GET /api/reports/{id}/timeline`.
   *
   * PM2 is READ-ONLY by construction for both viewers: the canonical API admits
   * no supervisory write on a report, so `permissions` comes back all-false and
   * there is nothing here to mutate. That is the contract, not a UI choice.
   */
  const live = useReportMonitor(DEMO_MODE ? undefined : reportId);
  const r = live.report;

  const demo = SCENARIOS[scenarioForId(reportId)];

  /**
   * Real mode builds EVERY field from the real report.
   *
   * It used to `...demo` first and override a subset, which left a fixture's
   * values sitting in the fields it did not name — so a real تشققات report
   * displayed the "breach" scenario's `coverageType: "سباكة أساسية"` (plumbing
   * coverage on a structural defect), its `contractorRating: "4.6"`, its
   * `contractorOp: "خارج الدوام"` and its `coveragePeriod`. It also put
   * `r.category` in the PROJECT field and hard-coded the building, floor and
   * unit to "—" for a report whose `location` carries all three.
   *
   * Nothing below reads `demo`. A fact the Backend does not report renders as
   * "—" rather than borrowing a plausible one.
   */
  const NA = "—";
  const real: typeof demo | null = r
    ? {
        number: r.number,
        title: r.title,
        project: r.projectName || NA,
        building: r.buildingName || (r.buildingNumber ? `مبنى ${r.buildingNumber}` : NA),
        floor: r.unitFloor == null ? NA : `الطابق ${r.unitFloor}`,
        unit: r.unitNumber || NA,
        priority: r.priority as typeof demo.priority,
        warranty: r.warranty,
        category: r.category,
        // Null on the manual-entry path; never back-filled with a plausible number.
        confidence: r.confidence ?? 0,
        aiDescription: r.aiDescription ?? "",
        homeownerNote: r.homeownerNote ?? "",
        createdAt: r.createdAt.slice(0, 10),
        age: r.date,
        stage: r.stage,
        status: r.text,
        statusTone: r.statusGroup === "CLOSED" ? "closed" : r.statusGroup === "IN_PROGRESS" ? "warn" : "info",
        // The SERVER's own SLA state, not a hard-coded "ok".
        sla: r.slaState === "BREACHED" ? "breach" : r.slaState === "AT_RISK" ? "near" : "ok",
        intervention: r.slaState === "BREACHED" || r.reopenCount > 0,
        interventionReason:
          r.slaState === "BREACHED"
            ? "تجاوز البلاغ المدة المستهدفة المسجّلة له."
            : r.reopenCount > 0
              ? "أعاد المالك فتح البلاغ، ويحتاج متابعة قبل تسليم الإصلاح مرة أخرى."
              : "",
        // No recommendation engine exists for PM2; an empty string renders the
        // honest line below rather than a fabricated recommendation.
        aiRec: "",
        contractor: r.technicianName ?? NA,
        // Operational status/rating for a technician are NOT on the report
        // contract. They are not guessed.
        contractorOp: r.technicianSpecialty ?? NA,
        contractorOpColor: "var(--t-tertiary)",
        contractorRating: NA,
        repairStarted: r.repairStartedAt ? r.repairStartedAt.slice(0, 10) : "لم يبدأ بعد",
        repairDuration:
          r.repairDurationMinutes == null
            ? r.repairStartedAt
              ? "قيد الاحتساب"
              : NA
            : `${Math.max(1, Math.round(r.repairDurationMinutes / 60))} ساعة`,
        contractorActive: NA,
        // The warranty CATEGORY the verdict was actually computed against.
        coverageType: r.warrantyCategoryLabel ?? NA,
        coveragePeriod:
          r.warrantyPeriodStart && r.warrantyPeriodEnd
            ? `${r.warrantyPeriodStart.slice(0, 10)} — ${r.warrantyPeriodEnd.slice(0, 10)}`
            : NA,
        // The explanation lives in ONE place (the assistant note below). Leaving
        // it here too printed the same sentence twice on the same card.
        coverageNotes: "",
        homeownerPhotos: r.homeownerPhotos.length,
        repairPhotos: r.afterPhotos.length,
        repairNote: r.repairNote ?? "",
        closed: r.statusGroup === "CLOSED",
        rating: r.reviewRating ?? 0,
        comment: r.reviewComment ?? "",
        approvalDate: r.reviewAt ? r.reviewAt.slice(0, 10) : r.closedAt ? r.closedAt.slice(0, 10) : NA,
        opAlerts: [
          ...(r.slaState === "BREACHED"
            ? ([{ tone: "err", text: "تجاوز البلاغ المدة المستهدفة (SLA)" }] as const)
            : []),
          ...(r.slaState === "AT_RISK"
            ? ([{ tone: "warn", text: "يقترب البلاغ من تجاوز المدة المستهدفة" }] as const)
            : []),
          ...(r.reopenCount > 0
            ? ([{ tone: "warn", text: "أُعيد فتح البلاغ من قبل المالك" }] as const)
            : []),
        ] as { tone: "err" | "warn"; text: string }[],
      }
    : null;

  const d: typeof demo = DEMO_MODE || !real ? demo : real;

  const stMeta = statusMap[d.statusTone];
  const slaMeta = slaMap[d.sla];

  // Real mode renders the CANONICAL event log; Demo Mode keeps the eight-step
  // ladder it always had.
  const timeline = DEMO_MODE || !r
    ? MASTER.map((t, i) => ({ text: t, done: i < d.stage, current: i === d.stage }))
    : live.timeline.map((e, i, arr) => ({
        text: e.label,
        done: r.statusGroup === "CLOSED" || i < arr.length - 1,
        current: r.statusGroup !== "CLOSED" && i === arr.length - 1,
      }));

  // A report this viewer may not see 404s. Nothing renders — never a fixture.
  if (!DEMO_MODE && !r) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 22px" }}>
          <button onClick={() => (back ? router.push(back) : router.back())} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer" }}>← رجوع</button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 22px 90px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <SukunWordmark size={15} tagline="لمدراء المشاريع" />
          <button onClick={() => (back ? router.push(back) : router.back())} style={{ fontSize: 13, fontWeight: 600, color: "var(--t-secondary)", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", padding: "9px 16px", cursor: "pointer" }}>← رجوع</button>
        </div>
        {/* The badge's own copy says this screen's data is local. That is true
            in Demo Mode and false against the canonical report API, so it
            renders only where it is accurate. */}
        {DEMO_MODE && <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Reports في الخادم بعد (Task 007) — هذه الشاشة القانونية الوحيدة تعرض بيانات محلية." /></div>}

        <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 20px" }}>مراقبة البلاغ</h1>

        <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "var(--g-900)", borderRadius: "var(--r-xl)", padding: 20, color: "var(--t-on-dark)", boxShadow: "var(--sh-3)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--a-300)", marginBottom: 14 }}>الحالة التشغيلية</div>
              <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>الحالة الحالية</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.status}</div></div>
              <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>عمر البلاغ</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.age}</div></div>
              <div style={{ paddingTop: 10, borderTop: "1px solid rgba(var(--t-on-dark-rgb), .1)" }}>
                <div style={{ fontSize: 11, color: "var(--t-on-dark-soft)", marginBottom: 5 }}>حالة المدة المستهدفة (SLA)</div>
                <span style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: "var(--r-full)", background: slaMeta.b, color: slaMeta.c }}>{slaMeta.t}</span>
              </div>
            </div>
            <div style={{ background: "var(--n-surface)", border: `1.5px solid ${d.intervention ? "var(--err-border)" : "var(--n-border)"}`, borderRadius: "var(--r-lg)", padding: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 8 }}>حالة التدخل</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: d.intervention ? "var(--err)" : "var(--g-700)", marginBottom: 8 }}>{d.intervention ? "يحتاج تدخلاً" : "لا يحتاج تدخلاً"}</div>
              {d.interventionReason && <div style={{ fontSize: 12.5, color: "var(--t-secondary)", lineHeight: 1.6 }}>{d.interventionReason}</div>}
            </div>
            <div style={{ background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-lg)", padding: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--a-700)", marginBottom: 8 }}>توصية مساعد سكن</div>
              <div style={{ fontSize: 13, color: "var(--a-800)", lineHeight: 1.7 }}>
                {d.aiRec
                  ? d.aiRec
                  : d.intervention
                    ? d.interventionReason
                    : "لا يحتاج البلاغ أي تدخل حالياً — يسير العمل ضمن المسار المسجّل له."}
              </div>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ ...card, borderRadius: "var(--r-2xl)", padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t-tertiary)" }} dir="ltr">{d.number}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: stMeta.c, background: stMeta.b, padding: "5px 12px", borderRadius: "var(--r-full)" }}>{d.status}</span>
              </div>
              <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 16px" }}>{d.title}</h2>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>المشروع</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.project}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>المبنى / الطابق</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.building} / {d.floor}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>الوحدة</div><div style={{ fontSize: 13, fontWeight: 600 }} dir="ltr">{d.unit}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>الأولوية</div><div style={{ fontSize: 13, fontWeight: 600, color: priColorMap[d.priority] }}>{d.priority}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>الضمان</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</div></div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>مسار البلاغ</h3>
              <div style={{ ...card, padding: "6px 20px" }}>
                {timeline.map((t, i) => <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0" }}><span style={{ width: 18, height: 18, borderRadius: "50%", background: t.done ? "var(--ok)" : "var(--n-surface)", border: `2px solid ${t.done ? "var(--ok)" : t.current ? "var(--warn)" : "var(--n-border-strong)"}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{t.done && <span style={{ color: "var(--t-on-dark)", fontSize: 9 }}>✓</span>}</span><div style={{ fontSize: 13.5, fontWeight: 600, color: t.done || t.current ? "var(--t-primary)" : "var(--t-tertiary)" }}>{t.text}</div></div>)}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>نظرة عامة على المشكلة</h3>
              <div style={{ ...card, padding: 18 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 5 }}>وصف الذكاء الاصطناعي</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{d.aiDescription}</div>
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--n-border)" }}>
                  <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>التصنيف</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.category}</div></div>
                  {/* A manually-filed report has no analysis. "0%" would read
                      as a measured confidence of zero; "—" is the truth. */}
                  <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>دقة التحليل</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.confidence > 0 ? `${d.confidence}%` : "—"}</div></div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>الضمان</h3>
              <div style={{ ...card, padding: 18, display: "flex", gap: 22, flexWrap: "wrap" }}>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>النتيجة</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>نوع التغطية</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.coverageType}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>فترة الضمان</div><div style={{ fontSize: 13, fontWeight: 600 }} dir="ltr">{d.coveragePeriod}</div></div>
                {d.coverageNotes && (
                  <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>ملاحظات التغطية</div><div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6 }}>{d.coverageNotes}</div></div>
                )}
              </div>
              {/* ONE explanation. Real mode renders the server-derived sentence
                  from the adapter; rebuilding a second one out of the coverage
                  fields printed the same statement twice on the same card. */}
              <div style={{ marginTop: 14, background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--a-700)", marginBottom: 6 }}>توضيح مساعد سكن</div>
                <div style={{ fontSize: 13, color: "var(--a-800)", lineHeight: 1.7 }}>
                  {!DEMO_MODE && r ? r.warrantyExplanation : warrantyExplanation(d)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>معلومات المقاول</h3>
              <div style={{ ...card, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flex: "none" }}>{d.contractor.charAt(0)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{d.contractor}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: d.contractorOpColor }} /><span style={{ fontSize: 11.5, color: "var(--t-tertiary)" }}>{d.contractorOp}</span></div>
                  </div>
                  {d.contractorRating !== "—" && (
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-700)" }}>★ {d.contractorRating}</span>
                  )}
                </div>
              </div>
            </div>

            {d.repairPhotos > 0 ? (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>صور الإصلاح</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>{Array.from({ length: d.repairPhotos }).map((_, i) => <div key={i} style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />)}</div>
              </div>
            ) : (
              <div style={{ marginTop: 24, textAlign: "center", padding: 24, color: "var(--t-tertiary)", fontSize: 13, ...card }}>لم يقم المقاول برفع صور الإصلاح بعد.</div>
            )}

            {/* Only when a real review exists. A closed report with no review
                rendered five empty stars and "0.0", which reads as a rating of
                zero rather than "not rated". */}
            {d.closed && d.rating > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>تقييم المالك</h3>
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><span>{[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ color: n <= d.rating ? "var(--a-500)" : "var(--n-border-strong)" }}>★</span>)}</span><span style={{ fontSize: 14, fontWeight: 700 }}>{d.rating}.0</span><span style={{ fontSize: 12, color: "var(--t-tertiary)" }}>· اعتُمد في {d.approvalDate}</span></div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>المخاطر التشغيلية</h3>
              {d.opAlerts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {d.opAlerts.map((a, i) => <div key={i} style={{ ...card, borderInlineEnd: `4px solid ${a.tone === "err" ? "var(--err)" : "var(--warn)"}`, padding: "13px 16px", fontSize: 13.5, fontWeight: 600 }}>{a.text}</div>)}
                </div>
              ) : (
                <div style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-border)", borderRadius: "var(--r-lg)", padding: "15px 18px", fontSize: 13.5, fontWeight: 600, color: "var(--g-700)" }}>✓ لا توجد أي مخاطر تشغيلية.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
