"use client";

/**
 * H9 · بلاغاتي (My Reports) — ported from `Sakn My Reports.dc.html`
 * (Downloads/Sakn.d.zip). No Reports backend (Task 007 not started) —
 * fully local/demo seed data, same as every other report-side screen this
 * session. The source's own top pill nav is dropped in favor of the real
 * `HomeownerNav` bottom bar already built in Step 2 (Foundation) — same
 * precedent as H6/H7, which used it instead of re-porting a duplicate nav.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HOMEOWNER_ACTIVE_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { HomeownerNav } from "@/components/nav/HomeownerNav";
import { PendingBackendBadge } from "@/components/PendingBackendBadge";
import { DEMO_MODE } from "@/lib/demo/config";
import { useReportDetail, useReports } from "@/lib/hooks/useReports";
import { TIMELINE_LABELS } from "@/lib/adapters/reports";

interface SeedReport {
  id: string; number: string; title: string; date: string;
  warranty: "in" | "out"; priority: "منخفضة" | "متوسطة" | "عالية"; category: string; confidence: number;
  aiDescription: string; stage: number;
}

const SEED: SeedReport[] = [
  { id: "r1", number: "#2432", title: "عطل في نافذة غرفة النوم", date: "اليوم", warranty: "in", priority: "متوسطة", category: "نوافذ", confidence: 88, aiDescription: "تم اكتشاف تلف في مفصلات نافذة الألمنيوم بغرفة النوم.", stage: 0 },
  { id: "r2", number: "#2418", title: "تسريب في دورة المياه", date: "قبل يومين", warranty: "in", priority: "عالية", category: "سباكة", confidence: 92, aiDescription: "تم اكتشاف تسريب بالقرب من المغسلة.", stage: 4 },
  { id: "r3", number: "#2405", title: "مشكلة كهربائية في المطبخ", date: "قبل أسبوع", warranty: "in", priority: "متوسطة", category: "كهرباء", confidence: 90, aiDescription: "تم رصد عطل في قاطع الكهرباء الخاص بمنافذ المطبخ.", stage: 6 },
  { id: "r4", number: "#2390", title: "تشقق في الجدار الخارجي", date: "قبل 3 أسابيع", warranty: "out", priority: "منخفضة", category: "تشققات", confidence: 81, aiDescription: "تم رصد تشقق سطحي بسيط في الجدار الخارجي.", stage: 7 },
];
const MASTER = ["تم إرسال البلاغ", "تم استلام البلاغ", "تم تعيين المقاول", "بدأ المقاول أعمال الإصلاح", "جارٍ الإصلاح", "تم رفع صور بعد الإصلاح", "بانتظار اعتمادك", "تم الإغلاق"];
const priMap: Record<string, { c: string; b: string }> = { "منخفضة": { c: "var(--g-700)", b: "var(--g-50)" }, "متوسطة": { c: "var(--a-700)", b: "var(--a-50)" }, "عالية": { c: "var(--err)", b: "var(--err-bg)" } };

const COVERAGE_BY_CATEGORY: Record<string, string> = {
  "سباكة": "الأنابيب والتمديدات الرئيسية",
  "كهرباء": "التمديدات الأساسية ولوحة التوزيع",
  "نوافذ": "إطارات ومفصلات النوافذ",
  "تشققات": "التشققات الإنشائية الجوهرية",
  "دهانات": "عيوب الدهان الناتجة عن التنفيذ",
  "أبواب": "الأبواب ومفصلاتها",
  "أرضيات": "تبليط وتشطيب الأرضيات",
  "أسقف": "تشطيب وعزل الأسقف",
};

function warrantyExplanation(r: { warranty: "in" | "out"; category: string }): string {
  const scope = COVERAGE_BY_CATEGORY[r.category] ?? "هذا النوع من الأعطال";
  if (r.warranty === "in") {
    return `هذا البلاغ مشمول بالضمان: عطل «${r.category}» يقع ضمن التغطية الأساسية (${scope}) التي يوفّرها ضمان المطوّر لمدة سنتين من تاريخ الاستلام.`;
  }
  return `هذا البلاغ غير مشمول بالضمان: إما لانتهاء فترة الضمان، أو لأن «${r.category}» يقع خارج نطاق التغطية الأساسية (${scope}).`;
}

function statusOf(stage: number) {
  if (stage === 0) return { text: "تم الاستلام", key: "open", color: "var(--err)", bg: "var(--err-bg)", dot: "var(--err)" };
  if (stage >= 1 && stage <= 5) return { text: "قيد التنفيذ", key: "inprogress", color: "var(--warn-strong)", bg: "var(--warn-bg)", dot: "var(--warn)" };
  if (stage === 6) return { text: "بانتظار موافقتك", key: "waiting", color: "var(--g-700)", bg: "var(--ok-bg)", dot: "var(--ok)" };
  return { text: "تم الإغلاق", key: "closed", color: "var(--t-secondary)", bg: "var(--n-surface2)", dot: "var(--t-tertiary)" };
}

const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };

/**
 * Task 2 · the row shape BOTH modes render.
 *
 * Demo Mode builds it from `SEED` + `statusOf` + `warrantyExplanation`, exactly
 * as before. Real mode builds it in `lib/adapters/reports.ts` from the canonical
 * `ReportSummaryDto`. The JSX below reads only this shape, so it has no branch
 * of its own and cannot tell demo data from real data.
 *
 * `canApprove` / `canReopen` are the SERVER's decision in real mode
 * (`ReportPermissionsDto`, re-enforced by the endpoints themselves) — the client
 * never decides who may act, it only renders what it was told.
 */
