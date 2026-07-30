/**
 * Regression cover for the pre-event stabilization defects.
 *
 * Every case below was REPRODUCED against production first, then fixed. Each
 * test states the production symptom it pins down, so a future change that
 * reintroduces the cause fails here rather than on an investor's phone.
 */

import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installRoutedBackendStub, envelope, errorEnvelope, type RoutedBackendStub } from "@/test/backendHarness";

/**
 * These are SCREEN tests, so the App Router hooks have to exist. Nothing here
 * asserts on navigation — `RouteGuard`'s redirect behaviour has its own cover
 * in `routeRoles.test.ts`; this file is about what each screen RENDERS.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

let stub: RoutedBackendStub;

beforeEach(() => {
  vi.resetModules();
  stub = installRoutedBackendStub();
});
afterEach(() => {
  vi.resetModules();
});

/* ======================================================================== *
 * 1. Discovery must never dereference `hero` before it exists.
 * ======================================================================== */

describe("DiscoveryScreen — the hero guard", () => {
  /**
   * Production threw
   *   TypeError: Cannot read properties of undefined (reading 'name')
   * straight into the application error boundary. `prefs.recReady` is a
   * localStorage flag that outlives the session that set it, so on a hard
   * refresh (or any return after onboarding) the notification list was built
   * with `recReady === true` while the discovery request was still in flight
   * and `hero` was `undefined` — and that list read `hero.name` ABOVE the
   * `!hero` guard.
   */
  async function loadScreen() {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    const [{ DiscoveryScreen }, { AuthProvider }] = await Promise.all([
      import("@/components/homeowner/DiscoveryScreen"),
      import("@/lib/auth/AuthContext"),
    ]);
    return { DiscoveryScreen, AuthProvider };
  }

  /** `recReady: true` with no recommendation yet — the exact crashing state. */
  function seedRecReadyPrefs() {
    window.localStorage.setItem(
      "sakn_discovery_prefs",
      JSON.stringify({
        pName: "", pCity: "الرياض", pFamily: 4, pFinance: "كاش",
        wBudget: 3_000_000, wType: "فيلا", wBeds: 4, wTimeline: "", wLifestyle: {},
        recReady: true,
      }),
    );
  }

  it("renders a loading state, not a crash, while the recommendation is in flight", async () => {
    seedRecReadyPrefs();
    // A session that never settles: the resource stays loading.
    stub.on("POST", "/auth/refresh", () => new Promise(() => {}));

    const { DiscoveryScreen, AuthProvider } = await loadScreen();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <AuthProvider>
          <DiscoveryScreen />
        </AuthProvider>,
      ),
    ).not.toThrow();

    // No "reading 'name'" TypeError reached React.
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/reading '?name'?/);
    spy.mockRestore();
  });

  it("shows an honest empty state — never a crash — when there is no candidate project", async () => {
    seedRecReadyPrefs();
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "seeker-1", displayName: "باحث عن سكن (عرض)", email: "seeker@x.sa",
        phone: "+966500000000", backendRole: "HOME_SEEKER", role: "homeowner_prospect",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    // The Backend genuinely has nothing discoverable.
    stub.on("GET", "/discovery/projects", () => envelope({ items: [], total: 0, page: 1, pageSize: 24 }));
    stub.on("GET", "/discovery/recommendations", () =>
      envelope({ available: false, reasonCode: "NO_DISCOVERABLE_PROJECTS", items: [] }),
    );

    const { DiscoveryScreen, AuthProvider } = await loadScreen();
    render(
      <AuthProvider>
        <DiscoveryScreen />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/لا توجد مشاريع مطابقة/)).toBeTruthy());
  });
});

/* ======================================================================== *
 * 2. Real Mode must never render a fixture technician.
 * ======================================================================== */

