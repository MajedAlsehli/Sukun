/**
 * Guards the role split in the persistent bottom nav.
 *
 * What actually broke — and what this exists to stop coming back — is that a
 * Home Seeker was given an OWNER's four tabs. Three of them (`/home`,
 * `/reports`, `/warranty`) are `HOMEOWNER_ACTIVE_ONLY`, so `RouteGuard`
 * bounced the tap straight back to `/discovery` and the seeker was returned to
 * where they started with nothing shown and nothing explained.
 *
 * The invariant is therefore not "the bar has five items" (a label or an icon
 * may well change) but "every destination in a role's bar is a destination
 * that role is allowed to open" — checked against the same `ROUTE_ACCESS`
 * table `RouteGuard` enforces, so the two cannot drift apart.
 */

import { describe, expect, it } from "vitest";
import { OWNER_ITEMS, SEEKER_ITEMS } from "./HomeownerNav";
import { isRouteAllowedForRole } from "@/lib/auth/routeRoles";
import { SCREEN_PATHS } from "@/lib/nav/routes";

/** A tab's route, with the `#fragment` the Route Table does not model. */
function routeOf(href: string): string {
  return href.split("#")[0];
}

describe("the Home Seeker's bottom navigation", () => {
  it("sends every tab to a route a seeker is allowed to open", () => {
    for (const item of SEEKER_ITEMS) {
      expect(
        isRouteAllowedForRole(routeOf(item.href), "homeowner_prospect"),
        `"${item.label}" -> ${item.href} is out-of-role for a seeker`,
      ).toBe(true);
    }
  });

  it("offers no owner destination", () => {
    // The three the brief named, by the constant rather than a typed string.
    const ownerOnly = [
      SCREEN_PATHS.H7_MyHome,
      SCREEN_PATHS.H9_MyReports,
      SCREEN_PATHS.H10_WarrantyCenter,
    ];
    const seekerRoutes = SEEKER_ITEMS.map((i) => routeOf(i.href));
    for (const route of ownerOnly) {
      expect(seekerRoutes, `a seeker must not be offered ${route}`).not.toContain(route);
    }
  });

  it("adds no route — every tab is a screen that already exists", () => {
    // A fragment is in-screen state, not a route: `/discovery` is the only
    // path a seeker's bar points at, and it is the seeker's own landing route.
    for (const item of SEEKER_ITEMS) {
      expect(routeOf(item.href)).toBe(SCREEN_PATHS.H3_Discovery);
    }
  });

  it("gives each tab a distinct destination", () => {
    const hrefs = SEEKER_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("the owner's bottom navigation", () => {
  it("still lists exactly the four screens 02_Navigation_Map.md §2 specifies", () => {
    expect(OWNER_ITEMS.map((i) => i.href)).toEqual([
      SCREEN_PATHS.H7_MyHome,
      SCREEN_PATHS.H9_MyReports,
      SCREEN_PATHS.H10_WarrantyCenter,
      SCREEN_PATHS.H3_Discovery,
    ]);
  });

  it("sends every tab to a route an active homeowner is allowed to open", () => {
    for (const item of OWNER_ITEMS) {
      expect(
        isRouteAllowedForRole(routeOf(item.href), "homeowner_active"),
        `"${item.label}" -> ${item.href} is out-of-role for an owner`,
      ).toBe(true);
    }
  });
});
