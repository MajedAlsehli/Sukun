/**
 * 404 — an unmatched URL, or an explicit `notFound()`.
 *
 * Next.js's built-in 404 is an untranslated LTR page. This is the same dashed
 * empty-state presentation the rest of the app already uses for "there is
 * nothing here", so a mistyped deep link lands somewhere that looks like Sakn
 * and offers a way back. No normal screen is affected.
 */
export default function NotFound() {
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
          الصفحة غير موجودة
        </div>
        <div style={{ marginBottom: "16px", lineHeight: 1.8 }}>
          الرابط الذي فتحته لا يشير إلى صفحة في سكن.
        </div>
        <a
          href="/"
          style={{
            display: "inline-block",
            fontSize: "12.5px",
            fontWeight: 600,
            padding: "10px 18px",
            border: "none",
            borderRadius: "var(--r-full)",
            background: "var(--g-900)",
            color: "var(--t-on-dark)",
            textDecoration: "none",
            boxShadow: "var(--sh-1)",
          }}
        >
          الصفحة الرئيسية
        </a>
      </div>
    </div>
  );
}
