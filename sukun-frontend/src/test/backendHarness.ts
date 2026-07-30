/**
 * The shared stub every Task 2 domain/adapter/hook test drives.
 *
 * There is no network here and no real Backend: each test enqueues the exact
 * envelope `sakn-backend/src/shared/response.ts` would produce and then asserts
 * on the request that was made. That is deliberate — the point of these tests is
 * that the CLIENT sends the right thing and maps the response honestly, which a
 * live server would make slower and less deterministic, not more true.
 */

import { vi } from "vitest";

export interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
  signal: AbortSignal | null | undefined;
  credentials: RequestCredentials | undefined;
}

export function envelope<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, requestId: "req-test", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorEnvelope(
  status: number,
  errorCode: string,
  message = "boom",
  details?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ success: false, requestId: "req-err", errorCode, message, ...(details ? { details } : {}) }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

export interface BackendStub {
  fetchMock: ReturnType<typeof vi.fn>;
  /** Every request the code under test issued, in order. */
  requests: CapturedRequest[];
  /** Queue one response. Responses are consumed in order. */
  reply: (response: Response | (() => Response | Promise<Response>)) => void;
  /** Queue a rejection (a transport failure, not a server response). */
  rejectWith: (err: unknown) => void;
  last: () => CapturedRequest;
  at: (index: number) => CapturedRequest;
}

/**
 * Installs a `fetch` stub that records every call and answers from a queue.
 * An empty queue is an explicit failure rather than a silent `undefined` —
 * a test that fires an unexpected request should say so loudly.
 */
export function installBackendStub(): BackendStub {
  const requests: CapturedRequest[] = [];
  const queue: Array<() => Response | Promise<Response>> = [];

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    let body: unknown = null;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init.body != null) {
      body = init.body;
    }

    requests.push({
      url,
      method: init.method ?? "GET",
      body,
      headers: init.headers instanceof Headers ? init.headers : new Headers(init.headers ?? {}),
      signal: init.signal,
      credentials: init.credentials,
    });

    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url}`);
    return next();
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    requests,
    reply: (response) => queue.push(typeof response === "function" ? response : () => response),
    rejectWith: (err) =>
      queue.push(() => {
        throw err;
      }),
    last: () => requests[requests.length - 1],
    at: (index) => requests[index],
  };
}

/**
 * A ROUTE-matched variant of the stub above.
 *
 * `installBackendStub` answers from an ordered queue, which is exactly right
 * for a single-request adapter test and unusable for a screen: a rendered
 * component fires several requests concurrently and their order is a detail of
 * React's scheduling, not of the behaviour under test. This variant answers by
 * `METHOD path-substring` instead, so a test declares what each endpoint
 * returns and stays indifferent to the order they are called in.
 *
 * An unmatched request is still a loud failure, never a silent `undefined`.
 */
export interface RoutedBackendStub {
  fetchMock: ReturnType<typeof vi.fn>;
  requests: CapturedRequest[];
  /** Register a handler. The most recently registered match wins. */
  on: (method: string, pathIncludes: string, handler: () => Response | Promise<Response>) => void;
  /** Every request issued so far, as `{ method, path }`. */
  calls: Array<{ method: string; path: string }>;
}

export function installRoutedBackendStub(): RoutedBackendStub {
  const requests: CapturedRequest[] = [];
  const routes: Array<{ method: string; path: string; handler: () => Response | Promise<Response> }> = [];

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    let body: unknown = null;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init.body != null) {
      body = init.body;
    }

    const method = (init.method ?? "GET").toUpperCase();
    requests.push({
      url,
      method,
      body,
      headers: init.headers instanceof Headers ? init.headers : new Headers(init.headers ?? {}),
      signal: init.signal,
      credentials: init.credentials,
    });

    const path = new URL(url, "https://example.test").pathname;
    for (let i = routes.length - 1; i >= 0; i -= 1) {
      const route = routes[i];
      if (route.method === method && path.includes(route.path)) return route.handler();
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    requests,
    on: (method, pathIncludes, handler) =>
      routes.push({ method: method.toUpperCase(), path: pathIncludes, handler }),
    get calls() {
      return requests.map((r) => ({
        method: r.method,
        path: new URL(r.url, "https://example.test").pathname,
      }));
    },
  } as RoutedBackendStub;
}

/** Parses the query string of a captured request into a plain object. */
export function queryOf(request: CapturedRequest): Record<string, string> {
  const url = new URL(request.url, "https://example.test");
  return Object.fromEntries(url.searchParams.entries());
}

/** The path portion, so assertions do not depend on the configured base URL. */
export function pathOf(request: CapturedRequest): string {
  return new URL(request.url, "https://example.test").pathname;
}
