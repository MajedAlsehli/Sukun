"use client";

/**
 * Root-layout error boundary — the very last net.
 *
 * This fires only when the root layout itself throws, which means `globals.css`
 * and the font may not have been applied. It therefore replaces the whole
 * document (its own `<html>`/`<body>`, as Next.js requires) and cannot rely on
 * CSS custom properties — the literal values below are copied from
 * `globals.css` (`--n-bg`, `--t-primary`, `--g-900`, ...) so it still looks like
 * Sakn rather than a bare browser error page.
 *
 * `src/app/error.tsx` handles the ordinary per-segment case and is what will
 * normally render. Neither boundary substitutes for a root-cause fix; both
 * re-throw to the console so a defect stays visible.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[sukun] global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "26px",
            background: "#f6efe8",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <div
            style={{
              border: "1.5px dashed #d8cbb9",
              borderRadius: "16px",
              padding: "36px",
              textAlign: "center",
              fontSize: "12.5px",
              color: "#8a93a3",
              maxWidth: "460px",
              width: "100%",
              background: "#fcf8f2",
            }}
          >
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#0d1b34", marginBottom: "8px" }}>
              تعذّر تحميل التطبيق
            </div>
            <div style={{ marginBottom: "16px", lineHeight: 1.8 }}>
              حدث خطأ غير متوقع. المشكلة من جانبنا، ويمكنك إعادة المحاولة.
            </div>
            <button
              onClick={reset}
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                padding: "10px 18px",
                border: "none",
                borderRadius: "999px",
                background: "#0d1b34",
                color: "#f4f1ea",
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
            {error.digest && (
              <div style={{ marginTop: "18px", fontSize: "10.5px", direction: "ltr" }}>{error.digest}</div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
