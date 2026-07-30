"use client";

/**
 * C3 · سجل الإصلاحات (Repair History) — ported from
 * `Sakn Repair History.dc.html` (Downloads/Sakn.d.zip). Read-only, immutable
 * archive per its own spec.
 *
 * Task 3 wired it to `GET /api/technician/repairs/history`, which DOES exist —
 * the "no Repair backend yet" note this file used to carry was stale.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { TECHNICIAN_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";
import { useRepairHistory, useReportTimeline } from "@/lib/hooks/usePmTech";
import type { RepairHistoryItemDto } from "@/lib/backend/technician";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { SukunWordmark } from "@/components/brand/SukunBrand";

interface HistoryItem {
  id: string; reportId: string; number: string; project: string; building: string; unit: string; owner: string; title: string;
  priority: "عالية" | "متوسطة" | "منخفضة"; warranty: "in" | "out"; duration: string; closedDate: string;
  rating: number; comment: string; aiDescription: string; homeownerNote: string; repairNote: string;
  before: number; after: number; ageDays: number;
}

const SEED: HistoryItem[] = [
  { id: "h1", reportId: "h1", number: "#2418", project: "تلال الرياض", building: "B", unit: "C-108", owner: "محمد العتيبي", title: "تسريب في دورة المياه", priority: "عالية", warranty: "in", duration: "1 يوم و4 ساعات", closedDate: "12 مارس 2026", rating: 5, comment: "تم الإصلاح بسرعة وجودة ممتازة.", aiDescription: "تم اكتشاف تسريب بالقرب من المغسلة بناءً على تحليل الصور.", homeownerNote: "المشكلة بدأت منذ يومين.", repairNote: "تم استبدال السيفون وإيقاف مصدر التسريب واختبار الوصلات.", before: 3, after: 2, ageDays: 8 },
  { id: "h2", reportId: "h2", number: "#2377", project: "تلال الرياض", building: "A", unit: "A-092", owner: "نورة الشمري", title: "عطل في تكييف الصالة", priority: "عالية", warranty: "in", duration: "2 يوم و6 ساعات", closedDate: "3 مارس 2026", rating: 4, comment: "الفريق كان متعاوناً والخدمة جيدة.", aiDescription: "تم رصد عطل في وحدة تكييف الصالة الرئيسية.", homeownerNote: "", repairNote: "تم تنظيف الفلاتر وإعادة تعبئة غاز التبريد وفحص الضاغط.", before: 2, after: 3, ageDays: 24 },
  { id: "h3", reportId: "h3", number: "#2311", project: "واحة النخيل", building: "D", unit: "D-021", owner: "عبدالله الحربي", title: "مشكلة في إنارة الممر", priority: "منخفضة", warranty: "out", duration: "6 ساعات", closedDate: "18 يناير 2026", rating: 5, comment: "", aiDescription: "تم رصد خلل في تمديدات إنارة الممر.", homeownerNote: "الإنارة تنطفئ من تلقاء نفسها.", repairNote: "تم استبدال الأسلاك التالفة وتركيب قاطع جديد.", before: 1, after: 2, ageDays: 120 },
];
const priMap = { "عالية": { c: "var(--err)", b: "var(--err-bg)" }, "متوسطة": { c: "var(--warn-strong)", b: "var(--warn-bg)" }, "منخفضة": { c: "var(--g-700)", b: "var(--g-50)" } } as const;
const master = ["تم إنشاء البلاغ", "تم تحليل البلاغ بواسطة الذكاء الاصطناعي", "تم التحقق من الضمان", "تم تعيين المقاول", "بدأ الإصلاح", "تم رفع صور الإصلاح", "وافق المالك", "أُغلق البلاغ"];
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };
function stars(rating: number) { return [1, 2, 3, 4, 5].map((n) => n <= rating); }

/**
 * `GET /api/technician/repairs/history` returns REPAIR rows with the report
 * NESTED underneath: `durationMinutes`, `technicianNote`, `closedAt` and
 * `review` sit at the item root, while the number, location, warranty, AI text
 * and photo counts live on `item.report`. Reading a report field off the item
 * root yields `undefined` and crashes the render — that is exactly the defect
 * production caught, so this mapper is pure and separately tested.
 *
 * Nothing here dereferences without a fallback and nothing invents a value: an
 * absent duration or rating renders as the screen's own em dash / zero stars.
 *
 * `now` is injected rather than read from the clock so the age arithmetic is
 * deterministic under test.
 */