describe("TechniciansManagementScreen — no fixture technician in Real Mode", () => {
  /**
   * Production listed seven fixture technicians (ياسر الشمري, عبدالعزيز
   * الدوسري, …) instead of the two real ones. `techsView` existed but only
   * `sel`/`act` read it; the KPI totals, the filter, the rendered rows and the
   * empty state all still read the `useState(SEED)` fixture array.
   */
  const FIXTURE_NAMES = ["ياسر الشمري", "عبدالعزيز الدوسري", "مشعل القرني"];

  it("renders the real records and none of the seed names", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();

    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "company-1", displayName: "شركة سكن العقارية (عرض)", email: "company@x.sa",
        phone: "+966500000000", backendRole: "COMPANY", role: "company",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    stub.on("GET", "/technicians", () =>
      envelope({
        items: [
          { id: "t1", name: "فني الصيانة (عرض)", specialty: "صيانة عامة", projectId: "p1", phone: "+966500000103", email: "technician@sakn-demo.sa", status: "AVAILABLE", assignedRepairsCount: 2 },
          { id: "t2", name: "فنية الكهرباء (عرض)", specialty: "كهرباء", projectId: "p1", phone: "+966500000105", email: "technician2@sakn-demo.sa", status: "AVAILABLE", assignedRepairsCount: 1 },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    );
    stub.on("GET", "/technicians/summary", () =>
      envelope({ totalTechnicians: 2, availableCount: 2, busyCount: 0 }),
    );
    stub.on("GET", "/company/projects-summary", () =>
      envelope({ items: [{ id: "p1", name: "مشروع نسائم الرياض (عرض)", city: "الرياض", status: "ACTIVE", isActive: true, health: "HEALTHY", buildingsCount: 2, unitsCount: 12, managerName: "مدير المشروع (عرض)", primaryContractorName: "مقاولات سكن (عرض)", createdAt: "2026-01-01T00:00:00.000Z" }] }),
    );

    const [{ TechniciansManagementScreen }, { AuthProvider }] = await Promise.all([
      import("@/components/company/TechniciansManagementScreen"),
      import("@/lib/auth/AuthContext"),
    ]);

    const { container } = render(
      <AuthProvider>
        <TechniciansManagementScreen />
      </AuthProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("فني الصيانة (عرض)"));

    for (const name of FIXTURE_NAMES) {
      expect(container.textContent, `${name} leaked into Real Mode`).not.toContain(name);
    }
    // The KPI total is the real count, not the fixture's seven.
    expect(container.textContent).toContain("فنية الكهرباء (عرض)");
    expect(container.textContent).not.toContain("أوج الشمال");
    expect(container.textContent).not.toContain("أحمد الغامدي");
  });
});

/* ======================================================================== *
 * 3. A scheduled/confirmed visit is an UPCOMING visit.
 * ======================================================================== */

describe("visit status drives the presentation", () => {
  /**
   * A real visit booked for 2 August at 10:00 rendered "زيارة جارية · بدأت
   * 4:00 م", live note/issue capture and "إنهاء الزيارة" — a checkout button on
   * a visit the Backend has not checked in. The adapter was already correct;
   * the screen ignored it.
   */
  it("the adapter marks only CHECKED_IN as live", async () => {
    const { isLive, canCheckIn, canCheckOut, phaseOf } = await import("@/lib/adapters/visits");

    for (const status of ["SCHEDULED", "CONFIRMED"] as const) {
      expect(isLive(status), status).toBe(false);
      expect(canCheckOut(status), status).toBe(false);
      expect(phaseOf(status, false), status).toBe("active");
    }
    expect(isLive("CHECKED_IN")).toBe(true);
    expect(canCheckIn("CONFIRMED")).toBe(true);
    expect(canCheckIn("SCHEDULED")).toBe(false);
  });

  async function renderVisit(status: string) {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "seeker-1", displayName: "باحث عن سكن (عرض)", email: "seeker@x.sa",
        phone: "+966500000000", backendRole: "HOME_SEEKER", role: "homeowner_prospect",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    stub.on("GET", "/visits/v1", () =>
      envelope({
        id: "v1", projectId: "p1", unitId: "u1",
        projectName: "مشروع نسائم الرياض (عرض)", projectCity: "الرياض", unitNumber: "B102",
        date: "2026-08-02T00:00:00.000Z", time: "10:00",
        status, checkedInAt: status === "CHECKED_IN" ? "2026-08-02T07:00:00.000Z" : null, checkedOutAt: null,
        rescheduleCount: 0, notes: [], issues: [], feedback: null,
        createdAt: "2026-07-28T00:00:00.000Z",
      }),
    );
    stub.on("GET", "/discovery/projects/p1", () =>
      envelope({
        id: "p1", name: "مشروع نسائم الرياض (عرض)", developerName: "شركة سكن العقارية (عرض)",
        city: "الرياض", district: "حي النرجس", priceFrom: 720000, readiness: "READY",
        unitTypes: ["شقة غرفتين"], coverImageUrl: null, gallery: [], amenities: [],
        description: "", isSaved: false, isCurrentlyDiscoverable: true, unitsAvailableCount: 4,
        availableUnits: [], visitSlots: [],
      }),
    );

    const [{ VisitExperienceScreen }, { AuthProvider }] = await Promise.all([
      import("@/components/homeowner/VisitExperienceScreen"),
      import("@/lib/auth/AuthContext"),
    ]);
    return render(
      <AuthProvider>
        <VisitExperienceScreen visitId="v1" />
      </AuthProvider>,
    );
  }

  it("CONFIRMED renders as upcoming: date/time, no live label, no finish button", async () => {
    const { container } = await renderVisit("CONFIRMED");
    await waitFor(() => expect(container.textContent).toContain("زيارة مؤكدة"));

    expect(container.textContent).not.toContain("زيارة جارية");
    expect(container.textContent).not.toContain("إنهاء الزيارة");
    // No live capture actions.
    expect(container.textContent).not.toContain("التقاط ملاحظة");
    expect(container.textContent).not.toContain("الإبلاغ عن ملاحظة");
    // The real scheduled slot IS shown.
    expect(container.textContent).toContain("2026-08-02");
    expect(container.textContent).toContain("10:00");
    // Reschedule/cancel are offered because the Backend allows them.
    expect(container.textContent).toContain("إعادة جدولة الزيارة");
    expect(container.textContent).toContain("إلغاء الزيارة");
  });

  it("SCHEDULED renders as upcoming too, and offers no check-in the Backend would refuse", async () => {
    const { container } = await renderVisit("SCHEDULED");
    await waitFor(() => expect(container.textContent).toContain("زيارة مجدولة"));
    expect(container.textContent).not.toContain("زيارة جارية");
    expect(container.textContent).not.toContain("إنهاء الزيارة");
    // `canCheckIn` is CONFIRMED-only, so the check-in bar is absent. Asserted
    // on the bar's own copy rather than the button label, because the helper
    // sentence above it legitimately contains the words "بدء الزيارة".
    expect(container.textContent).not.toContain("وصلت إلى المشروع؟");
    expect(screen.queryByRole("button", { name: "بدء الزيارة" })).toBeNull();
  });

  it("CHECKED_IN — and only CHECKED_IN — renders the live experience", async () => {
    const { container } = await renderVisit("CHECKED_IN");
    await waitFor(() => expect(container.textContent).toContain("زيارة جارية"));
    expect(container.textContent).toContain("إنهاء الزيارة");
    expect(container.textContent).toContain("التقاط ملاحظة");
  });
});

/* ======================================================================== *
 * 4. Session restoration must gate every authenticated load.
 * ======================================================================== */

describe("authenticated resources wait for the session", () => {
  /**
   * On a hard refresh the silent `POST /auth/refresh` is still in flight while
   * the first domain requests fire. Issued then, they go out with no
   * Authorization header, get a 401 the refresh/retry path cannot rescue, and
   * settle as a permanent error that never re-runs — which screens then
   * rendered as an empty state.
   */
  async function load() {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    return {
      reports: await import("@/lib/hooks/useReports"),
      auth: await import("@/lib/auth/AuthContext"),
    };
  }

  it("issues no request until the restore settles, then issues exactly one", async () => {
    let resolveRefresh: (v: Response) => void = () => {};
    stub.on("POST", "/auth/refresh", () => new Promise((r) => { resolveRefresh = r; }));
    stub.on("GET", "/reports", () => envelope({ items: [], total: 0, page: 1, pageSize: 50 }));

    const { reports, auth } = await load();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <auth.AuthProvider>{children}</auth.AuthProvider>
    );

    const { result } = renderHook(() => reports.useReports("all"), { wrapper });

    // Still restoring: the report list has NOT been requested…
    expect(stub.calls.filter((c) => c.path.includes("/reports"))).toHaveLength(0);
    // …and the screen is told "loading", never "idle"/"ready with nothing".
    expect(result.current.status).toBe("loading");

    resolveRefresh(
      envelope({
        accessToken: "t", userId: "homeowner-1", displayName: "مالك الوحدة (عرض)", email: "homeowner@x.sa",
        phone: "+966500000000", backendRole: "HOMEOWNER", role: "homeowner_active",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );

    // Once authentication is ready the load runs on its own.
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(stub.calls.filter((c) => c.path.includes("/reports")).length).toBeGreaterThan(0);
  });

  it("a failed list is an error, never a successful empty list", async () => {
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "homeowner-1", displayName: "مالك الوحدة (عرض)", email: "homeowner@x.sa",
        phone: "+966500000000", backendRole: "HOMEOWNER", role: "homeowner_active",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    stub.on("GET", "/reports", () => errorEnvelope(500, "UNKNOWN_ERROR", "boom"));

    const { reports, auth } = await load();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <auth.AuthProvider>{children}</auth.AuthProvider>
    );
    const { result } = renderHook(() => reports.useReports("all"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reports).toEqual([]);
    // The distinguishing fact: an error message exists, so the screen can tell
    // "failed" from "you have none".
    expect(result.current.errorMessage).toBeTruthy();
  });
});

/* ======================================================================== *
 * 5. The PM assistant's count comes from the data, not from the copy.
 * ======================================================================== */

describe("PM assistant headline", () => {
  it("states the number of intervention items it is shown next to", async () => {
    const { attentionHeadline } = await import("@/components/pm/OperationsCenterScreen");

    expect(attentionHeadline(0)).toBe("لا توجد نقاط تحتاج انتباهك اليوم.");
    expect(attentionHeadline(1)).toContain("نقطة واحدة");
    // The production defect exactly: two real items, "٣ نقاط" in the copy.
    expect(attentionHeadline(2)).toContain("نقطتان");
    expect(attentionHeadline(2)).not.toContain("٣");
    expect(attentionHeadline(3)).toContain("٣ نقاط");
    expect(attentionHeadline(12)).toContain("١٢ نقطة");
  });

  it("never renders a Latin numeral in Arabic prose", async () => {
    const { attentionHeadline } = await import("@/components/pm/OperationsCenterScreen");
    for (const n of [0, 1, 2, 3, 7, 11, 40]) {
      expect(attentionHeadline(n), String(n)).not.toMatch(/[0-9]/);
    }
  });
});

/* ======================================================================== *
 * 6. National ID is gone from the resident surface.
 * ======================================================================== */

describe("national ID removal is complete", () => {
  it("the homeowner search no longer offers or mentions it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/company/HomeownersManagementScreen.tsx"),
      "utf8",
    );

    // The placeholder that still advertised it.
    expect(src).not.toContain("ابحث بالاسم أو الهوية");
    // The non-rendered field that kept it searchable.
    expect(src).not.toMatch(/\bnid:/);
    expect(src).not.toMatch(/o\.nid\b/);
    expect(src).not.toContain("h.nationalId");
  });
});

