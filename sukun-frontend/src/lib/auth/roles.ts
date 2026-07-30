/**
 * The frontend's role model (18_Frontend_Navigation_Integration.md line 7,
 * 02_Navigation_Map.md). Deliberately richer than the backend's own 5-value
 * `UserRole` enum (src/users/user.types.ts): the homeowner lifecycle splits
 * into three states here (prospect / pending / active) because that's a
 * unit-assignment + activation distinction, not a distinct backend role —
 * a `HOMEOWNER` row's unit/activation state has to be derived, never sent
 * as a role string.
 */

import type { UserRole as BackendRole, PublicUser } from "@/lib/api";

export type AppRole =
  | "homeowner_prospect"
  | "homeowner_pending"
  | "homeowner_active"
  | "technician"
  | "pm"
  | "company";

/** `"guest"` = no session at all. Every other value is an `AppRole`. */
export type SessionRole = "guest" | AppRole;

/**
 * `HOMEOWNER` → pending/active depends on unit-activation state, which no
 * running endpoint currently exposes (Task 011 Homeowner Activation is
 * unbuilt — see project-memory/01_Project_Status.md). Until H6's real
 * `POST /auth/verify-ownership` success path exists (Frontend Integration
 * Order step 8), a fresh `HOMEOWNER` session defaults to `homeowner_pending`
 * — the safer default, since it gates access to H7-H10 (`homeowner_active`
 * only) rather than granting it early. `AuthContext`'s `markHomeownerActivated`
 * is the only way to flip this client-side today.
 */
export function resolveAppRole(role: BackendRole, homeownerActivated: boolean): AppRole {
  switch (role) {
    case "HOME_SEEKER":
      return "homeowner_prospect";
    case "HOMEOWNER":
      return homeownerActivated ? "homeowner_active" : "homeowner_pending";
    case "TECHNICIAN":
      return "technician";
    case "PROJECT_MANAGER":
      return "pm";
    case "COMPANY":
      return "company";
  }
}

/** Every AppRole a given screen's Route Table row accepts (18_ § Route Table). */
export type ScreenRoles = readonly AppRole[];

export const HOMEOWNER_PROSPECT_OR_ACTIVE: ScreenRoles = ["homeowner_prospect", "homeowner_active"];
export const HOMEOWNER_ACTIVE_ONLY: ScreenRoles = ["homeowner_active"];
export const HOMEOWNER_PENDING_ONLY: ScreenRoles = ["homeowner_pending"];
export const TECHNICIAN_ONLY: ScreenRoles = ["technician"];
export const PM_ONLY: ScreenRoles = ["pm"];
export const COMPANY_ONLY: ScreenRoles = ["company"];
export const PM_OR_COMPANY: ScreenRoles = ["pm", "company"];

/** Every `AppRole` a demo session can pick, in nav-graph order (02_Navigation_Map.md). */
export const ALL_APP_ROLES: readonly AppRole[] = [
  "homeowner_prospect",
  "homeowner_pending",
  "homeowner_active",
  "technician",
  "pm",
  "company",
];

/**
 * The inverse of `resolveAppRole` — which backend `UserRole` + activation
 * state a demo session should present as, for a chosen `AppRole`. Demo-only;
 * no real login ever calls this (real sessions get their role from the
 * backend's own response body).
 */
export function backendRoleForAppRole(role: AppRole): { backendRole: BackendRole; homeownerActivated: boolean } {
  switch (role) {
    case "homeowner_prospect":
      return { backendRole: "HOME_SEEKER", homeownerActivated: false };
    case "homeowner_pending":
      return { backendRole: "HOMEOWNER", homeownerActivated: false };
    case "homeowner_active":
      return { backendRole: "HOMEOWNER", homeownerActivated: true };
    case "technician":
      return { backendRole: "TECHNICIAN", homeownerActivated: false };
    case "pm":
      return { backendRole: "PROJECT_MANAGER", homeownerActivated: false };
    case "company":
      return { backendRole: "COMPANY", homeownerActivated: false };
  }
}

/** Every landing route a session's own role redirects to once its screen exists — 02_Navigation_Map.md §2-5. */
export function labelForRole(role: AppRole): string {
  switch (role) {
    case "homeowner_prospect":
      return "باحث عن منزل";
    case "homeowner_pending":
      return "مالك بانتظار التفعيل";
    case "homeowner_active":
      return "مالك";
    case "technician":
      return "فني";
    case "pm":
      return "مدير مشروع";
    case "company":
      return "شركة عقارية";
  }
}

export type { PublicUser };
