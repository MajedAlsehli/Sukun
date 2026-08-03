/**
 * Every Task 2 hook, plus the two guarantees the whole integration rests on:
 *
 *  * **Real mode never falls back to a fixture.** Not on a network error, not
 *    on a 401/403, not on an empty response, not on a provider being
 *    unavailable, not on a validation error.
 *  * **Demo Mode makes no Backend call at all.** Not "makes one and ignores
 *    it" — the request is never issued.
 *
 * These are asserted per hook rather than once globally, because a single
 * accidental `withDemoFallback` in one domain is exactly the regression that
 * would otherwise slip through.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBackendStub, envelope, errorEnvelope, pathOf, type BackendStub } from "@/test/backendHarness";
import { useAsyncResource } from "./useAsyncResource";

let stub: BackendStub;

beforeEach(() => {
  vi.resetModules();
  stub = installBackendStub();
});
afterEach(() => {
  vi.resetModules();
});

/** Re-imports the hook module with `NEXT_PUBLIC_DEMO_MODE` set as requested. */
async function loadHooks(demo: boolean) {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", demo ? "true" : "false");
  vi.resetModules();
  return {
    discovery: await import("./useDiscovery"),
    visits: await import("./useVisits"),
    myHome: await import("./useMyHome"),
    reports: await import("./useReports"),
    activation: await import("./useActivation"),
    journey: await import("./useReportJourney"),
  };
}

const EMPTY_ACTIVITY = { viewed: [], fav: {}, bookings: [], notifRead: false };
const PREFS = {
  pName: "", pCity: "الرياض", pFamily: 4, pFinance: "كاش",
  wBudget: 3_000_000, wType: "فيلا", wBeds: 4, wTimeline: "", wLifestyle: {}, recReady: true,
};

/* ------------------------------------------------- the async primitive */

