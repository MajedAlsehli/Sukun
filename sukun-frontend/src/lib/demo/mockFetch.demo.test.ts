/**
 * The mock-mode boundary, from the Demo Mode side: the Showcase keeps its
 * "attempt the real call, fall back to the fixture" behaviour exactly as before.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo/config", () => ({ DEMO_MODE: true }));

import { withDemoFallback } from "./mockFetch";

describe("withDemoFallback inside Demo Mode", () => {
  it("prefers a real response when one is available", async () => {
    await expect(withDemoFallback(async () => ["real"], ["fixture"])).resolves.toEqual(["real"]);
  });

  it("falls back to the fixture when the real call fails", async () => {
    await expect(
      withDemoFallback(async () => { throw new Error("CORS"); }, ["fixture"]),
    ).resolves.toEqual(["fixture"]);
  });

  it("supports a lazy fixture factory", async () => {
    const factory = vi.fn(() => ["lazy"]);
    await expect(withDemoFallback(async () => { throw new Error("x"); }, factory)).resolves.toEqual([
      "lazy",
    ]);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
