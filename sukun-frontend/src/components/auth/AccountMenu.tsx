"use client";

/**
 * The account menu, hosted IN A SCREEN'S HEADER.
 *
 * Why it exists: on a real iPhone the floating `SessionMenu` pill sat over the
 * page. It covered buttons, overlapped the bottom navigation, landed on top of
 * filters and booking controls, was tapped by accident constantly, and once
 * open the panel could not reliably be dismissed — people were logging out
 * just to close it. On mobile that floating badge is now hidden (see
 * `globals.css`) and this takes its place in the header, where an account
 * control belongs.
 *
 * It is the SAME session surface, not a new one: the same `AuthContext#signOut`,
 * the same role label, the same panel language. Nothing was invented — this
 * product has no settings screen and no theme switch, so the menu offers the
 * one action that genuinely exists (sign out) plus the identity it applies to.
 * Adding a "Settings" row that leads nowhere would be exactly the dishonest
 * affordance the brief rules out.
 *
 * Dismissal, all five paths:
 *   • tapping outside the menu
 *   • tapping the trigger again
 *   • Escape
 *   • choosing an action
 *   • navigating to another route
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DEMO_MODE } from "@/lib/demo/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { labelForRole, type AppRole } from "@/lib/auth/roles";

/** iOS Human Interface minimum. Applied to both the trigger and each row. */
const TAP_TARGET = 44;

export function AccountMenu({
  /** `"header"` shows the user's name; `"compact"` shows the role label only. */
  variant = "header",
}: {
  variant?: "header" | "compact";
} = {}) {
  const { isHydrated, user, sessionRole, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Route change closes it — otherwise a menu opened on /discovery is still
  // open, and still covering things, after navigating to /visits.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    // `pointerdown` rather than `click`: on iOS Safari a `click` listener added
    // during the same gesture that opened the menu can fire immediately and
    // close it again, which is how "the menu will not stay open / will not
    // close" is usually reported.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // Demo Mode keeps the Demo Role Switcher; a guest has no session to end.
  if (DEMO_MODE || !isHydrated || sessionRole === "guest") return null;

  const roleLabel = labelForRole(sessionRole as AppRole);
  const triggerLabel = variant === "header" ? (user?.name ?? roleLabel) : roleLabel;

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`حساب المستخدم: ${triggerLabel}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: TAP_TARGET,
          minWidth: TAP_TARGET,
          padding: "8px 12px",
          borderRadius: "var(--r-full)",
          border: "1px solid var(--n-border)",
          background: open ? "var(--n-surface2)" : "var(--n-surface)",
          color: "var(--t-primary)",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 190,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--g-900)",
            color: "var(--t-on-dark)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flex: "none",
          }}
        >
          {triggerLabel.trim().charAt(0)}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerLabel}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            insetInlineEnd: 0,
            zIndex: 210,
            minWidth: 220,
            background: "var(--n-surface)",
            border: "1px solid var(--n-border-strong)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--sh-4)",
            padding: 12,
          }}
        >
          <div style={{ padding: "2px 4px 10px", borderBottom: "1px solid var(--n-border)", marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{user?.name ?? roleLabel}</div>
            <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginTop: 2 }}>{roleLabel}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
                close();
              }
            }}
            disabled={busy}
            style={{
              width: "100%",
              minHeight: TAP_TARGET,
              textAlign: "start",
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 12px",
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
    </div>
  );
}
