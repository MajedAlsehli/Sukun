"use client";

/**
 * H8 · إنشاء بلاغ — rebuilt 2026-07-28 as a full-page, AI-first journey.
 *
 * Replaces the previous 488px centred card (a port of the prototype's
 * `Sakn Report Journey.dc.html` modal). That popup is gone entirely: this is
 * a five-step page — upload → analysis → result → edit → submit — with the
 * assistant, not the form, as the subject of the screen.
 *
 * The AI is reached only through `@/lib/ai/client`, whose response types are
 * already the future wire format, so going live is a one-line swap in that
 * file (see its header). Nothing in this component knows the result is
 * mocked: it awaits a promise, renders a loading screen, and handles
 * rejection with a real retry path.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HOMEOWNER_ACTIVE_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import {
  AiChip,
  BrandPanel,
  MetaPill,
  SukunWordmark,
  SectionHeading,
  brandButton,
} from "@/components/brand/SukunBrand";
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  NoteIcon,
  ShieldIcon,
  SparkIcon,
} from "@/components/brand/Icons";
import {
  DEFECT_CATEGORIES,
  sukunAi,
  type DefectAnalysis,
  type DefectCategory,
  type DefectSeverity,
  type WarrantyOpinion,
} from "@/lib/ai/client";
import { UploadStep, type Shot } from "./report/UploadStep";
import { AnalyzingStep } from "./report/AnalyzingStep";
import { ResultStep } from "./report/ResultStep";
import { DEMO_MODE } from "@/lib/demo/config";
import { useSubmitReport } from "@/lib/hooks/useReportJourney";

type Step = "upload" | "analyzing" | "result" | "edit" | "submit" | "done";

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "upload", label: "الصورة" },
  { key: "analyzing", label: "التحليل" },
  { key: "result", label: "النتيجة" },
  { key: "submit", label: "الإرسال" },
];
const STEP_INDEX: Record<Step, number> = {
  upload: 0,
  analyzing: 1,
  result: 2,
  edit: 2,
  submit: 3,
  done: 3,
};

const SEVERITIES: DefectSeverity[] = ["منخفضة", "متوسطة", "عالية", "حرجة"];

export function ReportJourneyScreen() {
  return (
    <RouteGuard allow={HOMEOWNER_ACTIVE_ONLY}>
      <ReportJourneyInner />
    </RouteGuard>
  );
}

function ReportJourneyInner() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [shots, setShots] = useState<Shot[]>([]);
  const [analysis, setAnalysis] = useState<DefectAnalysis | null>(null);
  const [warranty, setWarranty] = useState<WarrantyOpinion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [note, setNote] = useState("");

  /**
   * Task 2 · the real `POST /api/reports`.
   *
   * The analysis half of this journey already runs through
   * `@/lib/ai/client`, which is the LIVE implementation outside Demo Mode:
   * every photo is staged into the PRIVATE Supabase bucket via
   * `POST /api/reports/media`, then `POST /api/reports/analyze` runs YOLO
   * detection and the OpenAI analysis server-side. Nothing in this component
   * changed to make that true — that is what the `SaknAi` contract was for.
   *
   * The demo report number was `#${2400 + Math.random()*300}` — a fabricated
   * identifier. In real mode the Backend assigns the real `reportNumber` and
   * that is what the done screen shows.
   */
  const submitter = useSubmitReport();
  const submitting = submitter.submitting || demoSubmitting;
  const [demoReportNumber] = useState(() => `#${2400 + Math.floor(Math.random() * 300)}`);
  const reportNumber = DEMO_MODE ? demoReportNumber : (submitter.reportNumber ?? "");

  // Draft edits live separately so cancelling an edit cannot corrupt the
  // model's original finding (which the report cites as the AI's own).
  const [draft, setDraft] = useState<{
    summary: string;
    category: DefectCategory;
    severity: DefectSeverity;
    location: string;
  } | null>(null);

  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const heroUrl = shots[0]?.url ?? null;

  const addShots = useCallback((files: File[]) => {
    setShots((prev) => {
      const next = files.map((file) => {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, url };
      });
      return [...prev, ...next];
    });
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  async function runAnalysis() {
    if (shots.length === 0) return;
    setStep("analyzing");
    setAiError(null);
    try {
      const result = await sukunAi.analyzeDefect({ images: shots.map((s) => s.file), note: note || undefined });
      setAnalysis(result);
      setDraft({
        summary: result.summary,
        category: result.category,
        severity: result.severity,
        location: result.location,
      });
      // Warranty opinion is a second, independent call — a failure here must
      // not block the report, so it is caught separately and simply omitted.
      sukunAi
        .warrantyOpinion({ category: result.category, severity: result.severity, withinWarrantyWindow: true })
        .then(setWarranty)
        .catch(() => setWarranty(null));
      setStep("result");
    } catch {
      setAiError("تعذّر إكمال التحليل. تحقّق من اتصالك ثم أعد المحاولة، أو أكمل التصنيف يدوياً.");
      setStep("upload");
    }
  }

  async function submitReport() {
    if (DEMO_MODE) {
      setDemoSubmitting(true);
      await new Promise((r) => setTimeout(r, 900));
      setDemoSubmitting(false);
      setStep("done");
      return;
    }
    // The report must cite the SAME media the analysis ran over — the Backend
    // enforces it — so the staging keys are read back from `lib/ai/live.ts`
    // by the hook rather than being threaded through the frozen contract type.
    const ok = await submitter.submit({
      analysisId: analysis?.analysisId ?? null,
      categoryLabel: effective.category,
      summary: effective.summary,
      note,
      location: effective.location,
      categoryConfirmedByUser: !edited,
    });
    if (ok) setStep("done");
    // On failure the journey stays on the review step with the real error
    // beneath the submit button — never a success screen for a report the
    // Backend refused.
  }

  const effective = draft ?? {
    summary: analysis?.summary ?? "",
    category: (analysis?.category ?? "أخرى") as DefectCategory,
    severity: (analysis?.severity ?? "متوسطة") as DefectSeverity,
    location: analysis?.location ?? "",
  };
  const edited =
    analysis !== null &&
    (effective.summary !== analysis.summary ||
      effective.category !== analysis.category ||
      effective.severity !== analysis.severity ||
      effective.location !== analysis.location);

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
      {/* ------------------------------------------------------------ chrome */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "rgba(246,239,232,.88)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--n-border)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "14px 26px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <SukunWordmark size={16} tagline="رفع بلاغ" />
          <span className="sk-only-mobile"><AccountMenu variant="compact" /></span>

          <nav aria-label="مراحل البلاغ" style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {STEP_LABELS.map((s, i) => {
              const current = STEP_INDEX[step];
              const done = i < current;
              const active = i === current;
              return (
                <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    className="sk-step-label"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      color: active ? "var(--t-primary)" : done ? "var(--g-600)" : "var(--t-tertiary)",
                      padding: "7px 13px",
                      borderRadius: "var(--r-full)",
                      background: active ? "var(--n-surface)" : "transparent",
                      boxShadow: active ? "inset 0 0 0 1px var(--n-border)" : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        background: done ? "var(--g-700)" : active ? "var(--a-500)" : "var(--n-surface2)",
                        color: done || active ? "var(--t-on-dark)" : "var(--t-tertiary)",
                      }}
                    >
                      {done ? <CheckIcon size={10} /> : i + 1}
                    </span>
                    {s.label}
                  </span>
                  {i < STEP_LABELS.length - 1 && (
                    <span style={{ width: 14, height: 1.5, borderRadius: 2, background: done ? "var(--g-400)" : "var(--n-border-strong)" }} />
                  )}
                </span>
              );
            })}
          </nav>

          <button
            onClick={() => router.push(SCREEN_PATHS.H7_MyHome)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--t-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
            }}
          >
            إلغاء
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 26px 90px" }}>
        {/* The submit error reuses this EXISTING alert rather than introducing a
            new one — same element, same styles, same position. Its retry button
            re-runs whichever action failed. */}
        {((aiError && step === "upload") || (submitter.errorMessage && step === "submit")) && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 26,
              padding: "16px 20px",
              borderRadius: "var(--r-lg)",
              background: "var(--err-bg)",
              color: "var(--err)",
              fontSize: 14,
              boxShadow: "inset 0 0 0 1px rgba(188,70,48,.2)",
            }}
          >
            <AlertIcon size={20} />
            <span style={{ flex: 1, lineHeight: 1.65 }}>{step === "submit" ? submitter.errorMessage : aiError}</span>
            <button onClick={() => void (step === "submit" ? submitReport() : runAnalysis())} style={{ ...brandButton("ghost"), padding: "10px 18px", fontSize: 13.5 }}>
              أعد المحاولة
            </button>
          </div>
        )}

        {step === "upload" && (
          <UploadStep shots={shots} onAdd={addShots} onRemove={removeShot} onAnalyze={() => void runAnalysis()} />
        )}

        {step === "analyzing" && <AnalyzingStep imageUrl={heroUrl} />}

        {step === "result" && analysis && (
          <ResultStep
            analysis={analysis}
            warranty={warranty}
            imageUrl={heroUrl}
            onConfirm={() => setStep("submit")}
            onEdit={() => setStep("edit")}
          />
        )}

        {step === "edit" && analysis && draft && (
          <EditStep
            draft={draft}
            original={analysis}
            onChange={setDraft}
            onDone={() => setStep("submit")}
            onBack={() => setStep("result")}
          />
        )}

        {step === "submit" && analysis && (
          <SubmitStep
            summary={effective.summary}
            category={effective.category}
            severity={effective.severity}
            location={effective.location}
            cause={analysis.probableCause}
            confidence={analysis.confidence}
            edited={edited}
            warranty={warranty}
            imageUrl={heroUrl}
            shotCount={shots.length}
            note={note}
            onNote={setNote}
            submitting={submitting}
            onSubmit={() => void submitReport()}
            onBack={() => setStep("result")}
          />
        )}

        {step === "done" && <DoneStep reportNumber={reportNumber} onTrack={() => router.push(SCREEN_PATHS.H9_MyReports)} onHome={() => router.push(SCREEN_PATHS.H7_MyHome)} />}
      </main>

      {/* Layout rules for the two split sections — plain CSS so the grid can
          collapse to one column below md without any JS breakpoint state. */}
      <style jsx global>{`
        @media (min-width: 900px) {
          .sk-report-split {
            grid-template-columns: 1fr 1.05fr !important;
            align-items: start;
          }
          .sk-result-split {
            grid-template-columns: 1.05fr 1fr !important;
          }
        }
        @media (max-width: 720px) {
          .sk-step-label {
            font-size: 0 !important;
            padding: 6px !important;
            gap: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ step 4 */

function EditStep({
  draft,
  original,
  onChange,
  onDone,
  onBack,
}: {
  draft: { summary: string; category: DefectCategory; severity: DefectSeverity; location: string };
  original: DefectAnalysis;
  onChange: (d: { summary: string; category: DefectCategory; severity: DefectSeverity; location: string }) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const field: React.CSSProperties = {
    width: "100%",
    padding: "13px 15px",
    fontSize: 14.5,
    borderRadius: "var(--r-md)",
    border: "1.5px solid var(--n-border-strong)",
    background: "var(--n-surface)",
    color: "var(--t-primary)",
  };

  return (
    <div style={{ maxWidth: 720, animation: "sk-reveal .5s var(--ease) both" }}>
      <AiChip label="تصحيح التشخيص" />
      <h1 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 700, letterSpacing: "-.7px", margin: "18px 0 10px" }}>
        صحّح ما أخطأ فيه المستشار
      </h1>
      <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.8, margin: "0 0 30px", maxWidth: "48ch" }}>
        تعديلاتك تُحفظ مع البلاغ، ونحتفظ بالتشخيص الأصلي للمقارنة — هكذا يتحسّن المستشار.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>وصف المشكلة</span>
          <textarea
            value={draft.summary}
            onChange={(e) => onChange({ ...draft, summary: e.target.value })}
            style={{ ...field, minHeight: 96, resize: "vertical", lineHeight: 1.7 }}
          />
          <span style={{ fontSize: 12, color: "var(--t-tertiary)" }}>اكتب ما تراه بكلماتك — لا حاجة لمصطلحات فنية.</span>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>نوع العطل</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
            {DEFECT_CATEGORIES.map((c) => {
              const on = draft.category === c;
              return (
                <button
                  key={c}
                  onClick={() => onChange({ ...draft, category: c })}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    padding: "10px 17px",
                    borderRadius: "var(--r-full)",
                    border: "none",
                    cursor: "pointer",
                    background: on ? "var(--g-900)" : "var(--n-surface)",
                    color: on ? "var(--t-on-dark)" : "var(--t-secondary)",
                    boxShadow: on ? "var(--sh-2)" : "inset 0 0 0 1.5px var(--n-border-strong)",
                    transition: "background .18s var(--ease)",
                  }}
                >
                  {c}
                  {c === original.category && !on && (
                    <span style={{ color: "var(--a-600)", marginInlineStart: 6, fontSize: 11 }}>· اقتراح</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>درجة الخطورة</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 9 }}>
            {SEVERITIES.map((s) => {
              const on = draft.severity === s;
              return (
                <button
                  key={s}
                  onClick={() => onChange({ ...draft, severity: s })}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    padding: "12px 10px",
                    borderRadius: "var(--r-md)",
                    border: "none",
                    cursor: "pointer",
                    background: on ? "var(--g-900)" : "var(--n-surface)",
                    color: on ? "var(--t-on-dark)" : "var(--t-secondary)",
                    boxShadow: on ? "var(--sh-2)" : "inset 0 0 0 1.5px var(--n-border-strong)",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>موقع العطل في الوحدة</span>
          <input
            value={draft.location}
            onChange={(e) => onChange({ ...draft, location: e.target.value })}
            placeholder="مثال: المطبخ — أسفل حوض الغسيل"
            style={field}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
        <button onClick={onDone} style={{ ...brandButton("primary"), flex: "1 1 240px" }}>
          احفظ وتابع
        </button>
        <button onClick={onBack} style={{ ...brandButton("ghost"), flex: "0 1 160px" }}>
          <ArrowIcon size={17} />
          رجوع
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 5 */

function SubmitStep({
  summary,
  category,
  severity,
  location,
  cause,
  confidence,
  edited,
  warranty,
  imageUrl,
  shotCount,
  note,
  onNote,
  submitting,
  onSubmit,
  onBack,
}: {
  summary: string;
  category: string;
  severity: string;
  location: string;
  cause: string;
  confidence: number;
  edited: boolean;
  warranty: WarrantyOpinion | null;
  imageUrl: string | null;
  shotCount: number;
  note: string;
  onNote: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 30, gridTemplateColumns: "minmax(0,1fr)", animation: "sk-reveal .5s var(--ease) both" }} className="sk-report-split">
      <div>
        <AiChip label="مراجعة أخيرة" />
        <h1 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 700, letterSpacing: "-.7px", margin: "18px 0 10px" }}>
          كل شيء جاهز للإرسال
        </h1>
        <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.8, margin: "0 0 26px", maxWidth: "44ch" }}>
          سيصل البلاغ مباشرةً إلى مدير المشروع والمقاول المختص، وستُشعر بكل تحديث على حالته.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
            <NoteIcon size={16} />
            ملاحظة إضافية
            <span style={{ fontWeight: 500, color: "var(--t-tertiary)" }}>(اختياري)</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="مثال: المشكلة بدأت منذ يومين وتزداد مع الاستخدام."
            style={{
              width: "100%",
              minHeight: 110,
              padding: "14px 16px",
              fontSize: 14.5,
              lineHeight: 1.7,
              borderRadius: "var(--r-md)",
              border: "1.5px solid var(--n-border-strong)",
              background: "var(--n-surface)",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
          <button
            onClick={onSubmit}
            disabled={submitting}
            style={{ ...brandButton("primary"), flex: "1 1 240px", opacity: submitting ? 0.75 : 1 }}
          >
            {submitting ? (
              <>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(244,241,234,.35)",
                    borderTopColor: "var(--t-on-dark)",
                    borderRadius: "50%",
                    animation: "spin .7s linear infinite",
                  }}
                />
                جارٍ الإرسال…
              </>
            ) : (
              "إرسال البلاغ"
            )}
          </button>
          <button onClick={onBack} disabled={submitting} style={{ ...brandButton("ghost"), flex: "0 1 150px" }}>
            <ArrowIcon size={17} />
            رجوع
          </button>
        </div>
      </div>

      {/* summary card */}
      <div
        style={{
          borderRadius: "var(--r-2xl)",
          overflow: "hidden",
          background: "var(--n-surface)",
          boxShadow: "var(--sh-3), inset 0 0 0 1px var(--n-border)",
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" style={{ width: "100%", height: 190, objectFit: "cover", display: "block" }} />
        )}
        <div style={{ padding: "24px 26px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            <MetaPill label="النوع" value={category} tone="gold" />
            <MetaPill label="الخطورة" value={severity} tone="warn" />
            {warranty && (
              <MetaPill
                icon={<ShieldIcon size={14} />}
                label={warranty.covered ? "داخل الضمان" : "خارج الضمان"}
                tone={warranty.covered ? "ok" : "warn"}
              />
            )}
            {edited ? (
              <MetaPill label="عُدِّل يدوياً" tone="neutral" />
            ) : (
              <MetaPill icon={<SparkIcon size={13} />} label={`ثقة ${confidence}%`} tone="neutral" />
            )}
          </div>

          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.6, marginBottom: 18 }}>{summary}</div>

          <dl style={{ margin: 0 }}>
            {[
              ["الموقع", location],
              ["السبب المحتمل", cause],
              ["عدد الصور", `${shotCount}`],
              ["المشروع المسؤول", "مشروع تالا ريزيدنس — شركة الأفق"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 16, padding: "12px 0", borderTop: "1px solid var(--n-border)" }}>
                <dt style={{ fontSize: 12.5, color: "var(--t-tertiary)", flex: "none", width: 96 }}>{k}</dt>
                <dd style={{ fontSize: 13.5, fontWeight: 600, margin: 0, lineHeight: 1.65 }}>{v}</dd>
              </div>
            ))}
          </dl>

          {warranty && (
            <div
              style={{
                marginTop: 18,
                padding: "15px 17px",
                borderRadius: "var(--r-md)",
                background: "var(--a-50)",
                boxShadow: "inset 0 0 0 1px var(--a-100)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: "var(--a-700)", marginBottom: 7 }}>
                <ShieldIcon size={14} />
                رأي المستشار في الضمان
              </div>
              <p style={{ fontSize: 13, color: "var(--a-800)", lineHeight: 1.75, margin: 0 }}>{warranty.rationale}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- done */

function DoneStep({
  reportNumber,
  onTrack,
  onHome,
}: {
  reportNumber: string;
  onTrack: () => void;
  onHome: () => void;
}) {
  return (
    <div style={{ maxWidth: 620, margin: "20px auto 0", animation: "sk-reveal .55s var(--ease) both" }}>
      <BrandPanel padding={40}>
        <span
          style={{
            width: 74,
            height: 74,
            borderRadius: "50%",
            background: "rgba(47,158,106,.18)",
            color: "var(--ok-on-dark)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 26,
            boxShadow: "inset 0 0 0 1px rgba(95,211,156,.32)",
            animation: "pop .5s var(--ease)",
          }}
        >
          <CheckIcon size={34} />
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.6px", margin: 0 }}>تم استلام بلاغك</h1>
        <p style={{ fontSize: 15, color: "var(--t-on-dark-soft)", lineHeight: 1.85, margin: "14px 0 28px", maxWidth: "42ch" }}>
          أُرسل البلاغ إلى مدير المشروع والمقاول المسؤول مباشرةً. ستصلك إشعارات عند كل تغيّر في حالته حتى الإغلاق.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderRadius: "var(--r-lg)",
            background: "rgba(244,241,234,.07)",
            boxShadow: "inset 0 0 0 1px rgba(244,241,234,.14)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--t-on-dark-soft)" }}>رقم البلاغ</span>
          <span style={{ fontSize: 21, fontWeight: 700 }} dir="ltr">
            {reportNumber}
          </span>
        </div>
      </BrandPanel>

      <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        <button onClick={onTrack} style={{ ...brandButton("primary"), flex: "1 1 220px" }}>
          تابع حالة البلاغ
        </button>
        <button onClick={onHome} style={{ ...brandButton("ghost"), flex: "1 1 160px" }}>
          العودة إلى منزلي
        </button>
      </div>

      <div style={{ marginTop: 34 }}>
        <SectionHeading title="ماذا يحدث بعد الآن؟" />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            ["يراجع مدير المشروع البلاغ", "خلال ساعات العمل، ويعتمد الإسناد للمقاول."],
            ["يعاين المقاول العطل", "ويؤكّد التشخيص على الطبيعة قبل بدء الإصلاح."],
            ["تعتمد أنت النتيجة", "بعد رفع صور ما بعد الإصلاح ومقارنتها بالصورة الأصلية."],
          ].map(([t, d], i) => (
            <div
              key={t}
              className="sk-rise"
              style={{ display: "flex", gap: 14, padding: "14px 2px", borderTop: i ? "1px solid var(--n-border)" : "none", animationDelay: `${i * 80}ms` }}
            >
              <span style={{ color: "var(--a-600)", flex: "none", marginTop: 2 }}>
                <SparkIcon size={17} />
              </span>
              <span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{t}</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--t-tertiary)", marginTop: 3, lineHeight: 1.6 }}>{d}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
