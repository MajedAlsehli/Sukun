/**
 * The typed Sakn Backend client. One base URL, one envelope parser, one error
 * type, one refresh strategy — every domain module Tasks 2 and 3 add must go
 * through this rather than calling `fetch` itself.
 *
 * Properties this file is responsible for:
 *
 *  1. `credentials: 'include'` on every request, so the browser attaches the
 *     httpOnly refresh cookie to `/auth/refresh` and `/auth/logout` (the two
 *     routes authenticated by that cookie alone) and so a credentialed CORS
 *     response is accepted at all.
 *  2. The in-memory access token (`session.ts`) as `Authorization: Bearer`.
 *     Never read from, never written to, `localStorage`.
 *  3. A 401 recovery that is exactly ONE shared refresh and ONE retry:
 *     concurrent 401s await the same in-flight refresh promise, and a retried
 *     request is never retried again. A failed refresh clears the session once
 *     and the original error is surfaced to the caller.
 *  4. No logging of tokens, cookies, passwords, image bytes, national IDs or
 *     record contents. This module contains no `console.*` call at all.
 *
 * Demo Mode is not a concept here. `lib/demo/mockFetch.ts#withDemoFallback` is
 * the only place fixtures may substitute for a real response, and it is a plain
 * passthrough whenever `NEXT_PUBLIC_DEMO_MODE !== 'true'` — so a production
 * request can never silently resolve to fixture data.
 */

import { getApiBaseUrl, joinApiPath } from "./env";
import {
  isErrorEnvelope,
  isSuccessEnvelope,
  type SaknErrorEnvelope,
} from "./envelope";
import { ApiError, BackendErrorCode, NETWORK_ERROR_MESSAGE_AR, NetworkError } from "./errors";
import { getAccessToken } from "./session";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  /** Query-string params, URL-encoded. `undefined`/`null` entries are dropped. */
  query?: Record<string, QueryValue>;
  /** Cancellation — pass an `AbortController`'s signal. Aborts are re-thrown untouched. */
  signal?: AbortSignal;
  headers?: HeadersInit;
  /**
   * Opts this call out of the shared 401 refresh/retry AND out of the
   * session-expired hook. Set by every pre-session auth endpoint
   * (`login`/`register`/`refresh`/`logout`/`forgot`/`reset`/`invitations`),
   * whose own 401 is an expected, directly-handled outcome — a guest's silent
   * restore attempt must not be mistaken for "your live session just died".
   */
  skipAuthRefresh?: boolean;
}

/** Hooks the auth layer wires once, at app start. The client owns no session state itself. */
export interface SessionHooks {
  /**
   * Performs the real `POST /auth/refresh`, stores the new access token, and
   * resolves `true` when a usable session now exists. Must never itself route
   * through the 401 recovery path (it sets `skipAuthRefresh`).
   */
  refresh: () => Promise<boolean>;
  /** Called exactly once when a refresh attempt fails — clears session + query state. */
  onSessionExpired: () => void;
}

export class SaknApiClient {
  private readonly baseUrl: string;
  private hooks: SessionHooks | null = null;
  /** The single in-flight refresh. Concurrent 401s all await this same promise. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(baseUrl: string = getApiBaseUrl()) {
    this.baseUrl = baseUrl;
  }

  /** The normalized base every request is built from — exposed for tests/diagnostics. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  setSessionHooks(hooks: SessionHooks | null): void {
    this.hooks = hooks;
  }

  /**
   * Collapses concurrent refresh attempts onto one request. The promise is
   * cleared on settle so a later 401 (after the token expires again) can start
   * a fresh one — this is single-flight, not once-per-process.
   */
  private ensureRefresh(): Promise<boolean> {
    if (!this.hooks) return Promise.resolve(false);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.hooks
        .refresh()
        .catch(() => false)
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = joinApiPath(this.baseUrl, path);
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
  }

