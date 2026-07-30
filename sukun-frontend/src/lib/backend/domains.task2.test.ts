/**
 * Every Task 2 API function: the request it issues and the response it returns.
 *
 * What each test is really asserting is a contract term taken from
 * `sakn-backend/src`, not a shape this frontend wished for. Where the two ever
 * disagree, the Backend is right and this file is the thing that must change.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { installBackendStub, envelope, errorEnvelope, pathOf, queryOf, type BackendStub } from "@/test/backendHarness";
import { backendDiscovery } from "./discovery";
import { backendVisits } from "./visits";
import { backendHomeowners } from "./homeowners";
import { backendWarranty } from "./warranty";
import { backendReports } from "./reports";
import { TASK_2_DOMAINS } from "./domains";
import { ApiError } from "./errors";

let stub: BackendStub;
beforeEach(() => {
  stub = installBackendStub();
});

/* ------------------------------------------------------------- discovery */

describe("discovery client", () => {
  it("GET /discovery/projects sends only the filters that were actually set", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendDiscovery.listProjects({ q: "  ", city: "الرياض", page: 2, pageSize: 10 });

    expect(pathOf(stub.last())).toBe("/api/discovery/projects");
    // `q` was whitespace only. The Backend's schema is `.min(1)`, so an empty
    // filter must be OMITTED, never sent as "" (which would 400).
    expect(queryOf(stub.last())).toEqual({ city: "الرياض", page: "2", pageSize: "10" });
  });

  it("only sends `saved` when the favourites view is actually on", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendDiscovery.listProjects({ saved: false });
    expect(queryOf(stub.last()).saved).toBeUndefined();

    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendDiscovery.listProjects({ saved: true });
    // The schema is z.enum(['true','false']) — the literal string, not a boolean.
    expect(queryOf(stub.last()).saved).toBe("true");
  });

  it("serializes every supported filter", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendDiscovery.listProjects({
      q: "فيلا",
      city: "جدة",
      priceBand: "FROM_1M_TO_2M",
      unitType: "فيلا",
      readiness: "READY",
    });
    expect(queryOf(stub.last())).toEqual({
      q: "فيلا",
      city: "جدة",
      priceBand: "FROM_1M_TO_2M",
      unitType: "فيلا",
      readiness: "READY",
    });
  });

  it("GET /discovery/projects/{id} url-encodes the id and returns the detail DTO", async () => {
    stub.reply(envelope({ id: "a b", name: "مشروع" }));
    const result = await backendDiscovery.getProject("a b");
    expect(pathOf(stub.last())).toBe("/api/discovery/projects/a%20b");
    expect(result).toEqual({ id: "a b", name: "مشروع" });
  });

  it("save is a POST and unsave is the one DELETE in the whole API", async () => {
    stub.reply(envelope({ saved: true }, 201));
    expect(await backendDiscovery.saveProject("p1")).toEqual({ saved: true });
    expect(stub.last().method).toBe("POST");
    expect(pathOf(stub.last())).toBe("/api/discovery/saved/p1");

    stub.reply(envelope({ saved: false }));
    expect(await backendDiscovery.unsaveProject("p1")).toEqual({ saved: false });
    expect(stub.last().method).toBe("DELETE");
    expect(pathOf(stub.last())).toBe("/api/discovery/saved/p1");
  });

  it("recommendations pass the honest-unavailable shape through untouched", async () => {
    stub.reply(envelope({ available: false, reason: "AI_SERVICE_UNAVAILABLE", items: [] }));
    const result = await backendDiscovery.getRecommendations();
    // A 200 saying "unavailable" is a CONTRACT, not an error, and must not be
    // rewritten into an empty success.
    expect(result).toEqual({ available: false, reason: "AI_SERVICE_UNAVAILABLE", items: [] });
  });

  it("passes an AbortSignal through and sends credentials", async () => {
    const controller = new AbortController();
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendDiscovery.listProjects({}, { signal: controller.signal });
    expect(stub.last().signal).toBe(controller.signal);
    expect(stub.last().credentials).toBe("include");
  });
});

/* ---------------------------------------------------------------- visits */

