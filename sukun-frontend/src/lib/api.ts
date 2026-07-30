/**
 * **Legacy / Demo Mode helper module.** Preserved in full — nothing here is
 * deleted, renamed, relocated or minimized.
 *
 * Task 1 of the Backend integration replaced the *real-mode* authentication and
 * transport layer with `lib/backend/*` (one normalized base URL, one envelope
 * parser, one `ApiError`, an in-memory access token, an httpOnly refresh cookie,
 * and a single-flight 401 refresh/retry). What remains in this file is:
 *
 *  - **Still live in both modes:** `authorizedRequest` (now a thin delegate to
 *    `lib/backend/client.ts`, so it inherits base-URL normalization, cookie
 *    credentials, the in-memory token and the shared refresh) and the
 *    `PublicUser` / `UserRole` types the frozen screens read.
 *  - **Demo Mode only:** `storeDemoSession`, `isDemoSessionStored`, the
 *    user-id-keyed `sakn_homeowner_activated` / `sakn_owner_intent` flags, the
 *    `sakn_pending_journey` record, and `logout()`'s local-clear behaviour.
 *    These back the Demo Role Switcher's six synthetic journeys and must keep
 *    working with no backend at all.
 *  - **Superseded, kept for reference and for Demo Mode:** `login`,
 *    `registerHomeSeeker`, `requestPasswordReset`, `resetPassword` and
 *    `refreshTokens` describe the Task-1-era token-pair contract
 *    (`{tokens:{accessToken,refreshToken}}`, `POST /auth/password-reset`). The
 *    Backend on disk does not implement that shape — see
 *    `lib/backend/auth.ts` for the current one. No real-mode code path calls
 *    them any more.
 *
 * The comments below that describe the Backend as lacking `/me`, refresh
 * cookies or homeowner activation were accurate when written and are no longer:
 * `GET /api/auth/me`, the `sakn_refresh_token` httpOnly cookie and
 * `POST /api/homeowners/activate` all exist. They are left in place rather than
 * rewritten so the historical record of what changed stays legible; treat
 * `docs/integration/backend-contract-map.md` as authoritative.
 */

import { DEMO_MODE } from "@/lib/demo/config";
import { apiClient } from "@/lib/backend/client";

/** backend/src/shared/http/errorCodes.ts — the AUTH and VALIDATION error codes this client can receive. */
export const ErrorCode = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_TOKEN: "INVALID_TOKEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCESS_DENIED: "ACCESS_DENIED",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  PHONE_ALREADY_EXISTS: "PHONE_ALREADY_EXISTS",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/**
 * Legacy, un-normalized base used only by `request()` below, which in turn is
 * called only by the deprecated Task-1-era auth helpers. Real traffic resolves
 * its base once, in `lib/backend/env.ts#normalizeApiBaseUrl`, which guarantees a
 * single `/api` segment regardless of how the variable is spelled.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ApiErrorBody {
  success: false;
  requestId: string;
  errorCode: string;
  message: string;
  message_ar?: string;
  field?: string;
}

export class ApiError extends Error {
  errorCode: string;
  field?: string;

  constructor(body: ApiErrorBody) {
    super(body.message_ar ?? body.message);
    this.name = "ApiError";
    this.errorCode = body.errorCode;
    this.field = body.field;
  }
}

async function request<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.authToken) headers.Authorization = `Bearer ${opts.authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new ApiError(json as ApiErrorBody);
  }

  return (json as { data: T }).data;
}

/**
 * `request`'s counterpart for every non-Auth module (Projects, Buildings,
 * Units, ...): arbitrary method, always bearer-authenticated.
 *
 * **Rewired in Task 1 to delegate to `lib/backend/client.ts`.** The signature,
 * the call sites (`lib/projects.ts`, `lib/visits.ts`, `lib/units.ts`,
 * `lib/buildings.ts`) and the "throws on any non-2xx" contract are unchanged;
 * what it now inherits is the normalized base URL, `credentials: 'include'`,
 * the in-memory access token, and the one shared 401 refresh + single retry.
 *
 * Demo Mode behaviour is unchanged in substance: there is no real access token
 * in a synthetic session, so the call still fails against the real Backend and
 * `lib/demo/mockFetch.ts#withDemoFallback` still supplies the fixture — exactly
 * as it did when the demo sentinel token was sent and rejected. Outside Demo
 * Mode `withDemoFallback` is a passthrough, so a real error still throws and no
 * fixture is ever substituted.
 */
