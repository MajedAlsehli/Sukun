import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AuthorizationError } from './errors';

/**
 * Task 10 - CSRF boundary for the two endpoints that can be authenticated by
 * the refresh COOKIE alone (`POST /api/auth/refresh`, `POST /api/auth/logout`).
 *
 * Why this is needed now and was not before: production requires
 * `SameSite=None` on that cookie (the frontend and the API are separate
 * origins on Vercel, and `SameSite=Lax` is simply not sent cross-site). Once
 * the cookie travels cross-site, any page on the internet can make the
 * browser POST to these two routes with the user's cookie attached. CORS
 * prevents the attacker from READING the response, but the side effect - a
 * rotated refresh token, or a forced logout - still happens.
 *
 * The check: a browser always attaches an `Origin` header to a cross-origin
 * POST and cannot forge it. If one is present it must be EXACTLY EQUAL to one
 * of the configured frontend origins (`env.frontendUrls` - the same resolved
 * allowlist `app.ts` hands to `cors()`, and nothing else). A request with no
 * `Origin` at all (server-side clients, curl, the Vercel cron runner) is
 * allowed through - those are not browsers and cannot be made to carry a
 * victim's cookie.
 *
 * The comparison is `===` against each entry, never `startsWith`, `endsWith`
 * or `includes`: `https://sakn-app.vercel.app.attacker.test` and
 * `https://evil-sakn-app.vercel.app` are foreign origins and must be refused
 * exactly like any other.
 *
 * Deliberately NOT a blanket app-wide middleware: every other mutating route
 * requires an `Authorization: Bearer` header, which is itself unforgeable
 * cross-site, so they are already CSRF-proof.
 */
export function isAllowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, '');
  return env.frontendUrls.some((allowed) => allowed === normalized);
}

export function requireAllowedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (typeof origin !== 'string' || origin === '') {
    next();
    return;
  }

  if (isAllowedOrigin(origin)) {
    next();
    return;
  }

  // AuthorizationError's code is the shared ACCESS_DENIED (403); the message
  // is what distinguishes this case. Deliberately not a new error class - the
  // response must not tell an attacker's page anything it did not already know.
  next(new AuthorizationError('Request origin is not allowed'));
}