describe("visits client", () => {
  it("covers every route the domain boundary declares", async () => {
    const calls: Array<[string, () => Promise<unknown>, string, string]> = [
      ["GET /visits", () => backendVisits.list(), "GET", "/api/visits"],
      ["GET /visits/{id}", () => backendVisits.getById("v1"), "GET", "/api/visits/v1"],
      [
        "POST /visits",
        () => backendVisits.create({ projectId: "p", unitId: "u", date: "2026-08-01", time: "10:00" }),
        "POST",
        "/api/visits",
      ],
      ["PATCH /visits/{id}", () => backendVisits.reschedule("v1", { date: "2026-08-02", time: "12:00" }), "PATCH", "/api/visits/v1"],
      ["POST /visits/{id}/checkin", () => backendVisits.checkIn("v1"), "POST", "/api/visits/v1/checkin"],
      ["POST /visits/{id}/checkout", () => backendVisits.checkOut("v1"), "POST", "/api/visits/v1/checkout"],
      ["POST /visits/{id}/cancel", () => backendVisits.cancel("v1"), "POST", "/api/visits/v1/cancel"],
      ["POST /visits/{id}/notes", () => backendVisits.addNote("v1", { text: "hi" }), "POST", "/api/visits/v1/notes"],
      ["POST /visits/{id}/issues", () => backendVisits.addIssue("v1", { category: "PLUMBING" }), "POST", "/api/visits/v1/issues"],
      ["POST /visits/{id}/feedback", () => backendVisits.submitFeedback("v1", { rating: 5 }), "POST", "/api/visits/v1/feedback"],
    ];

    for (const [, call, method, path] of calls) {
      stub.reply(envelope({}));
      await call();
      expect(stub.last().method).toBe(method);
      expect(pathOf(stub.last())).toBe(path);
    }

    // The boundary `domains.ts` declared and what this module implements must
    // not drift apart.
    expect(TASK_2_DOMAINS.visits).toHaveLength(calls.length);
  });

  it("sends a note photo as raw base64, never a data: URI", async () => {
    stub.reply(envelope({ id: "n1" }, 201));
    await backendVisits.addNote("v1", {
      text: "crack",
      photo: { fileName: "a.jpg", mimeType: "image/jpeg", contentBase64: "AAAA" },
    });
    const body = stub.last().body as { photo: { contentBase64: string } };
    expect(body.photo.contentBase64).toBe("AAAA");
    expect(body.photo.contentBase64).not.toContain("data:");
  });

  it("check-in/checkout/cancel send no body at all", async () => {
    for (const call of [backendVisits.checkIn, backendVisits.checkOut, backendVisits.cancel]) {
      stub.reply(envelope({}));
      await call("v1");
      expect(stub.last().body).toBeNull();
    }
  });
});

/* ------------------------------------------------------------ homeowners */

describe("homeowners client", () => {
  it("POST /homeowners/activate sends code + password and opts out of the shared refresh", async () => {
    stub.reply(envelope({ userId: "u1", role: "homeowner_active", accessToken: "t" }));
    await backendHomeowners.activate({ code: " SAKN-1 ", password: "Passw0rd" });
    expect(pathOf(stub.last())).toBe("/api/homeowners/activate");
    expect(stub.last().body).toEqual({ code: " SAKN-1 ", password: "Passw0rd" });
  });

  it("a 401 from activate is NOT retried through the session refresh", async () => {
    // The route is reachable without a session, so its own 401 is a direct
    // outcome — treating it as "your live session died" would fire a spurious
    // refresh and a spurious sign-out.
    stub.reply(errorEnvelope(401, "INVALID_ACTIVATION_CODE"));
    await expect(backendHomeowners.activate({ code: "x", password: "y" })).rejects.toBeInstanceOf(ApiError);
    expect(stub.requests).toHaveLength(1);
  });

  it("GET /homeowners/me returns the My Home DTO", async () => {
    stub.reply(envelope({ ownershipId: "o1", unit: { id: "u1" } }));
    const result = await backendHomeowners.getMyHome();
    expect(pathOf(stub.last())).toBe("/api/homeowners/me");
    expect(result).toMatchObject({ ownershipId: "o1" });
  });
});

/* -------------------------------------------------------------- warranty */