export async function authorizedRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  switch (method) {
    case "GET":
      return apiClient.get<T>(path);
    case "POST":
      return apiClient.post<T>(path, body);
    case "PATCH":
      return apiClient.patch<T>(path, body);
  }
}

/** backend/src/users/user.types.ts#UserRole. */
export type UserRole = "HOME_SEEKER" | "HOMEOWNER" | "TECHNICIAN" | "PROJECT_MANAGER" | "COMPANY";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: "active" | "inactive";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface RegisterResult {
  user: PublicUser;
  searchJourney: unknown;
  tokens: TokenPair;
}

export interface LoginResult {
  user: PublicUser;
  tokens: TokenPair;
}

/**
 * The backend's `phone` field requires the local `05XXXXXXXX` shape
 * (auth.dto.ts's SAUDI_MOBILE_REGEX) while the signup screen's placeholder
 * shows the international `+9665xxxxxxxx` form — normalize here rather than
 * changing the visible input, so the existing UI is untouched.
 */
export function normalizeSaudiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("9665")) return `0${digits.slice(3)}`;
  if (digits.startsWith("05")) return digits;
  if (digits.startsWith("5") && digits.length === 9) return `0${digits}`;
  return raw;
}

/** @deprecated Superseded by `lib/backend/auth.ts#backendAuth.register` — the current Backend returns a session DTO, not a token pair. No real-mode caller. */
export function registerHomeSeeker(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<RegisterResult> {
  return request<RegisterResult>("/auth/register", {
    ...input,
    phone: normalizeSaudiPhone(input.phone),
  });
}

/** @deprecated Superseded by `lib/backend/auth.ts#backendAuth.login`. The current Backend's `loginSchema` takes `{email, password}` and answers with a session DTO. No real-mode caller. */
export function login(input: { identifier: string; password: string }): Promise<LoginResult> {
  return request<LoginResult>("/auth/login", input);
}

/** @deprecated `POST /auth/password-reset` does not exist on the current Backend; the real route is `POST /api/auth/forgot-password` (`backendAuth.requestPasswordReset`). No real-mode caller. */
export function requestPasswordReset(input: { email: string }): Promise<null> {
  return request<null>("/auth/password-reset", input);
}

/** @deprecated Superseded by `lib/backend/auth.ts#backendAuth.resetPassword` (same route, current envelope/error handling). No real-mode caller. */
export function resetPassword(input: { token: string; newPassword: string }): Promise<null> {
  return request<null>("/auth/reset-password", input);
}

const ACCESS_TOKEN_KEY = "sakn_access_token";
const REFRESH_TOKEN_KEY = "sakn_refresh_token";
const USER_KEY = "sakn_user";

/**
 * @deprecated Task-1-era token-pair persistence. **Refuses to run in real
 * mode.**
 *
 * The current Backend architecture never puts a refresh token in a response
 * body at all — it is an opaque, rotating, single-use value in an httpOnly,
 * `/api/auth`-scoped cookie JavaScript cannot read
 * (`sakn-backend/src/auth/refreshCookie.ts`, decisions.md D1/K2) — and the
 * 15-minute access token lives in memory only (`lib/backend/session.ts`).
 * Persisting either one would hand an XSS a durable credential and would not
 * even work, since no refresh token reaches this code to persist.
 *
 * The body is kept intact for Demo Mode, where the "token" is
 * `storeDemoSession`'s non-secret sentinel. The real-mode throw is a structural
 * guarantee that no future edit can quietly reintroduce token persistence: as
 * of Task 1 there is no real-mode caller.
 */
export function storeTokens(tokens: TokenPair): void {
  if (!DEMO_MODE) {
    throw new Error(
      "storeTokens is Demo Mode only. In real mode the access token is held in memory " +
        "(lib/backend/session.ts) and the refresh token lives in an httpOnly cookie.",
    );
  }
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * `PublicUser` (with its `role`) is only ever returned in a register/login
 * response body — there is no `/me` endpoint yet to re-fetch it — so it must
 * be persisted alongside the tokens or a page reload has no way to know who
 * is signed in. `AuthContext` is the only reader of this.
 */
export function storeUser(user: PublicUser): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): PublicUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function clearUser(): void {
  window.localStorage.removeItem(USER_KEY);
}

const HOMEOWNER_ACTIVATED_KEY = "sakn_homeowner_activated";
const OWNER_INTENT_KEY = "sakn_owner_intent";

/**
 * Both flags below stand in for account fields a real backend would return
 * on login (Task 011 Homeowner Activation is unbuilt, and there is no `/me`
 * endpoint to re-fetch from) — so they are stored **keyed by user id**, not
 * as bare booleans.
 *
 * Keying matters for correctness, not tidiness: as plain booleans they had
 * to be wiped on logout to stop the next person signing in on the same
 * browser from inheriting someone else's homeowner status — which meant a
 * real homeowner who signed out lost both their journey and their unit
 * activation, and got dumped back into H3 Discovery on their next login.
 * Storing the owning user id instead makes each flag self-invalidating for
 * anyone else, so it can safely outlive a logout.
 */
function readOwnedFlag(key: string, userId: string | null): boolean {
  if (typeof window === "undefined" || !userId) return false;
  return window.localStorage.getItem(key) === userId;
}

function writeOwnedFlag(key: string, userId: string | null): void {
  if (userId) window.localStorage.setItem(key, userId);
  else window.localStorage.removeItem(key);
}

/** Pass the user's id to mark them activated; pass `null` to clear. */
export function storeHomeownerActivated(userId: string | null): void {
  writeOwnedFlag(HOMEOWNER_ACTIVATED_KEY, userId);
}

export function getStoredHomeownerActivated(userId: string | null = getStoredUser()?.id ?? null): boolean {
  return readOwnedFlag(HOMEOWNER_ACTIVATED_KEY, userId);
}

/**
 * Set when a user registers via the "لدي وحدة سكنية" journey.
 * `/auth/register` only ever creates a `HOME_SEEKER` row — this flag is the
 * mocked bridge that lets such a session present as `homeowner_pending`
 * (see `roles.ts`/`AuthContext.tsx`) and be routed into H6 activation
 * instead of H3 Discovery, without inventing a fake backend role. Real
 * activation (`storeHomeownerActivated`) still gates H7+.
 */
export function storeOwnerIntent(userId: string | null): void {
  writeOwnedFlag(OWNER_INTENT_KEY, userId);
}

export function getStoredOwnerIntent(userId: string | null = getStoredUser()?.id ?? null): boolean {
  return readOwnedFlag(OWNER_INTENT_KEY, userId);
}

const PENDING_JOURNEY_KEY = "sakn_pending_journey";

export type PendingJourney = "search" | "owner";

/**
 * The individual sub-journey ("أبحث عن منزل" vs "لدي وحدة سكنية") picked on
 * H2's `journeyInd` screen, persisted the moment it is chosen — *before* an
 * account exists.
 *
 * It cannot live in React state alone: registration spans several screens,
 * and any remount in between (a page refresh, a Fast Refresh during dev, an
 * OS back-gesture) silently reset it to `null`, which made a homeowner's
 * registration finish as a plain home-seeker and land on H3 Discovery. This
 * key is the durable record of that choice; `AuthScreen#postAuthDestination`
 * reads it and promotes it to a real session flag (`storeOwnerIntent`) once
 * registration succeeds, then clears it.
 */
export function storePendingJourney(journey: PendingJourney): void {
  window.localStorage.setItem(PENDING_JOURNEY_KEY, journey);
}

export function getPendingJourney(): PendingJourney | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PENDING_JOURNEY_KEY);
  return raw === "owner" || raw === "search" ? raw : null;
}

