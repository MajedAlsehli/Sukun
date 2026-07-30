import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaknApiClient } from "./client";
import { ApiError, BackendErrorCode, NetworkError } from "./errors";
import { setAccessToken } from "./session";

const BASE = "https://sakn-backend.vercel.app/api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function success<T>(data: T, status = 200) {
  return jsonResponse(status, { success: true, requestId: "req-1", data });
}

function failure(status: number, errorCode: string, message = "boom", details?: unknown) {
  return jsonResponse(status, {
    success: false,
    requestId: "req-err",
    errorCode,
    message,
    ...(details ? { details } : {}),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function lastInit(call = 0): RequestInit {
  return fetchMock.mock.calls[call][1] as RequestInit;
}
function lastUrl(call = 0): string {
  return fetchMock.mock.calls[call][0] as string;
}
function headerOn(call: number, name: string): string | null {
  return (lastInit(call).headers as Headers).get(name);
}

/** Awaits a call that must reject and returns the thrown error, typed. */
async function captureError(promise: Promise<unknown>): Promise<ApiError & NetworkError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError & NetworkError;
  }
  throw new Error("expected the request to reject, but it resolved");
}

describe("transport", () => {
  it("sends credentials: 'include' on every request so the httpOnly refresh cookie travels", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success({ ok: true }));

    await client.get("/auth/me");
    await client.post("/reports", { a: 1 });
    await client.patch("/reports/1", { a: 1 });
    await client.delete("/discovery/saved/1");
    await client.postForm("/reports/media", new FormData());

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).credentials).toBe("include");
    }
  });

  it("builds every URL from the normalized base", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success(null));
    await client.get("/auth/me");
    expect(lastUrl()).toBe(`${BASE}/auth/me`);
    expect(lastUrl()).not.toContain("/api/api");
  });

  it("injects the in-memory access token and nothing else", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success(null));

    await client.get("/auth/me");
    expect(headerOn(0, "Authorization")).toBeNull();

    setAccessToken("access-abc");
    await client.get("/auth/me");
    expect(headerOn(1, "Authorization")).toBe("Bearer access-abc");
  });

  it("sets JSON content-type for bodies but never for FormData", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success(null));

    await client.post("/x", { a: 1 });
    expect(headerOn(0, "Content-Type")).toBe("application/json");

    await client.postForm("/y", new FormData());
    expect(headerOn(1, "Content-Type")).toBeNull();
  });

  it("appends and URL-encodes query params, dropping null/undefined", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success(null));
    await client.get("/reports", { query: { status: "OPEN", page: 2, q: undefined, x: null } });
    expect(lastUrl()).toBe(`${BASE}/reports?status=OPEN&page=2`);
  });

  it("passes an AbortSignal through and re-throws an abort unchanged", async () => {
    const client = new SaknApiClient(BASE);
    const controller = new AbortController();
    fetchMock.mockImplementation(() => success(null));
    await client.get("/auth/me", { signal: controller.signal });
    expect(lastInit().signal).toBe(controller.signal);

    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(client.get("/auth/me", { signal: controller.signal })).rejects.toBeInstanceOf(
      DOMException,
    );
  });
});

describe("envelope and error mapping", () => {
  it("unwraps a success envelope to its `data`", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => success({ userId: "u1" }));
    await expect(client.get("/auth/me")).resolves.toEqual({ userId: "u1" });
  });

  it("maps an error envelope onto ApiError, carrying code, status, requestId and details", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() =>
      failure(409, "ACTIVE_REPAIR_EXISTS", "already busy", { blockingReportId: "r9" }),
    );
    const err = await captureError(client.post("/reports/1/start"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorCode).toBe("ACTIVE_REPAIR_EXISTS");
    expect(err.httpStatus).toBe(409);
    expect(err.requestId).toBe("req-err");
    expect(err.details).toEqual({ blockingReportId: "r9" });
  });

  it("maps a non-envelope error body onto UNKNOWN_ERROR rather than rendering it raw", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const err = await captureError(client.get("/auth/me"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorCode).toBe(BackendErrorCode.UNKNOWN_ERROR);
    expect(err.httpStatus).toBe(502);
    expect(err.message).not.toContain("Bad Gateway");
  });

  it("maps a fetch rejection onto NetworkError with Arabic copy", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await captureError(client.get("/auth/me"));
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toMatch(/تعذّر الاتصال/);
  });
});

describe("401 recovery", () => {
  it("issues ONE shared refresh for concurrent 401s and retries each request once", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 10)),
    );
    const onSessionExpired = vi.fn();
    client.setSessionHooks({ refresh, onSessionExpired });

    // Three concurrent calls, each 401 first then 200.
    fetchMock
      .mockImplementationOnce(() => failure(401, "INVALID_TOKEN"))
      .mockImplementationOnce(() => failure(401, "INVALID_TOKEN"))
      .mockImplementationOnce(() => failure(401, "INVALID_TOKEN"))
      .mockImplementation(() => success({ ok: true }));

    const results = await Promise.all([
      client.get("/a"),
      client.get("/b"),
      client.get("/c"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    // 3 originals + 3 retries, no more.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("retries at most once — a retry that also 401s does not refresh again", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockResolvedValue(true);
    const onSessionExpired = vi.fn();
    client.setSessionHooks({ refresh, onSessionExpired });

    fetchMock.mockImplementation(() => failure(401, "INVALID_TOKEN"));

    const err = await captureError(client.get("/a"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.httpStatus).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + exactly one retry
  });

  it("clears the session exactly once and surfaces the error when refresh fails", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockResolvedValue(false);
    const onSessionExpired = vi.fn();
    client.setSessionHooks({ refresh, onSessionExpired });

    fetchMock.mockImplementation(() => failure(401, "INVALID_TOKEN"));

    const err = await captureError(client.get("/a"));
    expect(err).toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry after a failed refresh
  });

  it("treats a rejected refresh as a failed refresh, not an unhandled error", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockRejectedValue(new Error("network down"));
    const onSessionExpired = vi.fn();
    client.setSessionHooks({ refresh, onSessionExpired });
    fetchMock.mockImplementation(() => failure(401, "INVALID_TOKEN"));

    await expect(client.get("/a")).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a refresh for a call that opted out (the auth endpoints)", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockResolvedValue(true);
    const onSessionExpired = vi.fn();
    client.setSessionHooks({ refresh, onSessionExpired });

    fetchMock.mockImplementation(() => failure(401, "INVALID_TOKEN"));
    await expect(client.post("/auth/refresh", undefined, { skipAuthRefresh: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("starts a fresh single-flight refresh for a later 401 (single-flight, not once-per-process)", async () => {
    const client = new SaknApiClient(BASE);
    const refresh = vi.fn().mockResolvedValue(true);
    client.setSessionHooks({ refresh, onSessionExpired: vi.fn() });

    fetchMock
      .mockImplementationOnce(() => failure(401, "INVALID_TOKEN"))
      .mockImplementationOnce(() => success({ ok: 1 }))
      .mockImplementationOnce(() => failure(401, "INVALID_TOKEN"))
      .mockImplementationOnce(() => success({ ok: 2 }));

    await client.get("/a");
    await client.get("/b");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never enters the refresh path with no session hooks wired", async () => {
    const client = new SaknApiClient(BASE);
    fetchMock.mockImplementation(() => failure(401, "AUTH_REQUIRED"));
    await expect(client.get("/a")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
