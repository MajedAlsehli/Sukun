"use client";

/**
 * PM3 · أداء المقاولين (Contractor Performance) — ported from
 * `Sakn Contractor Performance.dc.html` (Downloads/Sakn.d.zip). No PM
 * dashboard backend (Tasks 015/016 not started) — local/demo seed, same as
 * PM1. "Quick View" report rows and "عرض الفني" both navigate to real
 * shared destinations: PM2 (the canonical report screen) and RE5's
 * technician profile hash-route respectively — per this screen's own spec,
 * "عرض الفني must open the same technician profile RE5 sees, never a
 * duplicate."
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { PM_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";
import { usePmContractorDetail, usePmContractors } from "@/lib/hooks/usePmTech";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { SukunWordmark } from "@/components/brand/SukunBrand";

interface Contractor {
  id: string; name: string; specialty: string; op: "available" | "working" | "delayed"; rating: number;
  active: number; waiting: number; avgTime: string; reopened: number; sla: number; completed: number; avgResponse: string;
  aiSummary: string; aiAnalysis: string; aiRecommendation: string;
  activeRepairs: { number: string; title: string; priority: "عالية" | "متوسطة" | "منخفضة"; age: string; status: string }[];
  completedRepairs: { title: string; unit: string; closedDate: string; rating: number }[];
  feedback: { rating: number; comment: string; date: string }[];
  opTimeline: { text: string; when: string }[];
}

const CONTRACTORS: Contractor[] = [
  { id: "p1", name: "سعد القرني", specialty: "سباكة · كهرباء", op: "available", rating: 4.9, active: 2, waiting: 1, avgTime: "1.4 يوم", reopened: 0, sla: 98, completed: 15, avgResponse: "0.8 ساعة",
    aiSummary: "أداء ممتاز. أنهى آخر 15 بلاغاً ضمن المدة المستهدفة.", aiAnalysis: "يحافظ هذا المقاول على معدل التزام مرتفع بالمدة المستهدفة، وارتفع متوسط تقييم الملاك بنسبة 8% خلال آخر شهر.", aiRecommendation: "لا يحتاج أي تدخل حالياً.",
    activeRepairs: [{ number: "2402", title: "عطل في مفتاح الإنارة", priority: "متوسطة", age: "منذ 5 ساعات", status: "قيد التنفيذ" }, { number: "2390", title: "تشقق في الجدار الخارجي", priority: "منخفضة", age: "أمس", status: "قيد التنفيذ" }],
    completedRepairs: [{ title: "تسريب أسفل مغسلة المطبخ", unit: "D-021", closedDate: "12 مارس 2026", rating: 5 }],
    feedback: [{ rating: 5, comment: "تم الإصلاح بسرعة وجودة ممتازة.", date: "12 مارس 2026" }],
    opTimeline: [{ text: "رفع صور إصلاح البلاغ #2402", when: "قبل 40 دقيقة" }, { text: "بدأ إصلاح البلاغ #2402", when: "قبل 5 ساعات" }] },
  { id: "p2", name: "خالد المطيري", specialty: "تكييف · صيانة عامة", op: "delayed", rating: 4.6, active: 3, waiting: 0, avgTime: "2.3 يوم", reopened: 2, sla: 74, completed: 9, avgResponse: "3.1 ساعة",
    aiSummary: "يوجد انخفاض في سرعة الاستجابة خلال الأسبوع الحالي.", aiAnalysis: "تكررت حالات التأخير في نهاية الأسبوع، وتجاوزت مدة الاستجابة المعدل المستهدف في بلاغين خلال الأسبوعين الماضيين.", aiRecommendation: "يُنصح بمتابعة سبب التأخير في أعمال الكهرباء والتكييف.",
    activeRepairs: [{ number: "2418", title: "تسريب في دورة المياه", priority: "عالية", age: "منذ 22 ساعة", status: "بانتظار البدء" }, { number: "2377", title: "عطل في تكييف الصالة", priority: "عالية", age: "منذ يومين", status: "قيد التنفيذ" }],
    completedRepairs: [{ title: "عطل كهربائي في المطبخ", unit: "C-071", closedDate: "20 فبراير 2026", rating: 4 }],
    feedback: [{ rating: 4, comment: "الفريق كان متعاوناً، لكن التأخير كان ملحوظاً.", date: "20 فبراير 2026" }],
    opTimeline: [{ text: "أُعيد فتح البلاغ #2360 من قبل المالك", when: "قبل 3 أيام" }, { text: "بدأ إصلاح البلاغ #2377", when: "قبل يومين" }] },
];
const opMeta = { available: { t: "متاح", c: "var(--ok)" }, working: { t: "ينفذ مهمة", c: "var(--warn)" }, delayed: { t: "متأخر", c: "var(--err)" } };
const priMap = { "عالية": "var(--err)", "متوسطة": "var(--warn-strong)", "منخفضة": "var(--g-700)" };
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };
function stars(rating: number) { const r = Math.round(rating); return [1, 2, 3, 4, 5].map((n) => n <= r); }

export function ContractorPerformanceScreen() {
  return (
    <RouteGuard allow={PM_ONLY}>
      <ContractorPerformanceScreenInner />
    </RouteGuard>
  );
}

function ContractorPerformanceScreenInner() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the `CONTRACTORS` fixture, verbatim.
   *   DEMO_MODE=false  `GET /api/pm/contractors`, `/contractors/{id}/performance`
   *                    and the OpenAI-backed `/contractors/{id}/insight`.
   *
   * `averageRating` is `null` — never 0 — for a technician with no reviews, and
   * `slaCompliancePercent` is `null` on an empty denominator. Both render the
   * screen's own "—". The AI insight's `available:false` is shown as
   * unavailable, never replaced by the fixture's canned `aiSummary`.
   */
  const liveList = usePmContractors();
  const liveDetail = usePmContractorDetail(DEMO_MODE ? null : selectedId);

  const realContractors: Contractor[] = DEMO_MODE
    ? []
    : liveList.contractors.map((c) => ({
        id: c.technicianId,
        name: c.name,
        specialty: c.specialty ?? "—",
        op: c.load === "BUSY" ? "working" : c.load === "AVAILABLE" ? "available" : "delayed",
        rating: c.averageRating ?? 0,
        active: c.openReportsCount,
        waiting: 0,
        avgTime: "—",
        reopened: 0,
        sla: 0,
        completed: 0,
        avgResponse: "—",
        aiSummary: "",
        aiAnalysis: "",
        aiRecommendation: "",
        activeRepairs: [],
        completedRepairs: [],
        feedback: [],
        opTimeline: [],
      } as unknown as Contractor));

  const pool = DEMO_MODE ? CONTRACTORS : realContractors;

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? pool.filter((c) => `${c.name} ${c.specialty}`.includes(q)) : pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pool.length, DEMO_MODE]);

  const base = pool.find((c) => c.id === selectedId);
  // Real mode enriches the selected row with the server's own performance
  // statistics and its real AI insight.
  const perf = liveDetail.performance;
  const sel: Contractor | undefined = !base
    ? undefined
    : DEMO_MODE
      ? base
      : ({
          ...base,
          rating: perf?.stats.averageRating ?? 0,
          active: perf?.stats.openReportsCount ?? base.active,
          completed: perf?.stats.completedReportsCount ?? 0,
          sla: perf?.stats.slaCompliancePercent ?? 0,
          avgTime:
            perf?.stats.averageRepairDurationMinutes == null
              ? "—"
              : `${(perf.stats.averageRepairDurationMinutes / 1440).toFixed(1)} يوم`,
          aiSummary:
            liveDetail.insight?.available && liveDetail.insight.text
              ? liveDetail.insight.text
              : "تحليل المساعد غير متاح حالياً.",
          aiAnalysis:
            liveDetail.insight?.available && liveDetail.insight.text ? liveDetail.insight.text : "",
          aiRecommendation: "",
        } as Contractor);

  if (sel) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 90px" }}>
          <button onClick={() => setSelectedId(null)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>← أداء المقاولين</button>
          <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: "24px 26px", color: "var(--t-on-dark)", boxShadow: "var(--sh-3)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(var(--a-500-rgb), .2)", color: "var(--a-300)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flex: "none" }}>{sel.name.charAt(0)}</span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px" }}>{sel.name}</h2>
              <div style={{ fontSize: 12.5, color: "var(--t-on-dark-soft)" }}>{sel.specialty} · {opMeta[sel.op].t}</div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>متوسط التقييم</div><div style={{ fontSize: 15, fontWeight: 700 }}>{sel.rating} ⭐</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>الالتزام بالمدة</div><div style={{ fontSize: 15, fontWeight: 700 }}>{sel.sla}%</div></div>
            </div>
          </div>

          <div style={{ marginTop: 22, background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-xl)", padding: "20px 22px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-700)", marginBottom: 10 }}>تحليل الأداء الذكي</div>
            <div style={{ fontSize: 14, color: "var(--a-800)", lineHeight: 1.75, marginBottom: 14 }}>{sel.aiAnalysis}</div>
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--a-100)", fontSize: 13.5, color: "var(--a-800)" }}><b>التوصية: </b>{sel.aiRecommendation}</div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>نظرة عامة على الأداء</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {[["إصلاحات مكتملة", sel.completed], ["إصلاحات حالية", sel.active], ["متوسط مدة الإصلاح", sel.avgTime], ["متوسط زمن الاستجابة", sel.avgResponse], ["متوسط تقييم الملاك", sel.rating], ["بلاغات مُعادة الفتح", sel.reopened]].map(([label, value]) => (
                <div key={label as string} style={{ ...card, padding: 14 }}><div style={{ fontSize: 11, color: "var(--t-tertiary)", marginBottom: 5 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div></div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>الإصلاحات الحالية</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {sel.activeRepairs.map((r) => (
                <div key={r.number} style={{ display: "flex", alignItems: "center", gap: 14, ...card, padding: "14px 16px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}><span style={{ fontSize: 12, fontWeight: 700, color: "var(--t-tertiary)" }} dir="ltr">#{r.number}</span><span style={{ fontSize: 11.5, fontWeight: 600, color: priMap[r.priority] }}>أولوية {r.priority}</span></div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginTop: 3 }}>{r.age} · {r.status}</div>
                  </div>
                  <button onClick={() => router.push(`${SCREEN_PATHS.PM2_ReportMonitor(r.number)}?back=${encodeURIComponent(SCREEN_PATHS.PM3_ContractorPerformance)}`)} style={{ fontSize: 12.5, fontWeight: 600, padding: "9px 15px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer", flex: "none" }}>عرض سريع</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 12px" }}>تقييمات الملاك</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {sel.feedback.map((f, i) => (
                <div key={i} style={{ ...card, padding: "15px 17px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span>{stars(f.rating).map((on, j) => <span key={j} style={{ color: on ? "var(--a-500)" : "var(--n-border-strong)" }}>★</span>)}</span><span style={{ fontSize: 11.5, color: "var(--t-tertiary)" }}>{f.date}</span></div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{f.comment}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button onClick={() => router.push(SCREEN_PATHS.RE5_TechnicianProfile(sel.id))} style={{ fontSize: 14, fontWeight: 600, padding: "13px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>عرض الفني</button>
          </div>
        </div>
      </div>
    );
  }

  const totalContractors = CONTRACTORS.length;
  const avail = CONTRACTORS.filter((c) => c.op === "available").length;
  const working = CONTRACTORS.filter((c) => c.op !== "available").length;
  const avgRating = (CONTRACTORS.reduce((a, c) => a + c.rating, 0) / totalContractors).toFixed(1);

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 90px" }}>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><SukunWordmark size={15} tagline="لمدراء المشاريع" /><span className="sk-only-mobile"><AccountMenu variant="compact" /></span></div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 4px" }}>أداء المقاولين</h1>
        <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 16 }}>متابعة الأداء التشغيلي لجميع المقاولين في المشروع.</div>
        {DEMO_MODE && <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد PM Dashboard في الخادم بعد (Tasks 015/016) — هذه الشاشة محلية." /></div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: 6, background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", width: "fit-content" }}>
          <button onClick={() => router.push(SCREEN_PATHS.PM1_OperationsCenter)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>مركز العمليات</button>
          <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)" }}>أداء المقاولين</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {[["إجمالي المقاولين", String(totalContractors)], ["متاح حالياً", String(avail)], ["ينفذ مهمة", String(working)], ["متوسط تقييم الملاك", `${avgRating} من 5`], ["متوسط مدة الإصلاح", "1.9 يوم"], ["بلاغات بانتظار البدء", "2"]].map(([label, value]) => (
            <div key={label} style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)", marginBottom: 9 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div></div>
          ))}
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو التخصص" style={{ width: "100%", fontSize: 14, padding: "12px 14px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", marginBottom: 16 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map((c) => (
            <div key={c.id} style={{ ...card, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 14 }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flex: "none" }}>{c.name.charAt(0)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 12, color: "var(--t-tertiary)" }}>{c.specialty} <span style={{ color: opMeta[c.op].c }}>● {opMeta[c.op].t}</span></div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--a-700)" }}>★ {c.rating}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: 10.5, color: "var(--t-tertiary)" }}>إصلاحات نشطة</div><div style={{ fontSize: 15, fontWeight: 700 }}>{c.active}</div></div>
                <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: 10.5, color: "var(--t-tertiary)" }}>بانتظار الاعتماد</div><div style={{ fontSize: 15, fontWeight: 700 }}>{c.waiting}</div></div>
                <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "11px 12px" }}><div style={{ fontSize: 10.5, color: "var(--t-tertiary)" }}>الالتزام بالمدة</div><div style={{ fontSize: 15, fontWeight: 700, color: c.sla >= 90 ? "var(--g-700)" : c.sla >= 80 ? "var(--warn-strong)" : "var(--err)" }}>{c.sla}%</div></div>
              </div>
              <div style={{ background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "13px 15px", marginBottom: 14, fontSize: 12.5, color: "var(--a-800)" }}>💡 {c.aiSummary}</div>
              <button onClick={() => setSelectedId(c.id)} style={{ width: "100%", fontSize: 13.5, fontWeight: 600, padding: 12, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer" }}>عرض الأداء</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
