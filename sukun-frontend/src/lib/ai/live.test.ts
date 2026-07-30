/**
 * The live AI path: real private-Storage staging, real YOLO/OpenAI analysis,
 * real server-computed warranty rules.
 *
 * The properties under test are the ones that make this integration honest
 * rather than merely working:
 *
 *  * an unavailable provider REJECTS — it never returns a plausible result;
 *  * no image bytes and no credential leave this module except as the request
 *    body the Backend asked for;
 *  * the report and the analysis are pinned to the SAME staged media.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBackendStub, envelope, errorEnvelope, pathOf, type BackendStub } from "@/test/backendHarness";
import { liveAi, stageMedia, stagedKeysFor, forgetStagedKeys, assertUploadableMimeType } from "./live";
import { ApiError } from "@/lib/backend/errors";

let stub: BackendStub;
beforeEach(() => {
  stub = installBackendStub();
});

/** A real `File` whose bytes jsdom's FileReader will base64-encode for us. */
function imageFile(name = "defect.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

describe("media staging", () => {
  it("stages each photo through POST /reports/media and keeps only the server's key", async () => {
    stub.reply(envelope({ key: "reports/staging/u1/a.jpg", url: "https://signed/a", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    stub.reply(envelope({ key: "reports/staging/u1/b.jpg", url: "https://signed/b", mimeType: "image/jpeg", sizeBytes: 4 }, 201));

    const staged = await stageMedia([imageFile("a.jpg"), imageFile("b.jpg")]);

    expect(stub.requests).toHaveLength(2);
    expect(pathOf(stub.at(0))).toBe("/api/reports/media");
    expect(staged.map((s) => s.key)).toEqual(["reports/staging/u1/a.jpg", "reports/staging/u1/b.jpg"]);
    // The signed URL is short-lived; the KEY is what the report cites.
    expect(staged[0].url).toBe("https://signed/a");
  });

  it("sends raw base64, never a data: URI", async () => {
    stub.reply(envelope({ key: "k", url: "u", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    await stageMedia([imageFile()]);
    const body = stub.last().body as { contentBase64: string; fileName: string; mimeType: string };
    expect(body.contentBase64).not.toContain("data:");
    expect(body.contentBase64).not.toContain(";base64,");
    expect(body.mimeType).toBe("image/jpeg");
    expect(body.fileName).toBe("defect.jpg");
  });

  it("refuses a mime type the Backend cannot store, before uploading anything", async () => {
    await expect(stageMedia([imageFile("x.gif", "image/gif")])).rejects.toBeInstanceOf(ApiError);
    expect(stub.requests).toHaveLength(0);
    expect(() => assertUploadableMimeType("image/webp")).not.toThrow();
    expect(() => assertUploadableMimeType("application/pdf")).toThrow();
  });

  it("uploads sequentially, so a partial failure names the photo that failed", async () => {
    stub.reply(envelope({ key: "k1", url: "u", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    stub.reply(errorEnvelope(413, "VALIDATION_ERROR", "too large"));
    await expect(stageMedia([imageFile("a.jpg"), imageFile("b.jpg")])).rejects.toBeInstanceOf(ApiError);
    // The third was never attempted.
    expect(stub.requests).toHaveLength(2);
  });
});

describe("analyzeDefect", () => {
  it("stages, analyzes, and maps the Backend result onto the frozen contract", async () => {
    stub.reply(envelope({ key: "staging/k1", url: "https://signed/1", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    stub.reply(
      envelope({
        analysisId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        category: "PLUMBING",
        problemText: "تسريب أسفل المغسلة",
        priority: "HIGH",
        confidence: 92,
        explanation: "أثر ماء واضح",
        provider: "openai",
        model: "gpt-4o-mini",
        detectionsAvailable: true,
      }),
    );

    const result = await liveAi.analyzeDefect({ images: [imageFile()], note: "  منذ يومين  " });

    expect(pathOf(stub.at(1))).toBe("/api/reports/analyze");
    expect(stub.at(1).body).toEqual({ mediaKeys: ["staging/k1"], note: "منذ يومين" });

    expect(result).toMatchObject({
      analysisId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      summary: "تسريب أسفل المغسلة",
      category: "سباكة",
      confidence: 92,
      severity: "عالية",
      probableCause: "أثر ماء واضح",
      model: "gpt-4o-mini",
      source: "live",
    });
    // The analyze response reports only WHETHER detection contributed, never
    // the boxes — so there is no overlay to draw and none is invented.
    expect(result.boundingBox).toBeNull();
    expect(result.recommendedActions).toEqual([]);
    // The report must cite the same media the analysis ran over.
    expect(stagedKeysFor(result.analysisId)).toEqual(["staging/k1"]);
    forgetStagedKeys(result.analysisId);
  });

  it("maps every backend priority onto an approved severity", async () => {
    for (const [priority, severity] of [["LOW", "منخفضة"], ["MEDIUM", "متوسطة"], ["HIGH", "عالية"]] as const) {
      stub.reply(envelope({ key: "k", url: "u", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
      stub.reply(envelope({ analysisId: `id-${priority}`, category: "OTHER", problemText: "x", priority, confidence: 1, explanation: null, provider: "p", model: "m", detectionsAvailable: false }));
      const result = await liveAi.analyzeDefect({ images: [imageFile()] });
      expect(result.severity).toBe(severity);
      forgetStagedKeys(result.analysisId);
    }
  });

  it("REJECTS when the analysis provider is unavailable — never a mocked result", async () => {
    stub.reply(envelope({ key: "k", url: "u", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    stub.reply(errorEnvelope(503, "AI_ANALYSIS_UNAVAILABLE", "not configured"));
    await expect(liveAi.analyzeDefect({ images: [imageFile()] })).rejects.toMatchObject({
      errorCode: "AI_ANALYSIS_UNAVAILABLE",
    });
  });

  it("REJECTS when private media storage is not configured", async () => {
    stub.reply(errorEnvelope(503, "REPORT_MEDIA_STORAGE_NOT_CONFIGURED"));
    await expect(liveAi.analyzeDefect({ images: [imageFile()] })).rejects.toMatchObject({
      errorCode: "REPORT_MEDIA_STORAGE_NOT_CONFIGURED",
    });
  });

  it("logs nothing at all — no image bytes, no keys, no URLs", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    stub.reply(envelope({ key: "k", url: "u", mimeType: "image/jpeg", sizeBytes: 4 }, 201));
    stub.reply(envelope({ analysisId: "a", category: "OTHER", problemText: "x", priority: "LOW", confidence: 1, explanation: null, provider: "p", model: "m", detectionsAvailable: false }));
    await liveAi.analyzeDefect({ images: [imageFile()] });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    forgetStagedKeys("a");
  });
});

describe("warrantyOpinion", () => {
  it("asks the real rules engine and never recomputes a duration locally", async () => {
    stub.reply(
      envelope({
        verdict: "COVERED",
        reasonCode: "COVERED",
        categoryKey: "PLUMBING",
        rulesVersion: "2026-07-28.1",
        periodStart: "2022-03-12T00:00:00.000Z",
        periodEnd: "2024-03-12T00:00:00.000Z",
        preview: true,
      }),
    );
    const result = await liveAi.warrantyOpinion({ category: "سباكة" });
    expect(pathOf(stub.last())).toBe("/api/reports/warranty-check");
    expect(stub.last().body).toEqual({ category: "PLUMBING" });
    expect(result.covered).toBe(true);
    expect(result.coverageType).toBe("سباكة");
    expect(result.coveragePeriod).toBe("2022-03-12 — 2024-03-12");
    expect(result.model).toContain("2026-07-28.1");
  });

  it("explains each real verdict specifically", async () => {
    const cases: Array<[string, string, string]> = [
      ["NOT_COVERED", "PERIOD_EXPIRED", "انتهت فترة تغطية"],
      ["NOT_COVERED", "CATEGORY_EXCLUDED", "مستثنى"],
      ["NO_WARRANTY", "NO_WARRANTY_ON_UNIT", "لا يوجد ضمان مسجّل"],
      ["NOT_CONFIGURED", "CATEGORY_NOT_CONFIGURED", "لا توجد قاعدة ضمان"],
    ];
    for (const [verdict, reasonCode, expected] of cases) {
      stub.reply(envelope({ verdict, reasonCode, categoryKey: null, rulesVersion: "v", periodStart: null, periodEnd: null, preview: true }));
      const result = await liveAi.warrantyOpinion({ category: "سباكة" });
      expect(result.covered).toBe(false);
      expect(result.rationale).toContain(expected);
    }
  });

  it("maps an unknown category onto OTHER rather than sending something the enum rejects", async () => {
    stub.reply(envelope({ verdict: "NOT_CONFIGURED", reasonCode: "CATEGORY_NOT_CONFIGURED", categoryKey: null, rulesVersion: "v", periodStart: null, periodEnd: null, preview: true }));
    await liveAi.warrantyOpinion({ category: "شيء غير معروف" });
    expect(stub.last().body).toEqual({ category: "OTHER" });
  });
});

describe("the two capabilities that genuinely do not exist", () => {
  it("compareRepair rejects rather than fabricating a repair score", async () => {
    // Task 8 shipped no before/after scoring provider. `confidence + 5` as a
    // "repair completion percentage" would be exactly the fake AI result this
    // integration must never produce.
    await expect(liveAi.compareRepair({ beforeImages: [], afterImages: [] })).rejects.toMatchObject({
      errorCode: "AI_ANALYSIS_UNAVAILABLE",
    });
    expect(stub.requests).toHaveLength(0);
  });

  it("advisorReply rejects rather than borrowing the PM's copilot", async () => {
    // `/api/pm/copilot/*` is scoped to a PM principal and is a Task 3 surface;
    // pointing a home seeker's console at it would be a role violation.
    await expect(liveAi.advisorReply({ question: "x", history: [] })).rejects.toMatchObject({
      errorCode: "AI_ANALYSIS_UNAVAILABLE",
    });
    expect(stub.requests).toHaveLength(0);
  });
});
