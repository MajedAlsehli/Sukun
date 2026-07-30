"use client";

/**
 * Demo Mode's entry point (user instruction, 2026-07-27): lets any role's
 * dashboards/screens be entered without a reachable backend, without
 * touching the real auth system — picking a role here calls
 * `AuthContext#enterDemoRole`, which stores a synthetic session the same
 * way a real login stores a real one (see `api.ts#storeDemoSession`).
 * `RouteGuard` needed no changes for this: it only ever reads `sessionRole`,
 * and a demo session produces one exactly like a real session would.
 *
 * Picking a role also navigates to that role's landing screen. Storing the
 * session alone left the demo stranded on whatever page the switcher was
 * opened from (usually `/`), which reads as "nothing happened" — the role
 * was live but invisible. `enterDemoRole` sets `AuthContext`'s state
 * synchronously, so the destination's own `RouteGuard` already sees the new
 * `sessionRole` on its first effect and never bounces the push.
 *
 * Renders nothing outside Demo Mode (`lib/demo/config.ts#DEMO_MODE`) — the
 * single flag this whole feature is gated behind.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { ALL_APP_ROLES, labelForRole, type AppRole } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";

/**
 * Each demo role's landing screen — the same Route Table row that role is
 * allowed to see (`roles.ts`'s `*_ONLY`/`HOMEOWNER_*` sets), so a push here
 * can never land on a screen the just-stored session is out-of-role for.
 */
const LANDING_PATH: Record<AppRole, string> = {
  homeowner_prospect: SCREEN_PATHS.H3_Discovery,
  homeowner_pending: SCREEN_PATHS.H6_OwnerOnboarding,
  homeowner_active: SCREEN_PATHS.H7_MyHome,
  technician: SCREEN_PATHS.C1_ContractorTasks,
  pm: SCREEN_PATHS.PM1_OperationsCenter,
  company: SCREEN_PATHS.RE1_CompanyDashboard,
};

export function DemoRoleSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { isHydrated, isDemoSession, sessionRole, enterDemoRole, signOut } = useAuth();

  function selectRole(role: AppRole) {
    enterDemoRole(role);
    setOpen(false);
    router.push(LANDING_PATH[role]);
  }

  if (!DEMO_MODE || !isHydrated) return null;

  return (
    <div style={{ position: "fixed", bottom: "16px", insetInlineStart: "16px", zIndex: 200 }}>
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
            وضع العرض التجريبي — اختر دوراً
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {ALL_APP_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => selectRole(role as AppRole)}
                style={{
                  textAlign: "start",
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "8px 10px",
                  borderRadius: "var(--r-md)",
                  border: "none",
                  cursor: "pointer",
                  color: sessionRole === role ? "var(--t-on-dark)" : "var(--t-primary)",
                  background: sessionRole === role ? "var(--g-900)" : "var(--n-surface2)",
                }}
              >
                {labelForRole(role as AppRole)}
              </button>
            ))}
            {isDemoSession && (
              <button
                onClick={() => void signOut()}
                style={{
                  textAlign: "start",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  padding: "8px 10px",
                  marginTop: "4px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--n-border-strong)",
                  cursor: "pointer",
                  color: "var(--err)",
                  background: "transparent",
                }}
              >
                إنهاء الجلسة التجريبية
              </button>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: "12.5px",
          fontWeight: 700,
          color: "var(--t-on-dark)",
          background: "var(--a-500)",
          border: "none",
          borderRadius: "var(--r-full)",
          padding: "10px 16px",
          boxShadow: "var(--sh-3)",
          cursor: "pointer",
        }}
      >
        {isDemoSession ? `عرض تجريبي: ${labelForRole(sessionRole as AppRole)}` : "وضع العرض التجريبي"}
      </button>
    </div>
  );
}