describe("warranty client", () => {
  it("GET /warranty requires and sends unitId as a query parameter", async () => {
    stub.reply(envelope({ id: "w1", unitId: "u1", categories: [] }));
    await backendWarranty.getByUnit("u1");
    expect(pathOf(stub.last())).toBe("/api/warranty");
    expect(queryOf(stub.last())).toEqual({ unitId: "u1" });
  });
});

/* --------------------------------------------------------------- reports */

describe("reports client", () => {
  it("covers every canonical route the domain boundary declares", async () => {
    const calls: Array<[() => Promise<unknown>, string, string]> = [
      [() => backendReports.getProviders(), "GET", "/api/reports/providers"],
      [
        () => backendReports.uploadMedia({ fileName: "a.jpg", mimeType: "image/jpeg", contentBase64: "AA" }),
        "POST",
        "/api/reports/media",
      ],
      [() => backendReports.analyze({ mediaKeys: ["k"] }), "POST", "/api/reports/analyze"],
      [() => backendReports.warrantyCheck({ category: "PLUMBING" }), "POST", "/api/reports/warranty-check"],
      [
        () => backendReports.create({ mediaKeys: ["k"], category: "PLUMBING", problemText: "leak" }),
        "POST",
        "/api/reports",
      ],
      [() => backendReports.list(), "GET", "/api/reports"],
      [() => backendReports.getById("r1"), "GET", "/api/reports/r1"],
      [() => backendReports.getTimeline("r1"), "GET", "/api/reports/r1/timeline"],
      [() => backendReports.approve("r1", { rating: 5 }), "POST", "/api/reports/r1/approve"],
      [() => backendReports.reopen("r1", { reason: "still broken" }), "POST", "/api/reports/r1/reopen"],
    ];

    for (const [call, method, path] of calls) {
      stub.reply(envelope({}));
      await call();
      expect(stub.last().method).toBe(method);
      expect(pathOf(stub.last())).toBe(path);
    }

    expect(TASK_2_DOMAINS.reports).toHaveLength(calls.length);
  });

  it("serializes status and priority as ONE comma-separated value, as the schema splits it", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendReports.list({
      status: ["ROUTING_PENDING", "ROUTED"],
      priority: ["HIGH", "MEDIUM"],
      page: 3,
      pageSize: 50,
      q: "  leak  ",
    });
    expect(queryOf(stub.last())).toEqual({
      status: "ROUTING_PENDING,ROUTED",
      priority: "HIGH,MEDIUM",
      page: "3",
      pageSize: "50",
      q: "leak",
    });
  });

  it("omits empty status/priority arrays rather than sending an empty filter", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendReports.list({ status: [], priority: [], q: "   " });
    expect(queryOf(stub.last())).toEqual({});
  });

  it("never sends a technicianId, warrantyVerdict, status or unitId on create", async () => {
    stub.reply(envelope({ id: "r1", reportNumber: 1 }, 201));
    await backendReports.create({
      mediaKeys: ["k1"],
      category: "PLUMBING",
      problemText: "leak",
      analysisId: "a1",
      categoryConfirmedByUser: true,
    });
    const body = stub.last().body as Record<string, unknown>;
    // Routing is automatic and the verdict is snapshotted server-side; these
    // fields are not merely ignored by the Backend, they are inexpressible.
    for (const forbidden of ["technicianId", "warrantyVerdict", "status", "unitId", "projectId", "priority"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(body).toEqual({
      mediaKeys: ["k1"],
      category: "PLUMBING",
      problemText: "leak",
      analysisId: "a1",
      categoryConfirmedByUser: true,
    });
  });

  it("surfaces AI_ANALYSIS_UNAVAILABLE as a real error, never as a result", async () => {
    stub.reply(errorEnvelope(503, "AI_ANALYSIS_UNAVAILABLE", "not available"));
    await expect(backendReports.analyze({ mediaKeys: ["k"] })).rejects.toMatchObject({
      errorCode: "AI_ANALYSIS_UNAVAILABLE",
      httpStatus: 503,
    });
  });

  it("surfaces a foreign report's 404 rather than inventing an empty report", async () => {
    stub.reply(errorEnvelope(404, "NOT_FOUND", "Report not found"));
    await expect(backendReports.getById("someone-elses-report")).rejects.toMatchObject({
      errorCode: "NOT_FOUND",
      httpStatus: 404,
    });
  });
});