describe("useAsyncResource", () => {
  it("always leaves the loading state — success", async () => {
    const { result } = renderHook(() => useAsyncResource(async () => 42, []));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe(42);
  });

  it("always leaves the loading state — failure, with approved Arabic copy", async () => {
    const { result } = renderHook(() =>
      useAsyncResource(async () => {
        throw new Error("boom");
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    // Never an English backend message, never an indefinite spinner.
    expect(result.current.errorMessage).toBe("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    expect(result.current.data).toBeNull();
  });

  it("aborts the previous request when the inputs change", async () => {
    const seen: AbortSignal[] = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAsyncResource(
          (signal) => {
            seen.push(signal);
            return new Promise<string>((resolve) => setTimeout(() => resolve(id), 5));
          },
          [id],
        ),
      { initialProps: { id: "a" } },
    );
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(seen).toHaveLength(2);
    expect(seen[0].aborted).toBe(true);
    expect(seen[1].aborted).toBe(false);
  });

  it("a slow FIRST response can never overwrite a fast SECOND one", async () => {
    const delays: Record<string, number> = { a: 40, b: 1 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAsyncResource(
          () => new Promise<string>((resolve) => setTimeout(() => resolve(id), delays[id])),
          [id],
        ),
      { initialProps: { id: "a" } },
    );
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("b"));
    // Give the slow first request time to land.
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.data).toBe("b");
  });

  it("an abort does not become a rendered error", async () => {
    const { result, unmount } = renderHook(() =>
      useAsyncResource(
        (signal) =>
          new Promise<string>((_, reject) => {
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
        [],
      ),
    );
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).not.toBe("error");
  });

  it("`enabled: false` fires no request and stays idle", async () => {
    const loader = vi.fn(async () => 1);
    const { result } = renderHook(() => useAsyncResource(loader, [], { enabled: false }));
    await new Promise((r) => setTimeout(r, 10));
    expect(loader).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});

/* ------------------------------------------------------------- discovery */

describe("useDiscoveryProjects", () => {
  it("real mode loads from the Backend and ranks by the resident's preferences", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(
      envelope({
        items: [
          { id: "b", name: "ب", city: "جدة", district: null, description: null, readiness: "READY", amenities: [], developerName: "d", coverImageUrl: null, gallery: [], priceFrom: 1_000_000, priceTo: null, unitTypes: ["شقة"], unitsAvailableCount: 1, isSaved: false, isCurrentlyDiscoverable: true, createdAt: "" },
          { id: "a", name: "أ", city: "الرياض", district: null, description: null, readiness: "READY", amenities: [], developerName: "d", coverImageUrl: null, gallery: [], priceFrom: 2_000_000, priceTo: null, unitTypes: ["فيلا"], unitsAvailableCount: 1, isSaved: true, isCurrentlyDiscoverable: true, createdAt: "" },
        ],
        total: 2,
        page: 1,
        pageSize: 24,
      }),
    );
    const { result } = renderHook(() => discovery.useDiscoveryProjects(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(pathOf(stub.last())).toBe("/api/discovery/projects");
    // "أ" matches city + type + budget, so it outranks "ب".
    expect(result.current.projects.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.current.total).toBe(2);
  });

  it("real mode surfaces a network error WITHOUT substituting fixtures", async () => {
    const { discovery } = await loadHooks(false);
    stub.rejectWith(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => discovery.useDiscoveryProjects(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.projects).toEqual([]);
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("real mode surfaces an empty page as empty, not as the six fixture projects", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 24 }));
    const { result } = renderHook(() => discovery.useDiscoveryProjects(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.projects).toEqual([]);
  });

  it("real mode surfaces a 403 without substituting fixtures", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(errorEnvelope(403, "ACCESS_DENIED"));
    const { result } = renderHook(() => discovery.useDiscoveryProjects(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.projects).toEqual([]);
  });

  it("Demo Mode renders every fixture and makes NO request", async () => {
    const { PROJECTS } = await import("@/lib/demo/discoveryFixtures");
    const { discovery } = await loadHooks(true);
    const { result } = renderHook(() => discovery.useDiscoveryProjects(PREFS, EMPTY_ACTIVITY));
    expect(result.current.status).toBe("ready");
    // Counted from the catalogue rather than hard-coded at six: the point of
    // this test is that Demo Mode serves the fixtures WITHOUT a request, and
    // that claim should not need editing every time a listing is added.
    expect(result.current.projects).toHaveLength(PROJECTS.length);
    expect(stub.requests).toHaveLength(0);
  });
});

describe("useDiscoveryProject (detail, direct route parameter)", () => {
  it("loads the id straight from the URL segment", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(envelope({ id: "uuid-1", name: "x", city: "c", district: null, description: null, readiness: null, amenities: [], developerName: "d", coverImageUrl: null, gallery: [], priceFrom: null, priceTo: null, unitTypes: [], unitsAvailableCount: 0, isSaved: false, isCurrentlyDiscoverable: true, createdAt: "", availableUnits: [], visitSlots: [] }));
    const { result } = renderHook(() => discovery.useDiscoveryProject("uuid-1", PREFS));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(pathOf(stub.last())).toBe("/api/discovery/projects/uuid-1");
    expect(result.current.project?.id).toBe("uuid-1");
  });

  it("reports a non-discoverable project's 404 as notFound, never as a fixture", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(errorEnvelope(404, "PROJECT_NOT_FOUND"));
    const { result } = renderHook(() => discovery.useDiscoveryProject("nope", PREFS));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notFound).toBe(true);
    expect(result.current.project).toBeNull();
  });
});

describe("useDiscoveryRecommendation", () => {
  it("maps an unavailable recommendation to an explicit unavailable state", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(envelope({ available: false, reason: "AI_SERVICE_UNAVAILABLE", items: [] }));
    const { result } = renderHook(() => discovery.useDiscoveryRecommendation(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.recommendation?.state).toBe("unavailable");
    expect(result.current.recommendation?.reasonCode).toBe("AI_SERVICE_UNAVAILABLE");
  });

  it("maps an available recommendation with its real reason", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(
      envelope({
        available: true,
        items: [{ project: { id: "a", name: "أ", city: "الرياض", district: null, description: null, readiness: "READY", amenities: [], developerName: "d", coverImageUrl: null, gallery: [], priceFrom: 1, priceTo: null, unitTypes: [], unitsAvailableCount: 0, isSaved: false, isCurrentlyDiscoverable: true, createdAt: "" }, reason: "قريب من عملك" }],
      }),
    );
    const { result } = renderHook(() => discovery.useDiscoveryRecommendation(PREFS, EMPTY_ACTIVITY));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.recommendation?.state).toBe("available");
    expect(result.current.recommendation?.items[0].reason).toBe("قريب من عملك");
  });

  it("Demo Mode makes no recommendation request", async () => {
    const { discovery } = await loadHooks(true);
    renderHook(() => discovery.useDiscoveryRecommendation(PREFS, EMPTY_ACTIVITY));
    expect(stub.requests).toHaveLength(0);
  });
});

