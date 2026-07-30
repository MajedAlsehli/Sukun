"use client";

/**
 * The one loading/empty/error primitive every Task 2 hook is built on.
 *
 * What it guarantees, so no screen has to re-implement it:
 *
 *  1. **Abort.** Every load gets a fresh `AbortController`; the previous one is
 *     aborted when the inputs change or the component unmounts.
 *  2. **No stale response.** Each load carries a monotonically increasing token
 *     and only the newest one may write state. A slow first request can never
 *     overwrite a fast second one — the classic filter-typing bug.
 *  3. **No fixture fallback.** A rejection becomes `status: "error"` and the
 *     real `ApiError`/`NetworkError`, full stop. There is no catch that
 *     substitutes demo data, in either mode: Demo Mode swaps the *source* by
 *     never calling this hook, not by rescuing a failed real call.
 *  4. **No infinite spinner.** `status` always leaves `"loading"` — on success,
 *     on failure, and on abort (which restores the previous settled status
 *     rather than hanging).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { arabicMessageFor } from "@/lib/backend/errors";
import { useSessionGate } from "@/lib/auth/AuthContext";

export type AsyncStatus = "idle" | "loading" | "ready" | "error";

export interface AsyncResource<T> {
  status: AsyncStatus;
  data: T | null;
  /** The thrown value, for callers that need the `errorCode`. */
  error: unknown;
  /** Approved Arabic copy for the thrown value. Never an English backend message. */
  errorMessage: string | null;
  /** Re-runs the loader. Safe to call from an event handler. */
  reload: () => void;
  /** Replaces the value locally after a mutation, without a round trip. */
  setData: (next: T | null) => void;
}

function isAbort(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * `enabled: false` keeps the resource `idle` and fires no request at all — the
 * shape a dependent load needs (warranty cannot run before My Home has supplied
 * a unit id) and the shape Demo Mode uses to make a domain call structurally
 * impossible rather than merely unused.
 */
export function useAsyncResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): AsyncResource<T> {
  const callerEnabled = options.enabled !== false;

  /**
   * **Nothing loads before the session question has been answered.**
   *
   * Every caller of this hook loads an AUTHENTICATED resource. Firing one while
   * the startup `POST /auth/refresh` is still in flight sends it as a guest,
   * gets a 401 that the refresh/retry path cannot rescue (the session hooks may
   * not be registered yet), and settles as a permanent error with no rerun.
   *
   * Gating on `ready` fixes both halves at once: the request is not issued
   * early, and because `sessionKey` is part of the dependency list it is issued
   * (or re-issued) the moment authentication becomes ready — and again if the
   * session identity changes.
   *
   * While waiting, the reported status is `"loading"`, never `"idle"`: a screen
   * must not read "we have not asked yet" as "there is nothing".
   */
  const session = useSessionGate();
  const waitingForSession = callerEnabled && !session.ready;
  const enabled = callerEnabled && session.ready;

  const [status, setStatus] = useState<AsyncStatus>(enabled ? "loading" : "idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // Monotonic token: only the newest in-flight load may write state.
  const tokenRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setStatus("idle");
      setData(null);
      setError(null);
      return;
    }

    const token = tokenRef.current + 1;
    tokenRef.current = token;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("loading");
    setError(null);

    loaderRef.current(controller.signal).then(
      (value) => {
        if (tokenRef.current !== token) return;
        setData(value);
        setError(null);
        setStatus("ready");
      },
      (err) => {
        if (tokenRef.current !== token) return;
        // An abort is our own cancellation, never a product failure: leave the
        // previously settled data alone and do not render an error for it.
        if (isAbort(err) || controller.signal.aborted) return;
        setError(err);
        setStatus("error");
      },
    );

    return () => controller.abort();
    // `loader` is held in a ref so an inline closure does not re-trigger.
    // `session.key` re-runs the load when authentication becomes ready and when
    // the session identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session.key, reloadKey, ...deps]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    status: waitingForSession ? "loading" : status,
    data,
    error,
    errorMessage: error ? arabicMessageFor(error) : null,
    reload,
    setData,
  };
}
