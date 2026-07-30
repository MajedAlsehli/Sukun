"use client";

/**
 * Task 3 · Step 7 — the APPROVED minimal logout affordance.
 *
 * The problem it closes: before Task 3 the ONLY caller of
 * `AuthContext#signOut` in the whole app was `DemoRoleSwitcher`, which returns
 * `null` when `DEMO_MODE` is false. So a real signed-in user had no way to sign
 * out — recorded at the end of Task 2 as a blocker needing an approved UI
 * decision.
 *
 * Why THIS is the smallest possible change:
 *
 *  * it is the exact mirror of the Demo Role Switcher — same fixed position
 *    (`bottom: 16, insetInlineStart: 16`), same `z-index`, same pill radius,
 *    padding, shadow, font size and weight, same open-panel card language —
 *    so the two modes are visually symmetric and nothing new was designed;
 *  * it mounts in the one place the switcher already mounts
 *    (`app/layout.tsx`), so no screen file changes and no screen gains a
 *    control of its own;
 *  * the two are mutually exclusive by construction: this renders ONLY when
 *    `DEMO_MODE` is false, the switcher ONLY when it is true. The Demo Role
 *    Switcher is never exposed in real mode, and this is never exposed in the
 *    Showcase — so all 52 baseline captures are untouched;
 *  * it renders nothing at all for a guest, so the public landing, login,
 *    signup and reset-password screens are unaffected.
 *
 * It calls the canonical flow only: `AuthContext#signOut`, which issues the
 * real `POST /api/auth/logout` (cookie-authenticated, so it succeeds even with
 * an expired access token), then clears the in-memory access token and the
 * session state. It performs no navigation of its own — `RouteGuard` already
 * redirects a guest off a protected route, which is the behaviour Task 2
 * verified.
 */

import { useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { labelForRole, type AppRole } from "@/lib/auth/roles";

export function SessionMenu() {
  const { isHydrated, user, sessionRole, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Demo Mode keeps the Demo Role Switcher and nothing else; a guest has no
  // session to end.
  if (DEMO_MODE || !isHydrated || sessionRole === "guest") return null;

  // `data-sk-session-menu` is the hook the bottom-stacking block in globals.css
  // uses to lift this badge clear of the homeowner bottom nav and of a screen's
  // own CTA bar on a phone — on an iPhone it sat directly on top of both. The
  // desktop position is untouched.
  return (
    <div data-sk-session-menu style={{ position: "fixed", bottom: "16px", insetInlineStart: "16px", zIndex: 200 }}>
      {open && (
        <div
          style={{
            marginBottom: "8px",
            background: "var(--n-surface)",
            border: "1px solid var(--n-border-strong)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--sh-4)",
            padding: "12px",
            width: "220px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--t-secondary)", marginBottom: "8px" }}>
            {user?.name ?? labelForRole(sessionRole as AppRole)}
          </div>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
                setOpen(false);
              }
            }}
            disabled={busy}
            style={{
              width: "100%",
              textAlign: "start",
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--n-border-strong)",
              background: "transparent",
              color: "var(--err)",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="حساب المستخدم"
        style={{
          fontSize: "12.5px",
          fontWeight: 700,
          color: "var(--t-on-dark)",
          background: "var(--g-900)",
          border: "none",
          borderRadius: "var(--r-full)",
          padding: "10px 16px",
          boxShadow: "var(--sh-3)",
          cursor: "pointer",
        }}
      >
        {labelForRole(sessionRole as AppRole)}
      </button>
    </div>
  );
}
