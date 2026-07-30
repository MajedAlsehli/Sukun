"use client";

/**
 * H8 · Step 2 — the analysis screen. Full-width split: the resident's actual
 * photo under a scanning sweep on one side, staged progress on the other.
 *
 * The stage list is cosmetic narration over a single real call — it advances
 * on a timer, but it is *capped* below 100% and never claims completion. The
 * screen only leaves when the promise in the parent resolves, so when the
 * real model is slower than the mock the UI simply waits on the last stage
 * instead of lying that it finished.
 */

import { memo, useEffect, useState } from "react";
import { AiChip } from "@/components/brand/SukunBrand";
import { CheckIcon } from "@/components/brand/Icons";

const STAGES = [
  "تجهيز الصورة وتحسين الوضوح",
  "رصد المناطق غير الطبيعية",
  "مطابقة النمط مع قاعدة الأعطال",
  "تقدير الخطورة والسبب المحتمل",
];

export const AnalyzingStep = memo(function AnalyzingStep({ imageUrl }: { imageUrl: string | null }) {
  const [stage, setStage] = useState(0);
  const [pct, setPct] = useState(4);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      // Never auto-advance past the final stage — completion is owned by the
      // resolving promise, not by this timer.
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 720);
    const pctTimer = setInterval(() => {
      // Asymptotic crawl toward 96%: fast at first, never reaching 100.
      setPct((p) => (p >= 96 ? 96 : p + Math.max(1, Math.round((96 - p) * 0.09))));
    }, 130);
    return () => {
      clearInterval(stageTimer);
      clearInterval(pctTimer);
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 34, gridTemplateColumns: "minmax(0,1fr)" }} className="sk-report-split">
      {/* -------------------------------------------------- scanning frame */}
      <div
        style={{
          position: "relative",
          borderRadius: "var(--r-2xl)",
          overflow: "hidden",
          aspectRatio: "4/3",
          background: "var(--g-900)",
          boxShadow: "var(--sh-4)",
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="الصورة قيد التحليل"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "var(--g-800)" }} />
        )}

        {/* corner reticles */}
        {[
          { top: 18, insetInlineStart: 18, rot: 0 },
          { top: 18, insetInlineEnd: 18, rot: 90 },
          { bottom: 18, insetInlineEnd: 18, rot: 180 },
          { bottom: 18, insetInlineStart: 18, rot: 270 },
        ].map((c, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              ...c,
              width: 26,
              height: 26,
              borderTop: "2px solid var(--a-300)",
              borderInlineStart: "2px solid var(--a-300)",
              transform: `rotate(${c.rot}deg)`,
              opacity: 0.9,
            }}
          />
        ))}

        {/* the sweep */}
        <span
          style={{
            position: "absolute",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            top: 0,
            height: "10%",
            background:
              "linear-gradient(180deg, transparent, rgba(224,172,110,.42) 45%, rgba(224,172,110,.85) 50%, rgba(224,172,110,.42) 55%, transparent)",
            animation: "sk-scan 2.3s var(--ease) infinite",
            willChange: "transform",
          }}
        />

        <div
          style={{
            position: "absolute",
            insetInlineStart: 20,
            insetInlineEnd: 20,
            bottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: "var(--r-full)",
            background: "rgba(13,27,52,.62)",
            backdropFilter: "blur(10px)",
            boxShadow: "inset 0 0 0 1px rgba(244,241,234,.14)",
            color: "var(--t-on-dark)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--a-300)",
              animation: "sk-breathe 1.4s var(--ease) infinite",
              flex: "none",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>جارٍ المسح البصري…</span>
          <span style={{ marginInlineStart: "auto", fontSize: 13, fontWeight: 700, color: "var(--a-200)" }}>
            {pct}%
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------- narration */}
      <div style={{ alignSelf: "center" }}>
        <AiChip />
        <h1
          style={{
            fontSize: "clamp(26px, 3.4vw, 36px)",
            fontWeight: 700,
            letterSpacing: "-.8px",
            lineHeight: 1.25,
            margin: "20px 0 14px",
          }}
        >
          يقوم مستشار سُكن بتحليل الصورة…
        </h1>
        <p style={{ fontSize: 15.5, color: "var(--t-secondary)", lineHeight: 1.85, margin: 0, maxWidth: "40ch" }}>
          نقارن ما في صورتك بأنماط أعطال موثّقة لتحديد النوع والموقع والخطورة. لا حاجة لأي إجراء منك.
        </p>

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 4 }}>
          {STAGES.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <div
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "13px 16px",
                  borderRadius: "var(--r-md)",
                  background: active ? "var(--n-surface)" : "transparent",
                  boxShadow: active ? "inset 0 0 0 1px var(--n-border), var(--sh-1)" : "none",
                  transition: "background .3s var(--ease), box-shadow .3s var(--ease)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flex: "none",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? "var(--ok-bg)" : active ? "var(--a-50)" : "var(--n-surface2)",
                    color: done ? "var(--ok)" : "var(--a-600)",
                    boxShadow: `inset 0 0 0 1px ${done ? "rgba(47,158,106,.3)" : active ? "var(--a-200)" : "var(--n-border)"}`,
                  }}
                >
                  {done ? (
                    <CheckIcon size={13} />
                  ) : active ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--a-500)",
                        animation: "sk-breathe 1.2s var(--ease) infinite",
                      }}
                    />
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: done || active ? "var(--t-primary)" : "var(--t-tertiary)",
                  }}
                >
                  {s}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
