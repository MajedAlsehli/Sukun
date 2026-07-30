"use client";

/**
 * H6's data layer — real homeowner activation.
 *
 *   lib/backend/homeowners.ts#activate -> lib/adapters/session.ts -> THIS
 *     -> unchanged OwnerOnboardingScreen
 *
 * On success the Backend does three things in one response: it consumes the
 * one-time code, promotes the user to `HOMEOWNER`, and sets a fresh refresh
 * cookie. So the frontend adopts that session VERBATIM — access token into the
 * in-memory store, view model into `AuthContext` — and the route that follows is
 * decided by the SERVER-DERIVED `role`, which is now `homeowner_active`.
 *
 * The `sakn_homeowner_activated` localStorage flag is never written in real
 * mode. It survives only for Demo Mode's synthetic journey (`AuthContext`'s
 * `markHomeownerActivated` is already a no-op outside Demo Mode, from Task 1).
 *
 * ── Known Task 3 blocker ───────────────────────────────────────────────────
 * `activateHomeownerSchema` requires `{ code, password }` — activation is also
 * the moment the customer sets their password (Decision 013). The APPROVED H6
 * screen collects only a code: it has no password field and no password step,
 * and adding one is a frozen-design change. Real-mode activation therefore
 * reaches the Backend and is refused with `VALIDATION_ERROR`, which this hook
 * maps onto the screen's EXISTING `server` result card. Resolving it needs
 * either a Backend change (accept an authenticated `homeowner_pending`
 * principal without a password) or an approved UI addition — recorded, not
 * worked around, and never papered over with a fabricated credential.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { backendHomeowners } from "@/lib/backend/homeowners";
import type { SessionResponseDto } from "@/lib/backend/auth";
import { toSessionWithToken } from "@/lib/adapters/session";
import { ApiError } from "@/lib/backend/errors";

/** The six failure cards the frozen result screen already renders. */
export type ActivationResultKey =
  | "invalid"
  | "expired"
  | "linked"
  | "notfound"
  | "devnotfound"
  | "server";

/**
 * The Backend's own error codes, mapped onto the screen's existing cards. No
 * new card, no new copy — an unmapped code falls through to `server`, which is
 * the honest "something went wrong on our side" state.
 */
export function activationResultFor(err: unknown): ActivationResultKey {
  if (!(err instanceof ApiError)) return "server";
  switch (err.errorCode) {
    case "INVALID_ACTIVATION_CODE":
      return "invalid";
    case "ACTIVATION_CODE_EXPIRED":
      return "expired";
    case "ACTIVATION_CODE_ALREADY_USED":
    case "UNIT_ALREADY_OWNED":
      return "linked";
    case "NOT_FOUND":
      return "notfound";
    case "ACCOUNT_DEACTIVATED":
    case "INVALID_STATE_TRANSITION":
    case "VALIDATION_ERROR":
    case "TOO_MANY_REQUESTS":
    default:
      return "server";
  }
}

export interface ActivationResult {
  submitting: boolean;
  /** `null` until an attempt settles. */
  outcome: "success" | ActivationResultKey | null;
  /**
   * The real session response the Backend minted, for the caller to hand
   * straight to `AuthContext#setBackendSession`. Present only on success. The
   * route that follows is then decided by the SERVER-DERIVED `role`, which the
   * activation transaction has already promoted to `homeowner_active`.
   */
  session: SessionResponseDto | null;
  activate: (code: string, password: string) => Promise<"success" | ActivationResultKey>;
  reset: () => void;
}

export function useActivation(): ActivationResult {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"success" | ActivationResultKey | null>(null);
  const [session, setSession] = useState<SessionResponseDto | null>(null);

  const activate = useCallback(
    async (code: string, password: string): Promise<"success" | ActivationResultKey> => {
      // Demo Mode never reaches the network; the approved screen's own local
      // `resolveCode` continues to drive its synthetic journey.
      if (DEMO_MODE) {
        setOutcome("success");
        return "success";
      }
      setSubmitting(true);
      setSession(null);
      try {
        const dto = await backendHomeowners.activate({ code: code.trim(), password });
        // Validated at the adapter, never in a component: a malformed session
        // must fail here rather than half-adopted into the auth state.
        toSessionWithToken(dto);
        setSession(dto);
        setOutcome("success");
        return "success";
      } catch (err) {
        const key = activationResultFor(err);
        setOutcome(key);
        return key;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setOutcome(null);
    setSession(null);
  }, []);

  return { submitting, outcome, session, activate, reset };
}