describe("useSavedProjects", () => {
  const project = {
    id: "p1", name: "x", dev: "d", city: "c", district: "", price: null, priceLabel: "—",
    area: null, beds: null, baths: null, avail: "—", type: "—", grad: "", img: "", gallery: [],
    emi: "", match: 0, matched: [], reasons: [], isSaved: false, isCurrentlyDiscoverable: true,
    unitsAvailableCount: null, amenities: [], description: null,
  };

  it("saves through the real endpoint and adopts the SERVER's answer", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(envelope({ saved: true }, 201));
    const { result } = renderHook(() => discovery.useSavedProjects(EMPTY_ACTIVITY, () => {}));
    expect(result.current.isSaved(project)).toBe(false);
    await act(async () => {
      await result.current.toggle(project);
    });
    expect(stub.last().method).toBe("POST");
    expect(result.current.isSaved(project)).toBe(true);
  });

  it("unsaves through the one DELETE route", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(envelope({ saved: false }));
    const { result } = renderHook(() => discovery.useSavedProjects(EMPTY_ACTIVITY, () => {}));
    await act(async () => {
      await result.current.toggle({ ...project, isSaved: true });
    });
    expect(stub.last().method).toBe("DELETE");
    expect(result.current.isSaved({ ...project, isSaved: true })).toBe(false);
  });

  it("rolls back to the pre-click truth when the Backend refuses", async () => {
    const { discovery } = await loadHooks(false);
    stub.reply(errorEnvelope(404, "PROJECT_NOT_FOUND"));
    const { result } = renderHook(() => discovery.useSavedProjects(EMPTY_ACTIVITY, () => {}));
    await act(async () => {
      await result.current.toggle(project);
    });
    // Never leave the heart showing a state the server never accepted.
    expect(result.current.isSaved(project)).toBe(false);
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("Demo Mode writes the localStorage record and makes no request", async () => {
    const { discovery } = await loadHooks(true);
    const changes: unknown[] = [];
    const { result } = renderHook(() => discovery.useSavedProjects(EMPTY_ACTIVITY, (next) => changes.push(next)));
    await act(async () => {
      await result.current.toggle({ ...project, id: "1" });
    });
    expect(stub.requests).toHaveLength(0);
    // Keyed by the fixture's original NUMERIC id, so the stored shape is
    // byte-identical to before Task 2.
    expect(changes[0]).toMatchObject({ fav: { 1: true } });
  });
});

/* ------------------------------------------------------------------ visits */

const VISIT = {
  id: "v1", userId: "u", projectId: "p", unitId: "un", searchJourneyId: "j",
  date: "2026-08-01", time: "10:00", status: "CHECKED_IN", checkedInAt: "2026-08-01T07:00:00.000Z",
  checkedOutAt: null, rescheduleCount: 0, lastRescheduledAt: null,
  createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "", projectName: "م", projectCity: "ر",
  unitNumber: "A-1", notes: [], issues: [], feedback: null,
};