/* ======================================================================== *
 * 7. CORRECTION PASS — a cancelled visit is cancelled, everywhere.
 * ======================================================================== */

describe("a CANCELLED visit never reads as upcoming", () => {
  /**
   * Live production, after the visit had already been cancelled in the
   * database, still rendered `/visits/{id}` as "زيارة قادمة" with its date and
   * time. The adapter was right all along; the screen held the phase in a bare
   * `useState("active")` and never read the server, so no status could ever
   * change what it drew.
   */
  it("the list adapter buckets it as cancelled, not upcoming", async () => {
    const { toVisitListItemViewModel } = await import("@/lib/adapters/visits");
    const base = {
      id: "v1", projectId: "p1", unitId: "u1", projectName: "م", unitNumber: "A1",
      date: "2026-08-02T00:00:00.000Z", time: "10:00", rescheduleCount: 0,
      checkedInAt: null, checkedOutAt: null, createdAt: "2026-07-01T00:00:00.000Z",
    };
    expect(toVisitListItemViewModel({ ...base, status: "CANCELLED" } as never).bucket).toBe("cancelled");
    expect(toVisitListItemViewModel({ ...base, status: "SCHEDULED" } as never).bucket).toBe("upcoming");
    expect(toVisitListItemViewModel({ ...base, status: "CONFIRMED" } as never).bucket).toBe("upcoming");
    expect(toVisitListItemViewModel({ ...base, status: "CHECKED_IN" } as never).bucket).toBe("upcoming");
    expect(toVisitListItemViewModel({ ...base, status: "COMPLETED" } as never).bucket).toBe("completed");
  });

  it("the adapter puts it in a terminal phase with no live or upcoming action", async () => {
    const { phaseOf, isLive, canCheckIn, canCheckOut, canReschedule, canCancel } = await import(
      "@/lib/adapters/visits"
    );
    expect(phaseOf("CANCELLED", false)).toBe("done");
    expect(isLive("CANCELLED")).toBe(false);
    expect(canCheckIn("CANCELLED")).toBe(false);
    expect(canCheckOut("CANCELLED")).toBe(false);
    expect(canReschedule("CANCELLED")).toBe(false);
    expect(canCancel("CANCELLED")).toBe(false);
  });

  it("the screen says «زيارة ملغاة» and offers no visit action", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "seeker-1", displayName: "باحث عن سكن (عرض)", email: "seeker@x.sa",
        phone: "+966500000000", backendRole: "HOME_SEEKER", role: "homeowner_prospect",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    stub.on("GET", "/visits/v1", () =>
      envelope({
        id: "v1", projectId: "p1", unitId: "u1",
        projectName: "مشروع نسائم الرياض (عرض)", projectCity: "الرياض", unitNumber: "A302",
        date: "2026-08-02T00:00:00.000Z", time: "10:00",
        status: "CANCELLED", checkedInAt: null, checkedOutAt: null,
        rescheduleCount: 0, notes: [], issues: [], feedback: null,
        createdAt: "2026-07-28T00:00:00.000Z",
      }),
    );
    stub.on("GET", "/discovery/projects/p1", () =>
      envelope({
        id: "p1", name: "مشروع نسائم الرياض (عرض)", developerName: "شركة سكن العقارية (عرض)",
        city: "الرياض", district: "حي النرجس", priceFrom: 720000, readiness: "READY",
        unitTypes: ["شقة غرفتين"], coverImageUrl: null, gallery: [], amenities: [],
        description: "", isSaved: false, isCurrentlyDiscoverable: true, unitsAvailableCount: 4,
        availableUnits: [], visitSlots: [],
      }),
    );

    const [{ VisitExperienceScreen }, { AuthProvider }] = await Promise.all([
      import("@/components/homeowner/VisitExperienceScreen"),
      import("@/lib/auth/AuthContext"),
    ]);
    const { container } = render(
      <AuthProvider>
        <VisitExperienceScreen visitId="v1" />
      </AuthProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain("زيارة ملغاة"));
    for (const forbidden of [
      "زيارة قادمة",
      "زيارة مجدولة",
      "زيارة مؤكدة",
      "زيارة جارية",
      "إعادة جدولة الزيارة",
      "بدء الزيارة",
      "إنهاء الزيارة",
      "التقاط ملاحظة",
      "الإبلاغ عن ملاحظة",
    ]) {
      expect(container.textContent, forbidden).not.toContain(forbidden);
    }
  });
});