interface ReportRow {
  id: string;
  number: string;
  title: string;
  date: string;
  warranty: "in" | "out";
  warrantyExplanation: string;
  priority: string;
  category: string;
  confidence: number | null;
  aiDescription: string | null;
  stage: number;
  key: string;
  text: string;
  color: string;
  bg: string;
  dot: string;
  pri: { c: string; b: string };
  canApprove: boolean;
  canReopen: boolean;
}

/**
 * The reopen reason.
 *
 * `reopenReportSchema` requires one (min 3 chars) and the approved screen has
 * no reason field — its reopen step is a confirmation, not a form. The button
 * the resident actually pressed says "لا، ما زالت المشكلة موجودة", so that
 * statement IS their reason and is sent verbatim. Nothing is invented and no
 * field is added to the frozen UI.
 */
const REOPEN_REASON = "ما زالت المشكلة موجودة";

export function MyReportsScreen({ reportId }: { reportId?: string }) {
  return (
    <RouteGuard allow={HOMEOWNER_ACTIVE_ONLY}>
      <MyReportsScreenInner reportId={reportId} />
    </RouteGuard>
  );
}

function MyReportsScreenInner({ reportId }: { reportId?: string }) {
  const router = useRouter();
  const [reports, setReports] = useState(SEED);
  const [confirm, confirmDialog] = useConfirm();
  const [filter, setFilter] = useState("all");
  const [detailStage, setDetailStage] = useState<"view" | "evaluate" | "closedSuccess" | "reopen">("view");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [compareStage, setCompareStage] = useState<"analyzing" | "done">("analyzing");

  // Task 2 · real data. Both hooks are inert in Demo Mode and make no request.
  const live = useReports(filter);
  const liveDetail = useReportDetail(reportId);

  const demoRows: ReportRow[] = useMemo(
    () =>
      reports.map((r) => ({
        ...r,
        ...statusOf(r.stage),
        pri: priMap[r.priority],
        warrantyExplanation: warrantyExplanation(r),
        confidence: r.confidence as number | null,
        aiDescription: r.aiDescription as string | null,
        canApprove: statusOf(r.stage).key === "waiting",
        canReopen: statusOf(r.stage).key === "waiting",
      })),
    [reports],
  );

  const liveRows: ReportRow[] = useMemo(
    () => live.reports.map((r) => ({ ...r, pri: priMap[r.priority] ?? priMap["متوسطة"] })),
    [live.reports],
  );

  const withMeta = DEMO_MODE ? demoRows : liveRows;
  // The detail screen reads the single loaded report in real mode, not a row
  // plucked out of the list — a deep link must work without the list ever
  // having been fetched.
  const liveDetailRow: ReportRow | null = liveDetail.report
    ? { ...liveDetail.report, pri: priMap[liveDetail.report.priority] ?? priMap["متوسطة"] }
    : null;

  const sel0ForCompare = DEMO_MODE
    ? withMeta.find((r) => r.id === reportId) ?? withMeta[0]
    : liveDetailRow;
  const showsCompare = sel0ForCompare?.key === "waiting" && detailStage === "view";

  /**
   * The before/after AI comparison is Demo Mode only, and deliberately so.
   *
   * The approved block renders a completion percentage, a quality grade and a
   * remaining-issues list. No canonical endpoint produces any of them — Task 8
   * shipped no before/after scoring provider, and `lib/ai/live.ts#compareRepair`
   * answers `AI_ANALYSIS_UNAVAILABLE` rather than pretending otherwise. Showing
   * `confidence + 5` as a real repair score would be exactly the fabricated AI
   * result this integration must never produce, so in real mode the block is
   * not rendered and the resident goes straight to the real approve/reopen
   * decision beneath it. Recorded for Task 3.
   */
  const showsComparisonScore = DEMO_MODE;

  useEffect(() => {
    if (!showsCompare || !showsComparisonScore) { setCompareStage("done"); return; }
    setCompareStage("analyzing");
    const t = setTimeout(() => setCompareStage("done"), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsCompare, showsComparisonScore, reportId]);

  const repairPercentage = Math.min(98, (sel0ForCompare?.confidence ?? 85) + 5);
  const repairQuality = repairPercentage >= 95 ? "ممتازة" : repairPercentage >= 85 ? "جيدة" : "مقبولة";
  const remainingIssues = repairPercentage >= 95 ? [] : ["أثر بسيط للرطوبة ما زال ظاهراً — يُنصح بالمتابعة بعد أسبوع."];
  const counts = DEMO_MODE
    ? withMeta.reduce(
        (acc, r) => { acc[r.key]++; return acc; },
        { open: 0, inprogress: 0, waiting: 0, closed: 0 } as Record<string, number>,
      )
    : { open: 0, inprogress: 0, waiting: 0, closed: 0, ...live.counts };
  const filtered = DEMO_MODE
    ? (filter === "all" ? withMeta : withMeta.filter((r) => r.key === filter))
    : withMeta;

  /**
   * Real mode has no approved loading presentation on this screen, so the
   * approved EMPTY state must not stand in for one — "we have not asked yet" and
   * "you have no reports" are different facts. While the request is in flight
   * the list area renders nothing, which is the same "not decided yet"
   * presentation `RouteGuard` already uses. Recorded for Task 3.
   */
  const listLoading = !DEMO_MODE && (live.status === "loading" || live.status === "idle");
  /**
   * A FAILED list load is a failure, not "you have no reports".
   *
   * `withMeta` is empty in both cases, and the empty state below used to be the
   * only branch that empty could reach — so a request that 401'd, timed out or
   * was refused rendered the approved "لا توجد بلاغات حتى الآن" card, which
   * states as fact something the app does not know. The three states are now
   * distinguished: still loading, failed (with a retry), genuinely empty.
   */
  const listFailed = !DEMO_MODE && live.status === "error";

  if (!reportId) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 90 }}>
        {confirmDialog}
        <HomeownerNav />
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>بلاغاتي</h1>
            <span className="sk-only-mobile"><AccountMenu variant="compact" /></span>
          </div>
          <p style={{ fontSize: 13, color: "var(--t-secondary)", margin: "0 0 16px" }}>تابع جميع بلاغاتك وحالة إصلاحها في مكان واحد.</p>
          {/* The badge's own copy states that this screen's data is local. That is
              true in Demo Mode and false once the canonical report API is wired,
              so it renders only where it is accurate. */}
          {DEMO_MODE && <div style={{ marginBottom: 16 }}><PendingBackendBadge note="لا يوجد Reports في الخادم بعد (Task 007) — بيانات هذه الشاشة محلية." /></div>}
          {listLoading ? null : listFailed ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>تعذّر تحميل بلاغاتك</h2>
              <p style={{ fontSize: 13.5, color: "var(--t-secondary)", marginTop: 10 }}>{live.errorMessage ?? "حدثت مشكلة أثناء جلب البلاغات."}</p>
              <button onClick={live.reload} style={{ fontSize: 14, fontWeight: 600, padding: "13px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", marginTop: 20 }}>إعادة المحاولة</button>
            </div>
          ) : withMeta.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>لا توجد بلاغات حتى الآن</h2>
              <button onClick={() => router.push(SCREEN_PATHS.H7_MyHome)} style={{ fontSize: 14, fontWeight: 600, padding: "13px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", marginTop: 20 }}>العودة إلى منزلي</button>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                {[["open", "مفتوحة", "var(--err)"], ["inprogress", "قيد التنفيذ", "var(--warn)"], ["waiting", "بانتظار موافقتك", "var(--ok)"], ["closed", "مغلقة", "var(--t-tertiary)"]].map(([k, label, dot]) => (
                  <button key={k} onClick={() => setFilter(k)} style={{ ...card, textAlign: "right", padding: 14, border: filter === k ? "1.5px solid var(--g-500)" : "1px solid var(--n-border)", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} /><span style={{ fontSize: 12, fontWeight: 600, color: "var(--t-secondary)" }}>{label}</span></div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{counts[k]}</div>
                  </button>
                ))}
              </div>
              <div data-sk-scroll-row style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
                {[["all", "الكل"], ["open", "مفتوحة"], ["inprogress", "قيد التنفيذ"], ["waiting", "بانتظار موافقتك"], ["closed", "مغلقة"]].map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 17px", border: `1.5px solid ${filter === k ? "var(--g-900)" : "var(--n-border)"}`, borderRadius: "var(--r-full)", background: filter === k ? "var(--g-900)" : "var(--n-surface)", color: filter === k ? "var(--t-on-dark)" : "var(--t-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filtered.map((r) => (
                  <div key={r.id} style={{ ...card, display: "flex", gap: 16, padding: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--t-tertiary)", marginBottom: 5 }} dir="ltr">{r.number} <span style={{ color: "var(--t-tertiary)" }}>· {r.date}</span></div>
                      <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 9 }}>{r.title}</div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: r.color, background: r.bg, padding: "5px 11px", borderRadius: "var(--r-full)" }}>{r.text}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: r.warranty === "in" ? "var(--g-700)" : "var(--warn-strong)", background: r.warranty === "in" ? "var(--g-50)" : "var(--warn-bg)", padding: "5px 11px", borderRadius: "var(--r-full)" }}>{r.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: r.pri.c, background: r.pri.b, padding: "5px 11px", borderRadius: "var(--r-full)" }}>أولوية {r.priority}</span>
                      </div>
                    </div>
                    <button onClick={() => router.push(SCREEN_PATHS.H9_MyReportDetail(r.id))} style={{ fontSize: 13, fontWeight: 600, padding: "11px 18px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", cursor: "pointer", alignSelf: "center", flex: "none" }}>عرض التفاصيل</button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 20 }}>
            <button onClick={() => router.push(SCREEN_PATHS.H8_ReportJourney)} style={{ fontSize: 14.5, fontWeight: 600, padding: "13px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>إنشاء بلاغ جديد</button>
          </div>
        </div>
      </div>
    );
  }

  const sel0 = DEMO_MODE ? (withMeta.find((r) => r.id === reportId) ?? withMeta[0]) : liveDetailRow;

  /**
   * Real mode renders the CANONICAL timeline — the Backend's own event log from
   * `GET /api/reports/{id}/timeline` — in the approved row markup. It is the
   * real record of what happened, including events a status alone cannot
   * express (a failed routing attempt, a reopen). Demo Mode keeps the fixed
   * eight-step `MASTER` ladder it always had.
   */
  const timeline = DEMO_MODE
    ? MASTER.map((t, i) => ({ text: t, done: i < (sel0?.stage ?? 0), current: i === (sel0?.stage ?? 0) }))
    : liveDetail.timeline.map((e, i, arr) => ({
        text: e.label,
        done: sel0?.key === "closed" || i < arr.length - 1,
        current: sel0?.key !== "closed" && i === arr.length - 1,
      }));

  const approveYes = () => setDetailStage("evaluate");

  /**
   * Reopen. In real mode this is the REAL `POST /api/reports/{id}/reopen`, and
   * the confirmation panel is shown only if the Backend accepted it — the
   * screen never claims a reopen the server refused. On failure it stays put;
   * H9's detail view has no approved error presentation, which is recorded for
   * Task 3 rather than designed around here.
   */
  const approveNo = async () => {
    // Reopening re-opens a closed repair for the technician and the PM. It is a
    // real state change on someone else's queue, so it is confirmed first.
    const ok = await confirm({
      title: "إعادة فتح البلاغ؟",
      body: "سيعود البلاغ إلى المقاول لمتابعة الإصلاح، وسيظهر مرة أخرى ضمن البلاغات المفتوحة.",
      confirmLabel: "إعادة فتح البلاغ",
    });
    if (!ok) return;
    if (DEMO_MODE) { setDetailStage("reopen"); return; }
    if (await liveDetail.reopen({ reason: REOPEN_REASON })) setDetailStage("reopen");
  };

  const ackReopen = () => {
    if (DEMO_MODE) setReports((rs) => rs.map((r) => (r.id === sel0?.id ? { ...r, stage: 4 } : r)));
    setDetailStage("view");
  };

  /** Approval. Real mode sends the resident's real rating and comment. */
  const submitRating = async () => {
    if (DEMO_MODE) {
      setReports((rs) => rs.map((r) => (r.id === sel0?.id ? { ...r, stage: 7 } : r)));
      setDetailStage("closedSuccess");
      return;
    }
    const ok = await liveDetail.approve({ rating, comment: comment.trim() || undefined });
    if (ok) setDetailStage("closedSuccess");
  };

  // A deep link to a report that is still loading, or that this homeowner does
  // not own (the Backend answers 404 rather than revealing it exists), has
  // nothing to render. Never a fixture in its place.
  if (!sel0) {
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 90 }}>
        {confirmDialog}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px" }}>
          <button onClick={() => router.push(SCREEN_PATHS.H9_MyReports)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>← كل البلاغات</button>
          {liveDetail.status === "error" && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                {liveDetail.notFound ? "لا توجد بلاغات حتى الآن" : (liveDetail.errorMessage ?? "")}
              </h2>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 90 }}>
      {confirmDialog}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px" }}>
        <button onClick={() => router.push(SCREEN_PATHS.H9_MyReports)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>← كل البلاغات</button>

        <div style={{ background: "var(--g-900)", borderRadius: "var(--r-2xl)", padding: "26px 28px", color: "var(--t-on-dark)", boxShadow: "var(--sh-3)" }}>
          <div style={{ fontSize: 12.5, color: "var(--t-on-dark-soft)", marginBottom: 10 }} dir="ltr">{sel0.number} <span>· {sel0.date}</span></div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 14px" }}>{sel0.title}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: "var(--r-full)", background: "rgba(var(--t-on-dark-rgb), .1)" }}>{sel0.text}</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: "var(--r-full)", background: "rgba(var(--t-on-dark-rgb), .1)" }}>{sel0.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: "var(--r-full)", background: "rgba(var(--t-on-dark-rgb), .1)" }}>أولوية {sel0.priority}</span>
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>مسار البلاغ</h3>
          <div style={{ ...card, padding: "6px 22px" }}>
            {timeline.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 15, padding: "13px 0" }}>
                <span style={{ width: 19, height: 19, borderRadius: "50%", background: t.done ? "var(--ok)" : "var(--n-surface)", border: `2px solid ${t.done ? "var(--ok)" : t.current ? "var(--warn)" : "var(--n-border-strong)"}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{t.done && <span style={{ color: "var(--t-on-dark)", fontSize: 10 }}>✓</span>}</span>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: t.done || t.current ? "var(--t-primary)" : "var(--t-tertiary)" }}>{t.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rendered only when an AI analysis genuinely produced this report.
            A manually-filed report has `ai: null` on the canonical DTO, and the
            Backend never back-fills a plausible confidence — so neither does
            this screen. Recorded for Task 3 (H9 has no approved
            "filed manually" presentation of its own). */}
        {sel0.aiDescription !== null && sel0.confidence !== null && (
        <div style={{ marginTop: 26 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>تحليل الذكاء الاصطناعي</h3>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 14 }}>{sel0.aiDescription}</div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>التصنيف</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{sel0.category}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>الأولوية (تلقائية)</div><div style={{ fontSize: 13.5, fontWeight: 600, color: sel0.pri.c }}>{sel0.priority}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--t-tertiary)" }}>دقة التحليل</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{sel0.confidence}%</div></div>
            </div>
          </div>
        </div>
        )}

        <div style={{ marginTop: 26 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>الضمان</h3>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: sel0.warranty === "in" ? "var(--g-700)" : "var(--warn-strong)", background: sel0.warranty === "in" ? "var(--g-50)" : "var(--warn-bg)", padding: "6px 13px", borderRadius: "var(--r-full)" }}>{sel0.warranty === "in" ? "داخل الضمان" : "خارج الضمان"}</span>
            </div>
            <div style={{ background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--a-700)", marginBottom: 6 }}>توضيح مساعد سكن</div>
              <div style={{ fontSize: 13, color: "var(--a-800)", lineHeight: 1.7 }}>{sel0.warrantyExplanation}</div>
            </div>
          </div>
        </div>

        {sel0.key === "waiting" && detailStage === "view" && (
          <div style={{ marginTop: 26 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>مقارنة الذكاء الاصطناعي — قبل وبعد الإصلاح</h3>
            {compareStage === "analyzing" ? (
              <div style={{ ...card, padding: "30px 20px", textAlign: "center" }}>
                <div style={{ width: 76, height: 76, margin: "0 auto 18px", borderRadius: "50%", border: "3px solid var(--g-100)", borderTopColor: "var(--g-600)" }} />
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>يقارن الذكاء الاصطناعي صور ما قبل وبعد الإصلاح…</div>
                <p style={{ fontSize: 13, color: "var(--t-secondary)", margin: "8px 0 0" }}>نقيّم جودة الإصلاح تلقائياً قبل طلب اعتمادك.</p>
              </div>
            ) : (
              <>
                {showsComparisonScore && (
                <div style={{ ...card, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 6 }}>قبل الإصلاح</div>
                      <div style={{ aspectRatio: "4/3", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 6 }}>بعد الإصلاح</div>
                      <div style={{ aspectRatio: "4/3", borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", background: "var(--n-surface2)" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 12.5, color: "var(--t-secondary)" }}>نسبة اكتمال الإصلاح</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--g-700)" }}>{repairPercentage}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: "var(--r-full)", background: "var(--n-surface2)", marginBottom: 14 }}>
                    <div style={{ height: "100%", width: `${repairPercentage}%`, borderRadius: "var(--r-full)", background: "linear-gradient(90deg,var(--g-500),var(--g-700))" }} />
                  </div>
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: remainingIssues.length ? 16 : 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--g-700)", background: "var(--g-50)", padding: "7px 13px", borderRadius: "var(--r-full)" }}>جودة الإصلاح: {repairQuality}</span>
                  </div>
                  {remainingIssues.length > 0 && (
                    <div style={{ paddingTop: 14, borderTop: "1px dashed var(--n-border-strong)" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--warn)", marginBottom: 8 }}>ملاحظات متبقية</div>
                      {remainingIssues.map((r) => <div key={r} style={{ fontSize: 13, color: "var(--t-secondary)", marginBottom: 4 }}>• {r}</div>)}
                    </div>
                  )}
                </div>
                )}
                <div style={{ background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-xl)", padding: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, textAlign: "center" }}>هل تعتمد نتيجة الإصلاح؟</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button disabled={!sel0.canApprove || liveDetail.acting} onClick={approveYes} style={{ fontSize: 14.5, fontWeight: 600, padding: 14, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>نعم، اعتماد الإصلاح</button>
                    <button disabled={!sel0.canReopen || liveDetail.acting} onClick={() => void approveNo()} style={{ fontSize: 14.5, fontWeight: 600, padding: 14, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", cursor: "pointer" }}>لا، ما زالت المشكلة موجودة</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {detailStage === "evaluate" && (
          <div style={{ marginTop: 26, ...card, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>كيف كانت تجربتك مع عملية الإصلاح؟</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "18px 0 20px" }}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 30, color: n <= rating ? "var(--a-500)" : "var(--n-border-strong)" }}>★</button>)}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="اختياري — مثال: تم الإصلاح بسرعة." style={{ width: "100%", minHeight: 84, padding: 13, border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", resize: "vertical" }} />
            <button disabled={rating === 0 || liveDetail.acting} onClick={() => void submitRating()} style={{ width: "100%", fontSize: 15.5, fontWeight: 600, padding: 15, marginTop: 16, border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: rating ? "pointer" : "not-allowed", opacity: rating ? 1 : 0.5 }}>إرسال التقييم</button>
          </div>
        )}

        {detailStage === "closedSuccess" && (
          <div style={{ marginTop: 26, ...card, padding: "34px 26px", textAlign: "center" }}>
            <div style={{ width: 70, height: 70, margin: "0 auto 20px", borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>✓</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>تم إغلاق البلاغ بنجاح</h3>
            <p style={{ fontSize: 14, color: "var(--t-secondary)", margin: "11px 0 20px" }}>شكراً لتقييمك، تم اعتماد الإصلاح وإغلاق البلاغ.</p>
            <button onClick={() => router.push(SCREEN_PATHS.H9_MyReports)} style={{ fontSize: 14.5, fontWeight: 600, padding: "13px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>العودة إلى كل البلاغات</button>
          </div>
        )}

        {detailStage === "reopen" && (
          <div style={{ marginTop: 26, background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: "var(--r-xl)", padding: 26, textAlign: "center" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>تمت إعادة فتح البلاغ</h3>
            <p style={{ fontSize: 13.5, color: "var(--warn-strong)", margin: "0 0 20px" }}>تم إشعار الفريق المسؤول لمتابعة المشكلة، وسيتم التواصل معك قريباً.</p>
            <button onClick={ackReopen} style={{ fontSize: 14, fontWeight: 600, padding: "12px 26px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer" }}>حسناً</button>
          </div>
        )}
      </div>
    </div>
  );
}