  private buildHeaders(init: RequestInit, options: RequestOptions): Headers {
    const headers = new Headers(options.headers);
    for (const [key, value] of new Headers(init.headers ?? {}).entries()) {
      headers.set(key, value);
    }
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // FormData must set its own multipart boundary — never override it.
    const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    if (!isFormData && init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  }

  private async fetchOnce(url: string, init: RequestInit, options: RequestOptions): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: this.buildHeaders(init, options),
        signal: options.signal,
        // The refresh token lives in an httpOnly cookie the browser must send
        // back on /auth/refresh and /auth/logout; a credentialed CORS response
        // is also only accepted when the request itself was credentialed.
        credentials: "include",
      });
    } catch (cause) {
      // An abort is the caller's own decision — surface it unchanged so
      // `signal.aborted` handling upstream still works.
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new NetworkError(NETWORK_ERROR_MESSAGE_AR, { cause });
    }
  }

  private async toResult<T>(response: Response): Promise<T> {
    const rawText = await response.text();
    let payload: unknown = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        const body = payload as SaknErrorEnvelope;
        throw new ApiError(body.errorCode, body.message, response.status, body.requestId, body.details);
      }
      // A non-envelope error body (a CDN page, an empty 502) must never be
      // rendered raw — the caller maps UNKNOWN_ERROR to approved Arabic copy.
      throw new ApiError(
        BackendErrorCode.UNKNOWN_ERROR,
        `فشل الطلب بالحالة ${response.status}`,
        response.status,
      );
    }

    if (isSuccessEnvelope<T>(payload)) return payload.data;
    return payload as T;
  }

  private async send<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);

    let response = await this.fetchOnce(url, init, options);

    if (response.status === 401 && !options.skipAuthRefresh) {
      const refreshed = await this.ensureRefresh();
      if (refreshed) {
        // Exactly one retry. `buildHeaders` re-reads the (now rotated) access
        // token, and this second call can never re-enter the branch above.
        response = await this.fetchOnce(url, init, { ...options, skipAuthRefresh: true });
      } else {
        this.hooks?.onSessionExpired();
      }
    }

    return this.toResult<T>(response);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>(path, { method: "GET" }, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.send<T>(
      path,
      { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
      options,
    );
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.send<T>(
      path,
      { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) },
      options,
    );
  }

  /**
   * The current Backend exposes exactly ONE `DELETE` route —
   * `DELETE /api/discovery/saved/{projectId}` (unsaving a favourited project,
   * a reversible user preference). Every other removal in this product is a
   * `PATCH .../status`, and `sakn-backend/src/app.ts` has no other DELETE route
   * at all (decisions.md A7/D5). Do not add a second caller.
   */
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>(path, { method: "DELETE" }, options);
  }

  /** Multipart upload — report photos (H8), after-repair photos (C2), project covers (RE2). */
  postForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
    return this.send<T>(path, { method: "POST", body: form }, options);
  }

  patchForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
    return this.send<T>(path, { method: "PATCH", body: form }, options);
  }

  /**
   * Raw body download (RE4's homeowner CSV export) — the response is not a Sakn
   * JSON envelope, so it cannot go through `toResult`. Still credentialed, still
   * surfaces a proper `ApiError` on a non-2xx JSON error body rather than
   * returning a garbage blob.
   */
  async getBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
    const url = this.buildUrl(path, options.query);
    let response = await this.fetchOnce(url, { method: "GET" }, options);

    if (response.status === 401 && !options.skipAuthRefresh) {
      const refreshed = await this.ensureRefresh();
      if (refreshed) {
        response = await this.fetchOnce(url, { method: "GET" }, { ...options, skipAuthRefresh: true });
      } else {
        this.hooks?.onSessionExpired();
      }
    }

    if (!response.ok) {
      await this.toResult<never>(response); // always throws
    }
    return response.blob();
  }
}

/** App-wide singleton. Session wiring happens once, in `lib/auth/AuthContext.tsx`. */
export const apiClient = new SaknApiClient();
