"use client";

/**
 * The confirmation step every state-changing action needs before it runs.
 *
 * The audit found deactivation, archiving and reopen acting on the first tap
 * with nothing in between — on a phone, where the control sits next to others
 * and mis-taps are routine, that is a real hazard. Each of these is reversible
 * in principle but visible to other roles immediately, and "تعطيل الحساب" next
 * to "تعديل البيانات" is exactly the pair a thumb confuses.
 *
 * It is deliberately NOT a redesign: the panel reuses the same overlay,
 * surface, radius, shadow and button language the screens already use for
 * their own sheets, and it appears only when a destructive action is invoked.
 * Nothing about the underlying control's appearance changes.
 *
 * Cancelling resolves `false` and the caller does nothing — no request, no
 * optimistic update, no state change.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmRequest {
  title: string;
  body: string;
  /** The destructive action's own label, e.g. "تعطيل الحساب". */
  confirmLabel: string;
  cancelLabel?: string;
  /** `true` tints the confirm control with the error colour. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

/**
 * `const [confirm, confirmDialog] = useConfirm()`.
 *
 * `await confirm({...})` resolves `true` only when the person explicitly
 * confirmed. Render `confirmDialog` anywhere in the screen.
 */
export function useConfirm(): [(req: ConfirmRequest) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...req, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      setPending((current) => {
        current?.resolve(ok);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    // Focus lands on the confirm control so the dialog is operable by keyboard
    // the moment it opens, and Escape always cancels.
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  const dialog = pending ? (
    <div
      onClick={() => settle(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(var(--g-900-rgb), .45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        role="alertdialog"
        aria-modal="true"
        aria-label={pending.title}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--n-surface)",
          border: "1px solid var(--n-border)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--sh-4)",
          padding: 26,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{pending.title}</div>
        <p style={{ fontSize: 13.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: "0 0 22px" }}>
          {pending.body}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={confirmRef}
            onClick={() => settle(true)}
            style={{
              flex: 1,
              minHeight: 44,
              fontSize: 14,
              fontWeight: 600,
              padding: "12px 18px",
              border: "none",
              borderRadius: "var(--r-md)",
              background: pending.destructive ? "var(--err)" : "var(--g-900)",
              color: "var(--t-on-dark)",
              cursor: "pointer",
            }}
          >
            {pending.confirmLabel}
          </button>
          <button
            onClick={() => settle(false)}
            style={{
              flex: 1,
              minHeight: 44,
              fontSize: 14,
              fontWeight: 600,
              padding: "12px 18px",
              border: "1.5px solid var(--n-border-strong)",
              borderRadius: "var(--r-md)",
              background: "transparent",
              color: "var(--t-secondary)",
              cursor: "pointer",
            }}
          >
            {pending.cancelLabel ?? "إلغاء"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}
