import { Response } from 'express';
import { env } from '../config/env';

/**
 * The refresh token is never returned in a JSON body (Task 3 rule: no
 * localStorage, no JS-visible refresh token) - it lives only in this
 * httpOnly cookie. `path` scopes it to the auth routes that actually read
 * it, so it isn't sent on every API request.
 *
 * Task 10: `sameSite`/`secure` come from config rather than being hard-coded.
 * Local development stays `lax` over plain HTTP; a production deployment where
 * the frontend and backend are separate origins (two Vercel projects - and
 * `.vercel.app` is on the Public Suffix List, so the two are genuinely
 * cross-site) needs `SameSite=None; Secure` or the browser never sends this
 * cookie back and every session dies on reload. `SameSite=None` re-opens CSRF
 * on the two endpoints that authenticate by this cookie alone, so both are
 * pinned to the one allowed origin by `shared/originGuard.middleware.ts`.
 */
export const REFRESH_COOKIE_NAME = 'sakn_refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  // Every attribute except expires/maxAge must match the cookie that was set,
  // or the browser treats this as a different cookie and leaves the original
  // one in place.
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: REFRESH_COOKIE_PATH,
  });
}