export function toHistoryItem(item: RepairHistoryItemDto, now: number): HistoryItem {
  const r = item.report;
  const closed = item.closedAt ?? item.submittedAt ?? r?.updatedAt ?? r?.createdAt ?? null;
  const closedMs = closed ? Date.parse(closed) : NaN;
  return {
    id: item.repairId,
    reportId: r?.id ?? "",
    number: r?.reportNumber == null ? "—" : `#${r.reportNumber}`,
    project: r?.location?.projectName ?? "—",
    building: r?.location?.buildingName ?? "—",
    unit: r?.location?.unitNumber ?? "—",
    owner: r?.homeowner?.name ?? "—",
    title: r?.problemText ?? "—",
    priority: (r?.priority === "HIGH" ? "عالية" : r?.priority === "LOW" ? "منخفضة" : "متوسطة") as HistoryItem["priority"],
    warranty: (r?.warranty?.verdict === "COVERED" ? "in" : "out") as HistoryItem["warranty"],
    duration:
      item.durationMinutes == null
        ? "—"
        : `${Math.floor(item.durationMinutes / 1440)} يوم و${Math.floor((item.durationMinutes % 1440) / 60)} ساعات`,
    closedDate: closed ? closed.slice(0, 10) : "—",
    // Honest 0 = no review. The stars renderer already shows none.
    rating: item.review?.rating ?? 0,
    comment: item.review?.comment ?? "",
    aiDescription: r?.ai?.problemText ?? "",
    homeownerNote: r?.homeownerNote ?? "",
    repairNote: item.technicianNote ?? "",
    before: r?.photoCounts?.before ?? 0,
    after: r?.photoCounts?.after ?? 0,
    // An undated repair must not silently join the "last 30 days" window, so it
    // sorts as oldest rather than newest.
    ageDays: Number.isNaN(closedMs)
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Math.floor((now - closedMs) / 86_400_000)),
  };
}

export function RepairHistoryScreen() {
  return (
    <RouteGuard allow={TECHNICIAN_ONLY}>
      <RepairHistoryScreenInner />
    </RouteGuard>
  );
}

