/**
 * Role -> route mapping for the frozen Next.js route table.
 *
 * Two separate concerns live here, both derived from files that already exist:
 *
 *  1. `DEFAULT_ROUTE_FOR_ROLE` — where a session lands after login/registration
 *     or a silent restore. It maps this app's `AppRole` onto `SCREEN_PATHS`.
 *     It deliberately does NOT use the Backend's own `landingRoute` field:
 *     `sakn-backend/src/auth/accountState.ts#LANDING_ROUTES` mirrors the *Vite*
 *     frontend's paths (`/discover`, `/technician/tasks`), which do not exist in
 *     this App Router tree. Same six roles, different URL contract — mapping
 *     here is what keeps the frozen routes frozen.
 *
 *  2. `ROUTE_ACCESS` — a declarative mirror of the `<RouteGuard allow={...}>`
 *     prop each screen already passes. It adds no enforcement of its own
 *     (`components/auth/RouteGuard.tsx` remains the single enforcement point and
 *     is unchanged); it exists so route/role coverage is testable and
 *     documentable without reading twenty component files.
 */

import {
  COMPANY_ONLY,
  HOMEOWNER_ACTIVE_ONLY,
  HOMEOWNER_PENDING_ONLY,
  HOMEOWNER_PROSPECT_OR_ACTIVE,
  PM_ONLY,
  PM_OR_COMPANY,
  TECHNICIAN_ONLY,
  type AppRole,
  type ScreenRoles,
} from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";

/**
 * The six post-authentication destinations, exactly as the Task 1 role-mapping
 * requirement states them:
 *
 *   prospect / home seeker -> /discovery
 *   pending homeowner      -> /activate
 *   active homeowner       -> /home
 *   technician             -> /contractor
 *   project manager        -> /pm
 *   company                -> /company
 *
 * These are the same six destinations `components/demo/DemoRoleSwitcher.tsx`
 * already pushes to, so a real session and a demo session land identically.
 */
export const DEFAULT_ROUTE_FOR_ROLE: Record<AppRole, string> = {
  homeowner_prospect: SCREEN_PATHS.H3_Discovery,
  homeowner_pending: SCREEN_PATHS.H6_OwnerOnboarding,
  homeowner_active: SCREEN_PATHS.H7_MyHome,
  technician: SCREEN_PATHS.C1_ContractorTasks,
  pm: SCREEN_PATHS.PM1_OperationsCenter,
  company: SCREEN_PATHS.RE1_CompanyDashboard,
};

export function defaultRouteForRole(role: AppRole): string {
  return DEFAULT_ROUTE_FOR_ROLE[role];
}

/** Route patterns that render with no `RouteGuard` at all — reachable signed out. */
export const PUBLIC_ROUTES: readonly string[] = [
  SCREEN_PATHS.H1_Landing,
  SCREEN_PATHS.H2_Login,
  SCREEN_PATHS.H2_Signup,
  SCREEN_PATHS.H2_ResetPassword,
];

/**
 * Every guarded App Router path pattern and the `AppRole`s its own `RouteGuard`
 * admits. Dynamic segments are written in Next.js bracket form so this table
 * can be compared against the file tree.
 */
export const ROUTE_ACCESS: Readonly<Record<string, ScreenRoles>> = {
  // Homeowner — discovery & visits
  [SCREEN_PATHS.H3_Discovery]: HOMEOWNER_PROSPECT_OR_ACTIVE,
  "/discovery/[projectId]": HOMEOWNER_PROSPECT_OR_ACTIVE,
  "/visits/[visitId]": HOMEOWNER_PROSPECT_OR_ACTIVE,

  // Homeowner — activation & home
  [SCREEN_PATHS.H6_OwnerOnboarding]: HOMEOWNER_PENDING_ONLY,
  [SCREEN_PATHS.H7_MyHome]: HOMEOWNER_ACTIVE_ONLY,
  [SCREEN_PATHS.H8_ReportJourney]: HOMEOWNER_ACTIVE_ONLY,
  [SCREEN_PATHS.H9_MyReports]: HOMEOWNER_ACTIVE_ONLY,
  "/reports/[reportId]": HOMEOWNER_ACTIVE_ONLY,
  [SCREEN_PATHS.H10_WarrantyCenter]: HOMEOWNER_ACTIVE_ONLY,

  // Technician
  [SCREEN_PATHS.C1_ContractorTasks]: TECHNICIAN_ONLY,
  [SCREEN_PATHS.C3_RepairHistory]: TECHNICIAN_ONLY,

  // Project manager
  [SCREEN_PATHS.PM1_OperationsCenter]: PM_ONLY,
  [SCREEN_PATHS.PM3_ContractorPerformance]: PM_ONLY,

  // Shared canonical report screen
  "/report-monitor/[reportId]": PM_OR_COMPANY,

  // Company
  [SCREEN_PATHS.RE1_CompanyDashboard]: COMPANY_ONLY,
  [SCREEN_PATHS.RE2_ProjectsManagement]: COMPANY_ONLY,
  [SCREEN_PATHS.RE2_ProjectsNew]: COMPANY_ONLY,
  "/company/projects/[projectId]": COMPANY_ONLY,
  [SCREEN_PATHS.RE4_HomeownersManagement]: COMPANY_ONLY,
  [SCREEN_PATHS.RE5_TechniciansManagement]: COMPANY_ONLY,
};

/**
 * Mirrors `RouteGuard`'s own decision for a given route pattern, for tests and
 * documentation. `guest` is never allowed on a guarded route; an unknown
 * (unguarded) route passes through, exactly as `RouteGuard` does by not being
 * mounted there at all.
 */
export function isRouteAllowedForRole(routePattern: string, role: AppRole | "guest"): boolean {
  const allow = ROUTE_ACCESS[routePattern];
  if (!allow) return true;
  if (role === "guest") return false;
  return (allow as readonly string[]).includes(role);
}
