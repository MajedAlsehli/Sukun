import { describe, expect, it } from "vitest";
import { ALL_APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import {
  DEFAULT_ROUTE_FOR_ROLE,
  PUBLIC_ROUTES,
  ROUTE_ACCESS,
  defaultRouteForRole,
  isRouteAllowedForRole,
} from "./routeRoles";

describe("the six default routes", () => {
  it("maps every role onto the frozen route it must land on", () => {
    expect(DEFAULT_ROUTE_FOR_ROLE).toEqual({
      homeowner_prospect: "/discovery",
      homeowner_pending: "/activate",
      homeowner_active: "/home",
      technician: "/contractor",
      pm: "/pm",
      company: "/company",
    });
  });

  it("covers all six roles, with no role missing and none invented", () => {
    expect(Object.keys(DEFAULT_ROUTE_FOR_ROLE).sort()).toEqual([...ALL_APP_ROLES].sort());
  });

  it("uses SCREEN_PATHS constants, never a hand-typed string", () => {
    expect(defaultRouteForRole("homeowner_prospect")).toBe(SCREEN_PATHS.H3_Discovery);
    expect(defaultRouteForRole("homeowner_pending")).toBe(SCREEN_PATHS.H6_OwnerOnboarding);
    expect(defaultRouteForRole("homeowner_active")).toBe(SCREEN_PATHS.H7_MyHome);
    expect(defaultRouteForRole("technician")).toBe(SCREEN_PATHS.C1_ContractorTasks);
    expect(defaultRouteForRole("pm")).toBe(SCREEN_PATHS.PM1_OperationsCenter);
    expect(defaultRouteForRole("company")).toBe(SCREEN_PATHS.RE1_CompanyDashboard);
  });

  it("sends every role to a route that role is actually allowed on", () => {
    for (const role of ALL_APP_ROLES) {
      expect(isRouteAllowedForRole(DEFAULT_ROUTE_FOR_ROLE[role], role)).toBe(true);
    }
  });
});

describe("route denial", () => {
  it("denies a guest on every guarded route", () => {
    for (const route of Object.keys(ROUTE_ACCESS)) {
      expect(isRouteAllowedForRole(route, "guest")).toBe(false);
    }
  });

  it("admits nobody outside each route's own allow list", () => {
    const expectations: Array<[string, AppRole[]]> = [
      ["/discovery", ["homeowner_prospect", "homeowner_active"]],
      ["/discovery/[projectId]", ["homeowner_prospect", "homeowner_active"]],
      ["/visits/[visitId]", ["homeowner_prospect", "homeowner_active"]],
      ["/activate", ["homeowner_pending"]],
      ["/home", ["homeowner_active"]],
      ["/reports", ["homeowner_active"]],
      ["/reports/new", ["homeowner_active"]],
      ["/reports/[reportId]", ["homeowner_active"]],
      ["/warranty", ["homeowner_active"]],
      ["/contractor", ["technician"]],
      ["/contractor/history", ["technician"]],
      ["/pm", ["pm"]],
      ["/pm/contractors", ["pm"]],
      ["/report-monitor/[reportId]", ["pm", "company"]],
      ["/company", ["company"]],
      ["/company/projects", ["company"]],
      ["/company/projects/new", ["company"]],
      ["/company/projects/[projectId]", ["company"]],
      ["/company/homeowners", ["company"]],
      ["/company/technicians", ["company"]],
    ];

    for (const [route, allowed] of expectations) {
      for (const role of ALL_APP_ROLES) {
        expect(
          isRouteAllowedForRole(route, role),
          `${role} on ${route}`,
        ).toBe(allowed.includes(role));
      }
    }
  });

  it("denies cross-role access in the specific pairings the product cares about", () => {
    expect(isRouteAllowedForRole("/home", "homeowner_pending")).toBe(false);
    expect(isRouteAllowedForRole("/activate", "homeowner_active")).toBe(false);
    expect(isRouteAllowedForRole("/company", "pm")).toBe(false);
    expect(isRouteAllowedForRole("/pm", "company")).toBe(false);
    expect(isRouteAllowedForRole("/contractor", "homeowner_active")).toBe(false);
    expect(isRouteAllowedForRole("/report-monitor/[reportId]", "technician")).toBe(false);
  });

  it("leaves the public routes ungated for everyone, including guests", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(ROUTE_ACCESS[route]).toBeUndefined();
      expect(isRouteAllowedForRole(route, "guest")).toBe(true);
    }
  });
});

describe("route table coverage", () => {
  it("declares an access rule for every guarded SCREEN_PATHS entry", () => {
    const guardedStaticPaths = [
      SCREEN_PATHS.H3_Discovery,
      SCREEN_PATHS.H6_OwnerOnboarding,
      SCREEN_PATHS.H7_MyHome,
      SCREEN_PATHS.H8_ReportJourney,
      SCREEN_PATHS.H9_MyReports,
      SCREEN_PATHS.H10_WarrantyCenter,
      SCREEN_PATHS.C1_ContractorTasks,
      SCREEN_PATHS.C3_RepairHistory,
      SCREEN_PATHS.PM1_OperationsCenter,
      SCREEN_PATHS.PM3_ContractorPerformance,
      SCREEN_PATHS.RE1_CompanyDashboard,
      SCREEN_PATHS.RE2_ProjectsManagement,
      SCREEN_PATHS.RE2_ProjectsNew,
      SCREEN_PATHS.RE4_HomeownersManagement,
      SCREEN_PATHS.RE5_TechniciansManagement,
    ];
    for (const path of guardedStaticPaths) {
      expect(ROUTE_ACCESS[path], `missing ROUTE_ACCESS rule for ${path}`).toBeDefined();
    }
  });

  it("guards all four dynamic screens", () => {
    for (const pattern of [
      "/discovery/[projectId]",
      "/visits/[visitId]",
      "/reports/[reportId]",
      "/report-monitor/[reportId]",
      "/company/projects/[projectId]",
    ]) {
      expect(ROUTE_ACCESS[pattern], `missing ROUTE_ACCESS rule for ${pattern}`).toBeDefined();
    }
  });
});