describe("useVisit lifecycle", () => {
  it("loads the visit and exposes the server's own eligibility", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(envelope(VISIT));
    const { result } = renderHook(() => visits.useVisit("v1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.visit?.live).toBe(true);
    expect(result.current.visit?.canCheckOut).toBe(true);
  });

  it("re-reads the visit after every lifecycle action", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(envelope(VISIT));
    const { result } = renderHook(() => visits.useVisit("v1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    stub.reply(envelope({ ...VISIT, status: "CHECKED_OUT" })); // the action
    stub.reply(envelope({ ...VISIT, status: "CHECKED_OUT", checkedOutAt: "2026-08-01T08:00:00.000Z" })); // the re-read
    await act(async () => {
      await result.current.checkOut();
    });
    await waitFor(() => expect(result.current.visit?.status).toBe("CHECKED_OUT"));
    expect(pathOf(stub.at(1))).toBe("/api/visits/v1/checkout");
    expect(pathOf(stub.at(2))).toBe("/api/visits/v1");
  });

  it("surfaces a refused action instead of pretending it worked", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(envelope(VISIT));
    const { result } = renderHook(() => visits.useVisit("v1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    stub.reply(errorEnvelope(409, "VISIT_NOT_IN_PROGRESS"));
    await act(async () => {
      await result.current.addIssue({ category: "PLUMBING" });
    });
    expect(result.current.actionError).toBeTruthy();
    expect(result.current.visit?.status).toBe("CHECKED_IN");
  });

  it("reports a foreign visit's 404 as notFound", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    const { result } = renderHook(() => visits.useVisit("someone-elses"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notFound).toBe(true);
    expect(result.current.visit).toBeNull();
  });

  it("Demo Mode makes no visit request", async () => {
    const { visits } = await loadHooks(true);
    renderHook(() => visits.useVisit("demo-visit-1"));
    expect(stub.requests).toHaveLength(0);
  });

  it("books a real visit and returns its real id", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(envelope({ id: "real-visit-id" }, 201));
    const { result } = renderHook(() => visits.useBookVisit());
    let id: string | null = null;
    await act(async () => {
      id = await result.current.book({ projectId: "p", unitId: "u", date: "2026-08-05", time: "10:00" });
    });
    expect(id).toBe("real-visit-id");
    expect(stub.last().body).toEqual({ projectId: "p", unitId: "u", date: "2026-08-05", time: "10:00" });
  });

  it("a refused booking returns null rather than a fabricated id", async () => {
    const { visits } = await loadHooks(false);
    stub.reply(errorEnvelope(400, "VALIDATION_ERROR"));
    const { result } = renderHook(() => visits.useBookVisit());
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.book({ projectId: "p", unitId: "u", date: "2020-01-01", time: "10:00" });
    });
    expect(id).toBeNull();
    expect(result.current.bookingError).toBeTruthy();
  });
});

/* ------------------------------------------------------ My Home + warranty */

const MY_HOME = {
  ownershipId: "o1", startDate: "2022-03-12T00:00:00.000Z", handoverDate: "2022-03-12T00:00:00.000Z",
  unit: { id: "unit-1", number: "A-142", floor: 1, type: "شقة", status: "OCCUPIED", area: 180, bedrooms: 3, bathrooms: 2, parkingSpots: 1 },
  building: { id: "b", name: "n", number: "1" },
  project: { id: "p", name: "مشروع", city: "الرياض", developerName: "شركة" },
  coverImage: { url: null, isPlaceholder: true },
  warranty: { isActive: true, endDate: "2032-03-12T00:00:00.000Z", daysRemaining: 2000 },
  reportsSummary: { available: true, openCount: 1, boundary: "ACTIVE" },
};

