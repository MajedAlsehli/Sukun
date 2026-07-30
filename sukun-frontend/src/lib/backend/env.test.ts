import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE_URL, joinApiPath, normalizeApiBaseUrl } from "./env";

describe("API base URL normalization", () => {
  it("falls back to the same-origin /api mount when unset", () => {
    expect(normalizeApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl(null)).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl("")).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl("   ")).toBe(DEFAULT_API_BASE_URL);
  });

  it("appends exactly one /api to a bare origin", () => {
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
    expect(normalizeApiBaseUrl("http://localhost:4000")).toBe("http://localhost:4000/api");
  });

  it("does not double the prefix when the variable already ends in /api", () => {
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/api")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/api/")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/api///")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
  });

  it("collapses an already-doubled prefix rather than compounding it", () => {
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/api/api")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
    expect(normalizeApiBaseUrl("https://sakn-backend.vercel.app/api/api/api/")).toBe(
      "https://sakn-backend.vercel.app/api",
    );
  });

  it("handles the relative same-origin spellings", () => {
    expect(normalizeApiBaseUrl("/api")).toBe("/api");
    expect(normalizeApiBaseUrl("/api/")).toBe("/api");
  });
});

describe("joinApiPath", () => {
  const base = "https://sakn-backend.vercel.app/api";

  it("joins a caller path that already has a leading slash", () => {
    expect(joinApiPath(base, "/auth/login")).toBe("https://sakn-backend.vercel.app/api/auth/login");
  });

  it("joins a caller path with no leading slash", () => {
    expect(joinApiPath(base, "auth/login")).toBe("https://sakn-backend.vercel.app/api/auth/login");
  });

  it("never produces /api/api for a caller path that mistakenly repeats the prefix", () => {
    // The caller contract is "no /api prefix". If one slips in, it is still a
    // single prefix on the base — the failure mode is a 404, never a silently
    // wrong origin.
    expect(joinApiPath("https://sakn-backend.vercel.app/api", "/auth/login")).not.toContain(
      "/api/api/auth",
    );
  });

  it("passes an absolute URL through untouched (signed media links)", () => {
    const signed = "https://project.supabase.co/storage/v1/object/sign/sakn-private/x?token=y";
    expect(joinApiPath(base, signed)).toBe(signed);
  });
});
