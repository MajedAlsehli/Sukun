/**
 * The mock-data requirement, asserted rather than assumed.
 *
 * Demo Mode is the Showcase. After Task 2 wired six real Backend domains it has
 * to keep working EXACTLY as it did — so this file checks the things a careless
 * integration would quietly break: a deleted fixture, a renamed export, a
 * rewritten seed value, a fixture that leaked into real mode, or an `ai/client`
 * that stopped resolving to the mock.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/* ------------------------------------------------------- nothing was lost */

describe("no fixture was deleted, renamed, moved or rewritten", () => {
  it("every Demo Mode module is still present with its original exports", async () => {
    const fixtures = await import("./discoveryFixtures");
    const demo = await import("./fixtures");
    const mockFetch = await import("./mockFetch");
    const config = await import("./config");

    for (const name of [
      "PROJECTS", "findProject", "money", "DEFAULT_PREFS", "scoreOf", "reasonsFor",
      "ranked", "loadPrefs", "savePrefs", "loadActivity", "saveActivity",
      "markViewed", "toggleFav", "addBooking", "removeBooking",
    ]) {
      expect(fixtures).toHaveProperty(name);
    }
    expect(demo).toHaveProperty("demoUserFor");
    expect(mockFetch).toHaveProperty("withDemoFallback");
    expect(config).toHaveProperty("DEMO_MODE");
  });

  it("the six seed projects still hold their original values", async () => {
    const { PROJECTS } = await import("./discoveryFixtures");
    expect(PROJECTS).toHaveLength(6);
    expect(PROJECTS[0]).toMatchObject({
      id: 1,
      name: "واحة الياسمين",
      dev: "شركة معمار",
      city: "الرياض",
      district: "حي النرجس",
      price: 2400000,
      area: 420,
      beds: 5,
      baths: 4,
      avail: "جاهز",
      type: "فيلا",
      img: "/projects/p1-cover.jpg",
      emi: "8,900 ر.س",
    });
    expect(PROJECTS.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
    // Every project still points at real photography in `public/projects/`.
    for (const p of PROJECTS) {
      expect(p.img).toMatch(/^\/projects\//);
      expect(p.gallery.length).toBeGreaterThan(0);
    }
  });

  it("the in-screen seed arrays every domain screen ships are still there", () => {
    const checks: Array<[string, string[]]> = [
      ["components/homeowner/MyReportsScreen.tsx", ["const SEED: SeedReport[]", "const MASTER =", "const priMap"]],
      ["components/homeowner/MyHomeScreen.tsx", ["const UNIT =", "const WARRANTY =", "const TIMELINE ="]],
      ["components/homeowner/WarrantyCenterScreen.tsx", ["const COVERAGE:", "const INFO:", "const FAQ:"]],
      ["components/homeowner/OwnerOnboardingScreen.tsx", ["const HELP_CARDS", "const UNIT_ROWS", "const CARDS", "const RESULTS"]],
      ["components/homeowner/ProjectDetailsScreen.tsx", ["const GALLERY", "const AMENITIES", "const TIMELINE", "const DEV", "const FAQ"]],
      // `WIZ_QUESTIONS` and `FINANCE_OPTS` were removed DELIBERATELY (user
      // instruction, 2026-07-31): the advisor questionnaire now asks the city
      // and the number of family members and nothing else, so the five-question
      // wizard step and the financing question no longer exist. `CITY_OPTS` and
      // `FAMILY_OPTS` are the two seeds that remain, and they are still pinned.
      ["components/homeowner/DiscoveryScreen.tsx", ["const CITY_OPTS", "const FAMILY_OPTS"]],
      ["lib/ai/mock.ts", ["DEFECT_LIBRARY"]],
      ["components/demo/DemoRoleSwitcher.tsx", ["export function DemoRoleSwitcher"]],
    ];
    for (const [file, needles] of checks) {
      const source = read(file);
      for (const needle of needles) {
        expect(source, `${file} lost ${needle}`).toContain(needle);
      }
    }
  });

  it("the Demo Role Switcher and the legacy storage helpers are still exported", async () => {
    const api = await import("@/lib/api");
    for (const name of [
      "storeDemoSession", "isDemoSessionStored", "storeHomeownerActivated",
      "storeOwnerIntent", "storePendingJourney", "clearTokens", "clearUser",
    ]) {
      expect(api).toHaveProperty(name);
    }
  });
});

/* ------------------------------------------- the boundary is still closed */

describe("no Task 2 domain routes through withDemoFallback", () => {
  it("the fixture-substitution helper still has exactly the two Company call sites", () => {
    const callers: string[] = [];
    const files = [
      "components/company/CompanyDashboardScreen.tsx",
      "components/company/ProjectsManagementScreen.tsx",
      "components/homeowner/DiscoveryScreen.tsx",
      "components/homeowner/ProjectDetailsScreen.tsx",
      "components/homeowner/VisitExperienceScreen.tsx",
      "components/homeowner/OwnerOnboardingScreen.tsx",
      "components/homeowner/MyHomeScreen.tsx",
      "components/homeowner/MyReportsScreen.tsx",
      "components/homeowner/ReportJourneyScreen.tsx",
      "components/homeowner/WarrantyCenterScreen.tsx",
      "lib/hooks/useDiscovery.ts",
      "lib/hooks/useVisits.ts",
      "lib/hooks/useMyHome.ts",
      "lib/hooks/useReports.ts",
      "lib/hooks/useActivation.ts",
      "lib/hooks/useReportJourney.ts",
      "lib/ai/live.ts",
    ];
    for (const file of files) {
      if (read(file).includes("withDemoFallback")) callers.push(file);
    }
    // Task 2 added none. The two Company screens are Task 3's problem.
    expect(callers).toEqual([
      "components/company/CompanyDashboardScreen.tsx",
      "components/company/ProjectsManagementScreen.tsx",
    ]);
  });

  it("no Task 2 domain module, adapter or hook imports a fixture module", () => {
    const offenders: string[] = [];
    const files = [
      "lib/backend/discovery.ts", "lib/backend/visits.ts", "lib/backend/homeowners.ts",
      "lib/backend/warranty.ts", "lib/backend/reports.ts",
      "lib/adapters/visits.ts", "lib/adapters/homeowner.ts",
      "lib/adapters/warranty.ts", "lib/adapters/reports.ts",
      "lib/hooks/useVisits.ts", "lib/hooks/useMyHome.ts", "lib/hooks/useReports.ts",
      "lib/hooks/useActivation.ts", "lib/hooks/useReportJourney.ts",
    ];
    for (const file of files) {
      if (/from ["']@\/lib\/demo\/(discoveryFixtures|fixtures|projectsFixtures)["']/.test(read(file))) {
        offenders.push(file);
      }
    }
    // `lib/adapters/discovery.ts` and `lib/hooks/useDiscovery.ts` are the two
    // deliberate exceptions: they reuse the fixtures module's OWN scoring
    // (`scoreOf`/`reasonsFor`) so a demo project and a real project are ranked
    // by one implementation rather than two that can drift.
    expect(offenders).toEqual([]);
  });

  it("no visual component calls fetch directly or validates a DTO itself", () => {
    const screens = [
      "components/homeowner/DiscoveryScreen.tsx",
      "components/homeowner/ProjectDetailsScreen.tsx",
      "components/homeowner/VisitExperienceScreen.tsx",
      "components/homeowner/OwnerOnboardingScreen.tsx",
      "components/homeowner/MyHomeScreen.tsx",
      "components/homeowner/MyReportsScreen.tsx",
      "components/homeowner/ReportJourneyScreen.tsx",
      "components/homeowner/WarrantyCenterScreen.tsx",
    ];
    for (const file of screens) {
      const source = read(file);
      expect(source, `${file} calls fetch directly`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} validates a DTO`).not.toContain("assertSessionDto");
    }
  });
});

/* ----------------------------------------------------- the AI client swap */

describe("the AI client is a MODE swap, not a replacement", () => {
  it("Demo Mode resolves to the untouched mock", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.resetModules();
    const { sukunAi } = await import("@/lib/ai/client");
    const { mockAi } = await import("@/lib/ai/mock");
    expect(sukunAi).toBe(mockAi);
    vi.resetModules();
  });

  it("real mode resolves to the live implementation", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    const { sukunAi } = await import("@/lib/ai/client");
    const { liveAi } = await import("@/lib/ai/live");
    expect(sukunAi).toBe(liveAi);
    vi.resetModules();
  });

  // The mock deliberately simulates inference latency (~2.5s per call), which
  // is part of what makes the Showcase's analysing screen feel real. Two calls
  // exceed the 5s default, so this one test gets the room it needs rather than
  // the mock being sped up to suit a test.
  it("the mock still answers without any network", { timeout: 20_000 }, async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { mockAi } = await import("@/lib/ai/mock");
    // The mock's own `AI_NO_IMAGE` precondition is preserved too — it still
    // requires a photo, exactly as before Task 2.
    await expect(mockAi.analyzeDefect({ images: [] })).rejects.toThrow("AI_NO_IMAGE");
    const result = await mockAi.analyzeDefect({
      images: [new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" })],
    });
    expect(result.source).toBe("mock");
    expect(result.summary).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.resetModules();
  });
});

/* ------------------------------------------------------------ the routes */

describe("the frozen route surface is unchanged", () => {
  it("SCREEN_PATHS still declares every approved path", async () => {
    const { SCREEN_PATHS } = await import("@/lib/nav/routes");
    expect(SCREEN_PATHS.H3_Discovery).toBe("/discovery");
    expect(SCREEN_PATHS.H4_ProjectDetails("1")).toBe("/discovery/1");
    expect(SCREEN_PATHS.H5_VisitExperience("v")).toBe("/visits/v");
    expect(SCREEN_PATHS.H6_OwnerOnboarding).toBe("/activate");
    expect(SCREEN_PATHS.H7_MyHome).toBe("/home");
    expect(SCREEN_PATHS.H8_ReportJourney).toBe("/reports/new");
    expect(SCREEN_PATHS.H9_MyReports).toBe("/reports");
    expect(SCREEN_PATHS.H9_MyReportDetail("r")).toBe("/reports/r");
    expect(SCREEN_PATHS.H10_WarrantyCenter).toBe("/warranty");
  });
});