describe("useMyHome / useWarranty", () => {
  it("loads My Home and the homeowner's own recent reports", async () => {
    const { myHome } = await loadHooks(false);
    stub.reply(envelope(MY_HOME));
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 4 }));
    const { result } = renderHook(() => myHome.useMyHome());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.home?.unit.number).toBe("A-142");
    expect(stub.requests.map(pathOf).sort()).toEqual(["/api/homeowners/me", "/api/reports"].sort());
  });

  it("reports a homeowner with no active ownership honestly", async () => {
    const { myHome } = await loadHooks(false);
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 4 }));
    const { result } = renderHook(() => myHome.useMyHome());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.noActiveOwnership).toBe(true);
    expect(result.current.home).toBeNull();
  });

  it("warranty does NOT fire until a real unit id exists", async () => {
    const { myHome } = await loadHooks(false);
    const { result, rerender } = renderHook(
      ({ unitId }: { unitId: string | null }) => myHome.useWarranty(unitId, { structure: "ok" }),
      { initialProps: { unitId: null as string | null } },
    );
    expect(stub.requests).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    stub.reply(envelope({ id: "w", unitId: "unit-1", startDate: "2022-03-12T00:00:00.000Z", endDate: "2032-03-12T00:00:00.000Z", coverage: "S", isActive: true, daysRemaining: 100, rulesVersion: "v", categories: [] }));
    rerender({ unitId: "unit-1" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(stub.last().url).toContain("unitId=unit-1");
  });

  it("Demo Mode makes no My Home or warranty request", async () => {
    const { myHome } = await loadHooks(true);
    renderHook(() => myHome.useMyHome());
    renderHook(() => myHome.useWarranty("unit-1", { structure: "ok" }));
    expect(stub.requests).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------- reports */

const REPORT = {
  id: "r1", reportNumber: 2432, status: "AWAITING_OWNER_APPROVAL", statusGroup: "AWAITING_APPROVAL",
  category: "WINDOWS", categoryConfirmedByUser: true, priority: "MEDIUM", prioritySource: "AI",
  problemText: "عطل", homeownerNote: null, createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "", closedAt: null,
  reopenCount: 0,
  warranty: { verdict: "COVERED", reasonCode: "COVERED", categoryKey: null, rulesVersion: "v", evaluatedAt: "", periodStart: null, periodEnd: null },
  sla: { dueAt: null, state: "ON_TIME", rulesVersion: "v" },
  location: { projectId: "p", projectName: "x", projectCity: "y", projectDistrict: null, buildingId: "b", buildingName: "n", buildingNumber: "1", unitId: "u", unitNumber: "A", unitFloor: 1 },
  homeowner: { id: "h", name: "م", phone: null, email: null },
  technician: null, repair: null, review: null, ai: null,
  routing: { state: "ROUTED", reasonCode: null, attemptCount: 1, lastAttemptAt: null },
  photoCounts: { homeowner: 1, before: 0, after: 0 },
  interventionNeeded: false, interventionReasonCode: null,
  permissions: { canStart: false, canSubmitRepair: false, canApprove: true, canReopen: true },
  media: [],
};

describe("useReports", () => {
  it("never sends a homeownerId — the role scope is the Backend's", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(envelope({ items: [REPORT], total: 1, page: 1, pageSize: 50 }));
    const { result } = renderHook(() => reports.useReports("all"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(stub.last().url).not.toContain("homeownerId");
    expect(result.current.reports).toHaveLength(1);
  });

  it("filters by the four approved chips and counts from the same page", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(
      envelope({
        items: [REPORT, { ...REPORT, id: "r2", status: "CLOSED", statusGroup: "CLOSED" }],
        total: 2, page: 1, pageSize: 50,
      }),
    );
    const { result } = renderHook(() => reports.useReports("closed"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.reports.map((r) => r.id)).toEqual(["r2"]);
    // A tile can never disagree with the rows beneath it.
    expect(result.current.counts).toEqual({ open: 0, inprogress: 0, waiting: 1, closed: 1 });
  });

  it("surfaces an error with no fixture reports", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(errorEnvelope(500, "INTERNAL_SERVER_ERROR"));
    const { result } = renderHook(() => reports.useReports("all"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reports).toEqual([]);
  });

  it("Demo Mode makes no reports request", async () => {
    const { reports } = await loadHooks(true);
    renderHook(() => reports.useReports("all"));
    expect(stub.requests).toHaveLength(0);
  });
});

describe("useReportDetail", () => {
  it("loads the report AND its canonical timeline", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(envelope(REPORT));
    stub.reply(envelope([{ id: "e1", type: "REPORT_CREATED", actorType: "HOMEOWNER", actorName: "م", metadata: null, createdAt: "" }]));
    const { result } = renderHook(() => reports.useReportDetail("r1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.timeline).toHaveLength(1));
    expect(result.current.timeline[0].label).toBe("تم إرسال البلاغ");
    expect(stub.requests.map(pathOf).sort()).toEqual(["/api/reports/r1", "/api/reports/r1/timeline"].sort());
  });

  it("approves with the resident's real rating and adopts the returned report", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(envelope(REPORT));
    stub.reply(envelope([]));
    const { result } = renderHook(() => reports.useReportDetail("r1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    stub.reply(envelope({ ...REPORT, status: "CLOSED", statusGroup: "CLOSED", permissions: { canStart: false, canSubmitRepair: false, canApprove: false, canReopen: false } }));
    stub.reply(envelope([])); // the timeline re-read
    let ok = false;
    await act(async () => {
      ok = await result.current.approve({ rating: 5, comment: "ممتاز" });
    });
    expect(ok).toBe(true);
    expect(stub.at(2).body).toEqual({ rating: 5, comment: "ممتاز" });
    expect(result.current.report?.statusGroup).toBe("CLOSED");
  });

  it("reopens with a reason and reports a refusal honestly", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(envelope(REPORT));
    stub.reply(envelope([]));
    const { result } = renderHook(() => reports.useReportDetail("r1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    stub.reply(errorEnvelope(409, "INVALID_STATE_TRANSITION"));
    let ok = true;
    await act(async () => {
      ok = await result.current.reopen({ reason: "ما زالت المشكلة موجودة" });
    });
    expect(ok).toBe(false);
    expect(result.current.actionError).toBeTruthy();
    // The report is unchanged — no optimistic "reopened" state was claimed.
    expect(result.current.report?.statusGroup).toBe("AWAITING_APPROVAL");
  });

  it("a cross-owner report 404s and renders nothing", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    const { result } = renderHook(() => reports.useReportDetail("someone-elses"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notFound).toBe(true);
    expect(result.current.report).toBeNull();
  });
});

describe("useReportProviders", () => {
  it("reads the real provider flags", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(
      envelope({
        analysis: { name: "openai", available: true },
        objectDetection: { name: "yolov11", available: true },
        media: { driver: "supabase", durable: true, available: true },
      }),
    );
    const { result } = renderHook(() => reports.useReportProviders());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analysisAvailable).toBe(true);
    expect(result.current.mediaAvailable).toBe(true);
    expect(result.current.objectDetectionAvailable).toBe(true);
  });

  it("treats an unavailable provider as unavailable", async () => {
    const { reports } = await loadHooks(false);
    stub.reply(
      envelope({
        analysis: { name: "openai", available: false },
        objectDetection: { name: "yolov11", available: false },
        media: { driver: "", durable: false, available: false },
      }),
    );
    const { result } = renderHook(() => reports.useReportProviders());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analysisAvailable).toBe(false);
  });

  it("treats a FAILED probe as unavailable, never optimistically as available", async () => {
    const { reports } = await loadHooks(false);
    stub.rejectWith(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => reports.useReportProviders());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.analysisAvailable).toBe(false);
    expect(result.current.mediaAvailable).toBe(false);
  });
});

/* -------------------------------------------------------------- activation */

describe("useActivation", () => {
  it("maps every Backend activation error onto an EXISTING result card", async () => {
    const { activation } = await loadHooks(false);
    const cases: Array<[string, string]> = [
      ["INVALID_ACTIVATION_CODE", "invalid"],
      ["ACTIVATION_CODE_EXPIRED", "expired"],
      ["ACTIVATION_CODE_ALREADY_USED", "linked"],
      ["UNIT_ALREADY_OWNED", "linked"],
      ["NOT_FOUND", "notfound"],
      ["ACCOUNT_DEACTIVATED", "server"],
      ["VALIDATION_ERROR", "server"],
      ["SOMETHING_NEW", "server"],
    ];
    const { result } = renderHook(() => activation.useActivation());
    for (const [code, expected] of cases) {
      stub.reply(errorEnvelope(400, code));
      let outcome = "";
      await act(async () => {
        outcome = await result.current.activate("SAKN-1", "");
      });
      expect(outcome).toBe(expected);
    }
  });

  it("adopts the real session the Backend minted on success", async () => {
    const { activation } = await loadHooks(false);
    const session = {
      userId: "u1", displayName: "مالك", email: "a@b.c", phone: "0500000000",
      backendRole: "HOMEOWNER", role: "homeowner_active", accountStatus: "ACTIVE",
      landingRoute: "/home", accessToken: "access-token",
    };
    stub.reply(envelope(session));
    const { result } = renderHook(() => activation.useActivation());
    await act(async () => {
      await result.current.activate("SAKN-DEMO-001", "Passw0rd");
    });
    expect(result.current.outcome).toBe("success");
    // The SERVER-DERIVED role, not a local activation flag.
    expect(result.current.session?.role).toBe("homeowner_active");
  });

  it("Demo Mode never reaches the network", async () => {
    const { activation } = await loadHooks(true);
    const { result } = renderHook(() => activation.useActivation());
    await act(async () => {
      await result.current.activate("SAKN-DEMO-001", "");
    });
    expect(stub.requests).toHaveLength(0);
    expect(result.current.outcome).toBe("success");
  });
});

/* --------------------------------------------------------- report creation */

describe("useSubmitReport", () => {
  it("refuses to submit without the staged media the analysis ran over", async () => {
    const { journey } = await loadHooks(false);
    const { result } = renderHook(() => journey.useSubmitReport());
    let ok = true;
    await act(async () => {
      ok = await result.current.submit({
        analysisId: "missing-analysis",
        categoryLabel: "سباكة",
        summary: "تسريب",
        note: "",
        location: "",
        categoryConfirmedByUser: true,
      });
    });
    // Better to say so than to fire a request that is certain to 400.
    expect(ok).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(result.current.errorMessage).toBeTruthy();
  });

  it("composes the note without dropping what the resident typed", async () => {
    const { journey } = await loadHooks(false);
    expect(journey.composeNote("بدأت أمس", "المطبخ")).toBe("بدأت أمس\nالموقع: المطبخ");
    expect(journey.composeNote("", "المطبخ")).toBe("الموقع: المطبخ");
    expect(journey.composeNote("بدأت أمس", "")).toBe("بدأت أمس");
    expect(journey.composeNote("", "")).toBeUndefined();
  });

  it("Demo Mode submits nothing", async () => {
    const { journey } = await loadHooks(true);
    const { result } = renderHook(() => journey.useSubmitReport());
    await act(async () => {
      await result.current.submit({
        analysisId: null, categoryLabel: "سباكة", summary: "x", note: "", location: "", categoryConfirmedByUser: true,
      });
    });
    expect(stub.requests).toHaveLength(0);
  });
});