export function clearPendingJourney(): void {
  window.localStorage.removeItem(PENDING_JOURNEY_KEY);
}

const DEMO_SESSION_FLAG_KEY = "sakn_demo_session";

/**
 * Demo Mode session (user instruction, 2026-07-27): a synthetic session for
 * demoing every screen/journey without a reachable backend. Deliberately
 * stores no refresh token — `logout()` below only calls the real
 * `POST /auth/logout` when both an access AND a refresh token are present,
 * so signing out of a demo session never fires a real network call. The
 * sentinel access token exists only so `getStoredAccessToken() !== null`
 * (the hydration check every real session also uses) treats a demo session
 * as "signed in" across a page reload.
 */
export function storeDemoSession(user: PublicUser): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, "demo-mode-session");
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  storeUser(user);
  window.localStorage.setItem(DEMO_SESSION_FLAG_KEY, "1");
}

export function isDemoSessionStored(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_SESSION_FLAG_KEY) === "1";
}

export function clearDemoSessionFlag(): void {
  window.localStorage.removeItem(DEMO_SESSION_FLAG_KEY);
}

/**
 * POST /auth/refresh (SEC-003 — single-use, rotating). The backend issues a
 * brand new pair on every call and the presented token can never be
 * redeemed again, so the new pair must overwrite storage immediately —
 * holding onto the old refresh token after a successful call would make it
 * unusable dead weight at best, and at worst mean a second accidental call
 * with the stale token trips the backend's reuse-detection (ED-007) and
 * revokes every session for the account.
 */
