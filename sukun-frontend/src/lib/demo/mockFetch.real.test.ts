/**
 * The mock-mode boundary, from the real-mode side: with Demo Mode disabled,
 * `withDemoFallback` must be a pure passthrough. A failed production request has
 * to reach the caller as an error so the screen shows its existing error state —
 * fixture data must never stand in for a real response.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo/config", () => ({ DEMO_MODE: false }));

import { withDemoFallback } from "./mockFetch";
import { DEMO_PROJECTS } from "./projectsFixtures";
import { PROJECTS as DISCOVERY_PROJECTS } from "./discoveryFixtures";

describe("withDemoFallback outside Demo Mode", () => {
  it("returns the real value untouched on success", async () => {
    await expect(withDemoFallback(async () => ["real"], ["fixture"])).resolves.toEqual(["real"]);
  });

  it("re-throws the real error instead of substituting fixtures", async () => {
    const boom = new Error("500 from the backend");
    await expect(withDemoFallback(async () => { throw boom; }, ["fixture"])).rejects.toBe(boom);
  });

  it("never evaluates the fixture factory on the failure path", async () => {
    const factory = vi.fn(() => ["fixture"]);
    await expect(
      withDemoFallback(async () => { throw new Error("down"); }, factory),
    ).rejects.toThrow("down");
    expect(factory).not.toHaveBeenCalled();
  });

  it("does not evaluate the fixture factory on the success path either", async () => {
    const factory = vi.fn(() => ["fixture"]);
    await withDemoFallback(async () => ["real"], factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it("keeps every fixture record present in the bundle — preserved, not deleted", () => {
    // Task 1's mock-data requirement: no fixture file is deleted, renamed,
    // rewritten, minimized or relocated. Real mode simply never reads them.
    expect(DEMO_PROJECTS.length).toBeGreaterThan(0);
    expect(DISCOVERY_PROJECTS.length).toBeGreaterThan(0);
  });
});