function RepairHistoryScreenInner() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Task 3 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the `SEED` history, verbatim.
   *   DEMO_MODE=false  `GET /api/technician/repairs/history` — this
   *                    technician's OWN closed work only, scoped by the
   *                    principal on the server.
   */
  const live = useRepairHistory();

  const pool = DEMO_MODE ? SEED : live.historyDtos.map((item) => toHistoryItem(item, Date.now()));

  /**
   * The three summary tiles. In Demo Mode they keep the authored fixture
   * figures verbatim. In real mode the Backend computes the aggregates itself
   * (`technicianStats`) and returns `null` where there is no determined value —
   * which renders as the screen's own em dash, never as a fabricated 0.
   */
  const s = live.stats;
  const fmtDays = (m: number | null | undefined) => (m == null ? null : (m / 1440).toFixed(1));
  const tiles = DEMO_MODE
    ? { total: "143", rating: "4.8", ratingStars: true, days: "2.1" }
    : {
        total: String(s?.completedRepairsCount ?? 0),
        rating: s?.averageRating == null ? "—" : s.averageRating.toFixed(1),
        ratingStars: s?.averageRating != null,
        days: fmtDays(s?.averageRepairDurationMinutes) ?? "—",
      };

  const winDays: Record<string, number> = { all: 99999, "30d": 30, "3m": 90, year: 365 };
  const maxAge = winDays[filter] ?? 99999;
  let filtered = pool.filter((r) => r.ageDays <= maxAge);
  const q = query.trim();
  if (q) filtered = filtered.filter((r) => `${r.number} ${r.project} ${r.unit} ${r.owner} ${r.title}`.includes(q));

  const sel = useMemo(() => pool.find((r) => r.id === selectedId) ?? pool[0], [selectedId, pool]);

  /**
   * The journey checklist. In Demo Mode it is the authored eight-step `master`
   * list, drawn all-complete exactly as approved. In real mode that list would
   * ASSERT steps this report may never have had, so the canonical event log
   * replaces it — only what the Backend recorded, in the Backend's order.
   */
  // Keyed on the REPORT id, not the repair id — the event log belongs to the report.
  const journey = useReportTimeline(DEMO_MODE || !selectedId ? undefined : sel?.reportId);
  const steps = DEMO_MODE ? master : journey.timeline.map((e) => e.label);

  // A real technician with no closed repairs yet has an EMPTY pool, so `sel` is
  // undefined and the detail panel below has nothing to render. Fall back to the
  // list, which already owns the screen's empty presentation.
  if (selectedId && sel) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 22px 90px" }}>
          <button onClick={() => setSelectedId(null)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>← سجل الإصلاحات</button>
          <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: "24px 26px", color: "var(--t-on-dark)", boxShadow: "var(--sh-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}><span dir="ltr" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-300)" }}>{sel.number}</span><span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: "var(--r-full)", background: "rgba(var(--t-on-dark-rgb), .1)" }}>مغلق</span></div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>{sel.title}</h2>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المشروع / الوحدة</div><div style={{ fontSize: 13, fontWeight: 600 }}>{sel.project} — {sel.unit}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>المالك</div><div style={{ fontSize: 13, fontWeight: 600 }}>{sel.owner}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>تاريخ الإغلاق</div><div style={{ fontSize: 13, fontWeight: 600 }}>{sel.closedDate}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-on-dark-soft)" }}>مدة الإصلاح</div><div style={{ fontSize: 13, fontWeight: 600 }}>{sel.duration}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(var(--t-on-dark-rgb), .1)" }}>
              <span style={{ fontSize: 11.5, color: "var(--t-on-dark-soft)" }}>تقييم المالك</span>
              <span>{stars(sel.rating).map((on, i) => <span key={i} style={{ color: on ? "var(--a-300)" : "rgba(var(--t-on-dark-rgb), .25)" }}>★</span>)}</span>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>مسار البلاغ الكامل</h3>
            <div style={{ ...card, padding: "6px 22px" }}>
              {steps.map((t, i) => <div key={`${i}-${t}`} style={{ display: "flex", gap: 15, padding: "12px 0" }}><span style={{ width: 19, height: 19, borderRadius: "50%", background: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t-on-dark)", fontSize: 10, flex: "none" }}>✓</span><div style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</div></div>)}
              {steps.length === 0 && <div style={{ fontSize: 13, color: "var(--t-tertiary)", padding: "12px 0" }}>لا توجد أحداث مسجّلة لهذا البلاغ.</div>}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>نظرة عامة على المشكلة</h3>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 5 }}>وصف الذكاء الاصطناعي</div>
              {/* A report with no recorded AI analysis says so, in the same
                  register the homeowner-note line below already uses — an
                  empty label under a heading reads as a broken screen. */}
              <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 14, color: sel.aiDescription ? "var(--t-primary)" : "var(--t-tertiary)" }}>{sel.aiDescription || "لم يُسجَّل تحليل آلي لهذا البلاغ."}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 5 }}>ملاحظات المالك</div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: sel.homeownerNote ? "var(--t-primary)" : "var(--t-tertiary)" }}>{sel.homeownerNote || "لا توجد ملاحظات إضافية."}</div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>صور قبل الإصلاح ({sel.before})</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>{Array.from({ length: sel.before }).map((_, i) => <div key={i} style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />)}</div>
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>صور بعد الإصلاح ({sel.after})</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>{Array.from({ length: sel.after }).map((_, i) => <div key={i} style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />)}</div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>ملاحظات الإصلاح</h3>
            <div style={{ ...card, padding: "16px 18px", fontSize: 14, lineHeight: 1.7 }}>{sel.repairNote || "لا توجد ملاحظات."}</div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>تقييم المالك</h3>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><span>{stars(sel.rating).map((on, i) => <span key={i} style={{ color: on ? "var(--a-500)" : "var(--n-border-strong)" }}>★</span>)}</span><span style={{ fontSize: 15, fontWeight: 700 }}>{sel.rating}.0</span></div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: sel.comment ? "var(--t-primary)" : "var(--t-tertiary)" }}>{sel.comment || "لم يترك المالك تعليقاً."}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 22px 90px" }}>
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><SukunWordmark size={15} tagline="للمقاولين" /><span className="sk-only-mobile"><AccountMenu variant="compact" /></span></div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 4px" }}>سجل الإصلاحات</h1>
        <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginBottom: 16 }}>جميع أعمال الإصلاح التي اكتملت بنجاح.</div>
        <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Repair Module في الخادم بعد (Task 009) — هذه الشاشة محلية." /></div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: 6, background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-full)", width: "fit-content" }}>
          <button onClick={() => router.push(SCREEN_PATHS.C1_ContractorTasks)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>مهامي</button>
          <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)" }}>سجل الإصلاحات</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <div style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)", marginBottom: 8 }}>إجمالي الإصلاحات</div><div style={{ fontSize: 24, fontWeight: 700 }}>{tiles.total}</div></div>
          <div style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)", marginBottom: 8 }}>متوسط تقييمك</div><div style={{ fontSize: 24, fontWeight: 700 }}>{tiles.rating} {tiles.ratingStars && <span style={{ color: "var(--a-500)" }}>★★★★★</span>}</div></div>
          <div style={{ ...card, padding: 16 }}><div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)", marginBottom: 8 }}>متوسط مدة الإصلاح</div><div style={{ fontSize: 24, fontWeight: 700 }}>{tiles.days} <span style={{ fontSize: 14 }}>يوم</span></div></div>
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم البلاغ، المشروع، الوحدة، أو اسم المالك" style={{ width: "100%", fontSize: 14, padding: "12px 14px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", marginBottom: 14 }} />
        <div data-sk-scroll-row style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
          {[["all", "الكل"], ["30d", "آخر 30 يوم"], ["3m", "آخر 3 أشهر"], ["year", "هذه السنة"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: `1.5px solid ${filter === k ? "var(--g-900)" : "var(--n-border)"}`, borderRadius: "var(--r-full)", background: filter === k ? "var(--g-900)" : "var(--n-surface)", color: filter === k ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>

        {!DEMO_MODE && live.status === "loading" ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--t-tertiary)", fontSize: 13.5 }}>جارٍ تحميل سجل الإصلاحات…</div>
        ) : !DEMO_MODE && live.status === "error" ? (
          /* An honest failure, never an empty list pretending the archive is empty. */
          <div style={{ textAlign: "center", padding: 30, color: "var(--t-tertiary)", fontSize: 13.5 }}>
            <div style={{ marginBottom: 12 }}>{live.errorMessage ?? "تعذّر تحميل سجل الإصلاحات."}</div>
            <button onClick={live.reload} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer" }}>إعادة المحاولة</button>
          </div>
        ) : !DEMO_MODE && pool.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--t-tertiary)", fontSize: 13.5 }}>لم تُغلق أي إصلاحات بعد.</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--t-tertiary)", fontSize: 13.5 }}>لا توجد نتائج مطابقة لبحثك.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {filtered.map((r) => (
              // [thumb | text | action]. At 390px the two fixed columns leave
              // the text ~80px, so every word wrapped onto its own line. The
              // mobile rule moves the action to its own line; desktop is
              // unchanged.
              <div key={r.id} data-sk-stack-row style={{ display: "flex", alignItems: "center", gap: 16, ...card, padding: 16 }}>
                <div style={{ width: 78, height: 78, borderRadius: "var(--r-md)", flex: "none", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 5 }} dir="ltr">{r.number} <span>· {r.project} — {r.building} · {r.unit}</span></div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 9 }}>المالك: {r.owner} · أُغلق {r.closedDate}</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: priMap[r.priority].c, background: priMap[r.priority].b, padding: "5px 11px", borderRadius: "var(--r-full)" }}>أولوية {r.priority}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t-secondary)", background: "var(--n-surface2)", padding: "5px 11px", borderRadius: "var(--r-full)" }}>{r.duration}</span>
                    <span>{stars(r.rating).map((on, i) => <span key={i} style={{ color: on ? "var(--a-500)" : "var(--n-border-strong)", fontSize: 13 }}>★</span>)}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedId(r.id)} style={{ fontSize: 13, fontWeight: 600, padding: "11px 18px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer", flex: "none" }}>عرض التفاصيل</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