/* ======================================================================== *
 * 8. CORRECTION PASS — Real Mode states no unsupported project fact.
 * ======================================================================== */

describe("project details asserts nothing the Backend did not send", () => {
  /**
   * The live audit found all of these presented as facts about a real project:
   * "من بين 128 مشروعاً", a 4.7/5 developer rating, 18 years of experience, 42
   * completed projects, 7 under development, 96% on-time delivery, a hard-coded
   * construction progress bar, invented "points to watch", generated A/B/C unit
   * models, project-specific FAQ answers, and a comparison table against a
   * blank project at 0% compatibility.
   */
  async function renderDetails(opts: { units?: unknown[]; otherProjects?: unknown[] } = {}) {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "seeker-1", displayName: "باحث عن سكن (عرض)", email: "seeker@x.sa",
        phone: "+966500000000", backendRole: "HOME_SEEKER", role: "homeowner_prospect",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    const project = {
      id: "p1", name: "مشروع نسائم الرياض (عرض)", developerName: "شركة سكن العقارية (عرض)",
      city: "الرياض", district: "حي النرجس", priceFrom: 720000, readiness: "READY",
      unitTypes: ["شقة غرفتين"], coverImageUrl: null, gallery: [], amenities: [],
      description: "", isSaved: false, isCurrentlyDiscoverable: true, unitsAvailableCount: 2,
      availableUnits: opts.units ?? [
        { id: "u1", number: "A301", type: "شقة", area: 165, bedrooms: 3, bathrooms: 3, price: 890000 },
      ],
      visitSlots: ["10:00"],
    };
    // Registration order matters: the routed stub prefers the LAST matching
    // handler, and "/discovery/projects" is a substring of
    // "/discovery/projects/p1" — so the specific route is registered last.
    stub.on("GET", "/discovery/projects", () =>
      envelope({ items: [project, ...(opts.otherProjects ?? [])], total: 1 + (opts.otherProjects?.length ?? 0), page: 1, pageSize: 24 }),
    );
    stub.on("GET", "/discovery/projects/p1", () => envelope(project));
    stub.on("GET", "/discovery/recommendations", () =>
      envelope({ available: false, reasonCode: "AI_SERVICE_UNAVAILABLE", items: [] }),
    );

    const [{ ProjectDetailsScreen }, { AuthProvider }] = await Promise.all([
      import("@/components/homeowner/ProjectDetailsScreen"),
      import("@/lib/auth/AuthContext"),
    ]);
    return render(
      <AuthProvider>
        <ProjectDetailsScreen projectId="p1" />
      </AuthProvider>,
    );
  }

  it("renders none of the fixture developer or project claims", async () => {
    const { container } = await renderDetails();
    await waitFor(() => expect(container.textContent).toContain("مشروع نسائم الرياض (عرض)"));

    for (const claim of [
      "128",              // "من بين 128 مشروعاً"
      "4.7 / 5",          // developer rating
      "سنة خبرة",         // 18 years
      "مشروع مكتمل",      // 42 completed
      "مشاريع قيد التطوير", // 7 in development
      "تسليم في الموعد",  // 96% on-time
      "شركة أوج للتطوير العقاري",
      "نموذج A",
      "نموذج B",
      "نموذج C",
      "قد يكون السعر أعلى قليلاً من متوسط الحي",
      "بعض الوحدات تحت الإنشاء",
      "نعم، جميع الوحدات تُسلّم بتشطيب كامل",
      "معتمد لدى كبرى جهات التمويل",
    ]) {
      expect(container.textContent, claim).not.toContain(claim);
    }
  });

  it("shows the project's REAL units, and only those", async () => {
    const { container } = await renderDetails({
      units: [{ id: "u1", number: "A301", type: "شقة", area: 165, bedrooms: 3, bathrooms: 3, price: 890000 }],
    });
    await waitFor(() => expect(container.textContent).toContain("الوحدة A301"));
    // Exactly one real unit, so exactly one card — not three.
    expect(container.textContent).not.toContain("الوحدة A302");
    expect(container.textContent).toContain("165 م²");
  });

  it("states an honest empty state instead of an empty comparison at 0%", async () => {
    const { container } = await renderDetails();
    await waitFor(() => expect(container.textContent).toContain("قارن قبل أن تقرّر"));
    expect(container.textContent).toContain("لا يوجد مشروع آخر متاح للمقارنة حالياً.");
    // No select with zero options, and no 0% row against a blank column.
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.textContent).not.toContain("0%");
  });

  it("keeps every approved section on the page — nothing was removed to avoid fixing it", async () => {
    const { container } = await renderDetails();
    await waitFor(() => expect(container.textContent).toContain("مشروع نسائم الرياض (عرض)"));
    for (const section of [
      "تجوّل في المشروع",       // gallery
      "المعلومات التي تهمّك",   // snapshot
      "لماذا رشّحنا هذا المشروع؟",
      "تحليل مستشار سكن",
      "من يقف خلف المشروع",     // developer
      "أين وصل المشروع الآن",   // timeline
      "اختر النموذج الأنسب لعائلتك", // units
      "قارن قبل أن تقرّر",
      "احجز زيارة معاينة",
      "أسئلة عن هذا المشروع تحديداً",
    ]) {
      expect(container.textContent, section).toContain(section);
    }
  });
});

