"use client";

/**
 * H8 · Step 3 — the AI result. A large two-column defect card: the resident's
 * photo with the model's bounding box drawn over it, and every field the
 * contract returns (type, confidence, severity, location, probable cause,
 * recommended actions).
 *
 * Two distinct presentations, driven by `LOW_CONFIDENCE_THRESHOLD`:
 * confident results are stated as findings; anything below it refuses to
 * guess and routes the resident to manual classification instead. That
 * branch is the product's "AI fails" requirement, and it is reachable in the
 * demo (see `mock.ts` — roughly one upload in seven).
 */

import { AiChip, MetaPill, brandButton } from "@/components/brand/SukunBrand";
import { AlertIcon, CheckIcon, EditIcon, PinIcon, ScanIcon, ShieldIcon } from "@/components/brand/Icons";
import { LOW_CONFIDENCE_THRESHOLD, type DefectAnalysis, type WarrantyOpinion } from "@/lib/ai/client";

const SEVERITY_TONE: Record<string, "ok" | "warn" | "err" | "neutral"> = {
  "منخفضة": "ok",
  "متوسطة": "warn",
  "عالية": "err",
  "حرجة": "err",
};

export function ResultStep({
  analysis,
  warranty,
  imageUrl,
  onConfirm,
  onEdit,
}: {
  analysis: DefectAnalysis;
  warranty: WarrantyOpinion | null;
  imageUrl: string | null;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const uncertain = analysis.confidence < LOW_CONFIDENCE_THRESHOLD;
  const box = analysis.boundingBox;

  return (
    <div style={{ animation: "sk-reveal .6s var(--ease) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <AiChip label={uncertain ? "نتيجة غير مؤكدة" : "نتيجة التحليل"} />
        <span style={{ fontSize: 12.5, color: "var(--t-tertiary)" }}>
          اكتمل التحليل في {(analysis.latencyMs / 1000).toFixed(1)} ثانية
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gap: 0,
          gridTemplateColumns: "minmax(0,1fr)",
          borderRadius: "var(--r-2xl)",
          overflow: "hidden",
          background: "var(--n-surface)",
          boxShadow: "var(--sh-4), inset 0 0 0 1px var(--n-border)",
        }}
        className="sk-result-split"
      >
        {/* ------------------------------------------------------- evidence */}
        <div style={{ position: "relative", background: "var(--g-900)", minHeight: 300 }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="صورة العطل"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 300 }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", minHeight: 300, background: "var(--g-800)" }} />
          )}

          {box && (
            <span
              style={{
                position: "absolute",
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
                border: "2px solid var(--a-300)",
                borderRadius: "var(--r-sm)",
                boxShadow: "0 0 0 9999px rgba(13,27,52,.34)",
                animation: "sk-box .7s var(--ease) both .25s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -13,
                  insetInlineStart: -2,
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: "var(--r-full)",
                  background: "var(--a-500)",
                  color: "var(--t-on-dark)",
                  whiteSpace: "nowrap",
                }}
              >
                {analysis.category}
              </span>
            </span>
          )}

          <span
            style={{
              position: "absolute",
              top: 16,
              insetInlineStart: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 11.5,
              fontWeight: 600,
              padding: "7px 13px",
              borderRadius: "var(--r-full)",
              background: "rgba(13,27,52,.66)",
              backdropFilter: "blur(8px)",
              color: "var(--t-on-dark)",
              boxShadow: "inset 0 0 0 1px rgba(244,241,234,.16)",
            }}
          >
            <ScanIcon size={14} />
            {box ? "المنطقة المرصودة" : "لم تُرصد منطقة محدّدة"}
          </span>
        </div>

        {/* -------------------------------------------------------- findings */}
        <div style={{ padding: "32px 30px" }}>
          {uncertain ? (
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "16px 18px",
                borderRadius: "var(--r-lg)",
                background: "var(--warn-bg)",
                color: "var(--warn-strong)",
                marginBottom: 22,
                boxShadow: "inset 0 0 0 1px rgba(201,138,43,.24)",
              }}
            >
              <AlertIcon size={20} />
              <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                درجة الثقة منخفضة ({analysis.confidence}%). لن نصنّف العطل نيابةً عنك — أكمل التصنيف يدوياً وسنوجّه
                البلاغ فوراً.
              </span>
            </div>
          ) : null}

          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.4px", lineHeight: 1.45, margin: 0 }}>
            {analysis.summary}
          </h2>

          {/* confidence meter */}
          <div style={{ margin: "24px 0 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--t-secondary)", fontWeight: 600 }}>درجة الثقة</span>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: uncertain ? "var(--warn)" : "var(--g-700)",
                }}
              >
                {analysis.confidence}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: "var(--r-full)", background: "var(--n-surface2)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${analysis.confidence}%`,
                  borderRadius: "var(--r-full)",
                  background: uncertain
                    ? "linear-gradient(90deg,var(--warn),var(--a-300))"
                    : "linear-gradient(90deg,var(--g-500),var(--g-700))",
                  transition: "width .8s var(--ease)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            <MetaPill label="النوع" value={analysis.category} tone="gold" />
            <MetaPill label="الخطورة" value={analysis.severity} tone={SEVERITY_TONE[analysis.severity] ?? "neutral"} />
            {warranty && (
              <MetaPill
                icon={<ShieldIcon size={14} />}
                label={warranty.covered ? "داخل الضمان" : "خارج الضمان"}
                tone={warranty.covered ? "ok" : "warn"}
              />
            )}
          </div>

          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { icon: <PinIcon size={16} />, k: "موقع العطل في الوحدة", v: analysis.location },
              { icon: <ScanIcon size={16} />, k: "السبب المحتمل", v: analysis.probableCause },
            ].map((row) => (
              <div
                key={row.k}
                style={{
                  display: "flex",
                  gap: 13,
                  padding: "15px 0",
                  borderTop: "1px solid var(--n-border)",
                }}
              >
                <span style={{ color: "var(--a-600)", flex: "none", marginTop: 2 }}>{row.icon}</span>
                <div>
                  <dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 4 }}>
                    {row.k}
                  </dt>
                  <dd style={{ fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{row.v}</dd>
                </div>
              </div>
            ))}
          </dl>

          {analysis.recommendedActions.length > 0 && (
            <div
              style={{
                marginTop: 20,
                padding: "18px 20px",
                borderRadius: "var(--r-lg)",
                background: "var(--n-surface2)",
                boxShadow: "inset 0 0 0 1px var(--n-border)",
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t-tertiary)", marginBottom: 11 }}>
                ما ننصحك به الآن
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                {analysis.recommendedActions.map((a) => (
                  <li key={a} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.65 }}>
                    <span style={{ color: "var(--ok)", flex: "none", marginTop: 1 }}>
                      <CheckIcon size={15} />
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- actions */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 24,
          flexWrap: "wrap",
          justifyContent: "flex-start",
        }}
      >
        {uncertain ? (
          <>
            <button onClick={onEdit} style={{ ...brandButton("primary"), flex: "1 1 260px" }}>
              <EditIcon size={18} />
              أكمل التصنيف يدوياً
            </button>
            <button onClick={onConfirm} style={{ ...brandButton("ghost"), flex: "0 1 200px" }}>
              أرسل كما هو
            </button>
          </>
        ) : (
          <>
            <button onClick={onConfirm} style={{ ...brandButton("primary"), flex: "1 1 280px" }}>
              <CheckIcon size={18} />
              التشخيص صحيح — تابع
            </button>
            <button onClick={onEdit} style={{ ...brandButton("ghost"), flex: "0 1 220px" }}>
              <EditIcon size={17} />
              تعديل التفاصيل
            </button>
          </>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--t-tertiary)", margin: "16px 2px 0", lineHeight: 1.7 }}>
        نتيجة التحليل تقدير إرشادي يعتمد على الصورة المرفقة، ويؤكّدها المقاول عند المعاينة.
      </p>
    </div>
  );
}