/** @deprecated The current Backend reads the refresh token from its httpOnly cookie and returns a session DTO — nothing is sent in the body and no refresh token comes back. Use `backendAuth.refresh()`. No real-mode caller. */
export async function refreshTokens(): Promise<TokenPair> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token stored — cannot refresh a session that was never logged in.");
  }
  const tokens = await request<TokenPair>("/auth/refresh", { refreshToken });
  storeTokens(tokens);
  return tokens;
}

/**
 * POST /auth/logout — ends the current session only (revokes the one
 * presented refresh token, per auth.service.ts#logout). Requires the access
 * token as a bearer credential (requireAuth guards this route) and the
 * refresh token in the body.
 *
 * Local tokens are cleared unconditionally, even if the network call fails
 * or there was nothing stored to begin with — from the user's perspective
 * "log out" means "this browser is done with the session" regardless of
 * whether the server round-trip succeeds (matches the backend's own
 * leniency here: it never errors on an unknown/already-invalid token).
 */
/**
 * **Demo Mode logout.** A synthetic session stores no refresh token, so the
 * guarded network call below never fires and this is purely a local clear —
 * which is exactly the demo behaviour to preserve.
 *
 * @deprecated for real mode: the current `POST /api/auth/logout` is
 * authenticated by the refresh COOKIE (not the access token) and takes no body,
 * so it still succeeds after the 15-minute access token expires. Real sessions
 * go through `backendAuth.logout()` via `AuthContext#signOut`.
 */
export async function logout(): Promise<void> {
  const accessToken = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  if (accessToken && refreshToken) {
    try {
      await request<null>("/auth/logout", { refreshToken }, { authToken: accessToken });
    } catch {
      // See docstring — a failed logout call still ends the local session.
    }
  }
  clearTokens();
  clearUser();
  clearDemoSessionFlag();
  clearPendingJourney();
  // `sakn_owner_intent`/`sakn_homeowner_activated` are deliberately NOT
  // cleared — they are user-id-keyed account facts, not session state, and
  // wiping them here is exactly what used to strip a homeowner of their
  // journey on logout. They read as `false` for any other user anyway.
}
