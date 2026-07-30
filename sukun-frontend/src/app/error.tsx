"use client";

/**
 * Route-segment error boundary — the FINAL safety net, not a fix.
 *
 * Without this file, any render-time throw inside a route segment produced
 * Next.js's own untranslated "Application error: a client-side exception has
 * occurred" full-page replacement. This gives that same last-resort case the
 * app's existing dashed empty-state presentation and a working retry, in
 * Arabic, instead of a dead English page.
 *
 * It deliberately does NOT hide anything:
 *   * `reset()` re-renders the segment, so a transient failure genuinely
 *     recovers rather than being papered over;
 *   * the digest is shown, so a production report can be traced to a specific
 *     server log entry;
 *   * the error is still re-thrown into the console for the browser's own
 *     reporting.
 *
 * Every reproducible defect this pass found was fixed at its root cause (see
 * `lib/backend/stabilization.test.ts`); this file exists for the ones nobody
 * has hit yet. It renders only when a segment has already thrown, so no normal
 * screen changes in any way.
 */

import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the real stack reachable — the boundary must not be the reason a
    // defect goes unnoticed.
    console.error("[sukun] route error boundary caught:", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "26px",
        background: "var(--n-bg)",
      }}
    >
      <div
        style={{
          border: "1.5px dashed var(--n-border-strong)",
          borderRadius: "var(--r-lg)",
          padding: "36px",
          textAlign: "center",
          fontSize: "12.5px",
          color: "var(--t-tertiary)",
          maxWidth: "460px",
          width: "100%",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--t-primary)", marginBottom: "8px" }}>
          تعذّر عرض هذه الصفحة
        </div>
        <div style={{ marginBottom: "16px", lineHeight: 1.8 }}>
          حدث خطأ غير متوقع أثناء عرض المحتوى. المشكلة من جانبنا، ويمكنك إعادة المحاولة.
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "10px 18px",
              border: "none",
              borderRadius: "var(--r-full)",
              background: "var(--g-900)",
              color: "var(--t-on-dark)",
              cursor: "pointer",
              boxShadow: "var(--sh-1)",
            }}
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "10px 18px",
              border: "1px solid var(--n-border-strong)",
              borderRadius: "var(--r-full)",
              background: "var(--n-surface)",
              color: "var(--t-secondary)",
              textDecoration: "none",
            }}
          >
            الصفحة الرئيسية
          </a>
        </div>
        {error.digest && (
          <div style={{ marginTop: "18px", fontSize: "10.5px", color: "var(--t-tertiary)", direction: "ltr" }}>
            {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