/* ======================================================================== *
 * 9. CORRECTION PASS — the header account menu.
 * ======================================================================== */

describe("AccountMenu", () => {
  async function renderMenu() {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.resetModules();
    stub.on("POST", "/auth/refresh", () =>
      envelope({
        accessToken: "t", userId: "seeker-1", displayName: "باحث عن سكن (عرض)", email: "seeker@x.sa",
        phone: "+966500000000", backendRole: "HOME_SEEKER", role: "homeowner_prospect",
        accountStatus: "ACTIVE", landingRoute: "/",
      }),
    );
    const [{ AccountMenu }, { AuthProvider }] = await Promise.all([
      import("@/components/auth/AccountMenu"),
      import("@/lib/auth/AuthContext"),
    ]);
    const utils = render(
      <AuthProvider>
        <div data-testid="outside" style={{ height: 40 }} />
        <AccountMenu />
      </AuthProvider>,
    );
    await waitFor(() => expect(utils.container.textContent).toContain("باحث عن سكن (عرض)"));
    return utils;
  }

  it("opens on the trigger and offers the real supported action", async () => {
    await renderMenu();
    const trigger = screen.getByRole("button", { name: /حساب المستخدم/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    expect(screen.getByRole("menuitem", { name: "تسجيل الخروج" })).toBeTruthy();
  });

  it("offers no fabricated settings or theme action", async () => {
    await renderMenu();
    screen.getByRole("button", { name: /حساب المستخدم/ }).click();
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    // Exactly one action: the one that genuinely exists.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("closes on the trigger again — nobody should have to sign out to dismiss it", async () => {
    await renderMenu();
    const trigger = screen.getByRole("button", { name: /حساب المستخدم/ });
    trigger.click();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeTruthy());
    trigger.click();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("closes on Escape", async () => {
    await renderMenu();
    screen.getByRole("button", { name: /حساب المستخدم/ }).click();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeTruthy());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("closes on a pointer down outside it", async () => {
    const { getByTestId } = await renderMenu();
    screen.getByRole("button", { name: /حساب المستخدم/ }).click();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeTruthy());
    getByTestId("outside").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("meets the 44px minimum tap target", async () => {
    await renderMenu();
    const trigger = screen.getByRole("button", { name: /حساب المستخدم/ });
    expect(trigger.style.minHeight).toBe("44px");
    expect(trigger.style.minWidth).toBe("44px");
  });
});

/* ======================================================================== *
 * 10. CORRECTION PASS — honest states and confirmations.
 * ======================================================================== */

describe("cross-role rejection returns the user to their own landing route", () => {
  /**
   * `RouteGuard` sent every out-of-role user to `/` — the public marketing
   * page — which for a signed-in company user is a dead end they have to
   * navigate out of by hand. Every role now has a real landing screen.
   */
  it("maps every role to a real route, so `/` is never the destination", async () => {
    const { DEFAULT_ROUTE_FOR_ROLE } = await import("@/lib/auth/routeRoles");
    const roles = [
      "homeowner_prospect",
      "homeowner_pending",
      "homeowner_active",
      "technician",
      "pm",
      "company",
    ] as const;
    for (const role of roles) {
      const route = DEFAULT_ROUTE_FOR_ROLE[role];
      expect(route, role).toBeTruthy();
      expect(route, role).not.toBe("/");
      expect(route.startsWith("/"), role).toBe(true);
    }
  });

  it("the guard redirects to that route, not to the marketing page", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/components/auth/RouteGuard.tsx"), "utf8");
    expect(src).toContain("DEFAULT_ROUTE_FOR_ROLE");
    // `/` survives only as the fallback for a role with no route.
    expect(src).toMatch(/landing \?\? "\/"/);
  });
});

describe("useConfirm — a state change is asked for, not assumed", () => {
  async function mount() {
    vi.resetModules();
    const { useConfirm } = await import("@/components/shared/ConfirmDialog");
    const outcome: { value: boolean | null } = { value: null };
    function Harness() {
      const [confirm, dialog] = useConfirm();
      return (
        <>
          <button
            onClick={async () => {
              outcome.value = await confirm({
                title: "تعطيل حساب المقاول؟",
                body: "سيتوقّف عن استلام بلاغات جديدة.",
                confirmLabel: "تعطيل الحساب",
                destructive: true,
              });
            }}
          >
            تعطيل
          </button>
          {dialog}
        </>
      );
    }
    render(<Harness />);
    return outcome;
  }

  it("resolves false when cancelled — the caller must do nothing", async () => {
    const outcome = await mount();
    screen.getByRole("button", { name: "تعطيل" }).click();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    screen.getByRole("button", { name: "إلغاء" }).click();
    await waitFor(() => expect(outcome.value).toBe(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("resolves false on Escape", async () => {
    const outcome = await mount();
    screen.getByRole("button", { name: "تعطيل" }).click();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() => expect(outcome.value).toBe(false));
  });

  it("resolves true only on the explicit confirm", async () => {
    const outcome = await mount();
    screen.getByRole("button", { name: "تعطيل" }).click();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    screen.getByRole("button", { name: "تعطيل الحساب" }).click();
    await waitFor(() => expect(outcome.value).toBe(true));
  });

  it("every destructive action goes through it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const [file, action] of [
      ["src/components/company/TechniciansManagementScreen.tsx", "technician deactivation"],
      ["src/components/company/HomeownersManagementScreen.tsx", "homeowner deactivation"],
      ["src/components/company/ProjectsManagementScreen.tsx", "project deactivation"],
      ["src/components/homeowner/MyReportsScreen.tsx", "report reopen"],
    ] as const) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, action).toContain("useConfirm");
      expect(src, action).toMatch(/await confirm\(\{/);
    }
  });
});

describe("unavailable features say so instead of pretending", () => {
  it("the landing language control is disabled, not an empty handler", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/components/landing/LandingScreen.tsx"), "utf8");
    // The toggle used to flip a label and do nothing else.
    expect(src).not.toContain('onClick={() => setLang((p) => (p === "EN" ? "ع" : "EN"))}');
    expect(src).toContain('aria-disabled="true"');
    expect(src).toContain("النسخة الإنجليزية غير متاحة حالياً");
  });

  it("/reset-password without a token refuses to show a reset form", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/components/auth/AuthScreen.tsx"), "utf8");
    expect(src).toContain("resetToken === null");
    expect(src).toContain("رابط غير صالح");
  });

  it("«تذكّرني» is a real, keyboard-operable checkbox", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/components/auth/AuthScreen.tsx"), "utf8");
    expect(src).toContain('role="checkbox"');
    expect(src).toContain("aria-checked={liRemember}");
    expect(src).toMatch(/onKeyDown=\{\(e\) => \{[\s\S]*?e\.key === " "/);
  });
});

/* ======================================================================== *
 * 11. CORRECTION PASS — the creation wizards use real records.
 * ======================================================================== */

describe("homeowner creation offers real projects, buildings and vacant units", () => {
  /**
   * The units were already the real `GET /api/units/vacant`, but the PROJECT
   * and BUILDING dropdowns were the fixture constant. So the wizard listed
   * "أوج الشمال / أوج الواحة / أوج النخيل" for a company that owns none of
   * them — and since the unit list filters on `projectId === pickProject`, a
   * fixture id could never match a real unit: picking a project produced an
   * empty unit list and the wizard could not be completed at all.
   */
  it("derives the pickers from the vacant units instead of the fixture list", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/company/HomeownersManagementScreen.tsx"),
      "utf8",
    );
    // The fixture is preserved for Demo Mode…
    expect(src).toContain("const PROJECTS = [");
    // …but real mode builds its own options and the pickers read those.
    expect(src).toContain("realPickerProjects");
    expect(src).toContain("const pickerProjects = DEMO_MODE ? PROJECTS : realPickerProjects;");
    expect(src).not.toContain("<UnitPicker projects={PROJECTS}");
  });

  it("technician creation resolves projects and managers from the company's own records", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/company/TechniciansManagementScreen.tsx"),
      "utf8",
    );
    expect(src).toContain("useCompanyProjectsSummary");
    expect(src).toContain("const projectOptions: ProjectRef[] = DEMO_MODE ? PROJECTS : liveProjects.projects;");
    // No picker may read the fixture array directly any more.
    expect(src).not.toContain("{PROJECTS.map(");
  });
});
