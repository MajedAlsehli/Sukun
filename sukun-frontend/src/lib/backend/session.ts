/**
 * The access token's ONLY home: a module-scoped variable.
 *
 * Deliberately not `localStorage`, not `sessionStorage`, not a cookie this code
 * can read. The current Backend architecture
 * (`sakn-backend/docs/integration/decisions.md` D1/K2) is:
 *
 *   - short-lived access token (15 min), returned in the JSON body, held here;
 *   - opaque rotating refresh token in an httpOnly, `/api/auth`-scoped,
 *     `SameSite=None; Secure` cookie the browser sends automatically and
 *     JavaScript can never read.
 *
 * A page reload therefore starts with no access token by design — the session is
 * restored by a silent `POST /auth/refresh`, which reads that cookie. Persisting
 * the access token would defeat the whole point (an XSS could exfiltrate it) and
 * would not help, because it expires in 15 minutes anyway.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

/** Test-only reset seam. Production code calls `setAccessToken`/`clearAccessToken`. */
export function __resetSessionStoreForTests(): void {
  accessToken = null;
}
