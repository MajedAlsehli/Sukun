import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError } from './errors';
import { UserRole } from './roles';

export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
  // Set at token-issue time (login/register/refresh). Trades a rare-mutation
  // staleness window (bounded by the short access-token TTL) for not having
  // to hit the DB on every request just to resolve company ownership.
  companyId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload & { id: string };
}

// SYS-008: Authentication validated before Authorization
export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing bearer token', 'AUTH_REQUIRED');
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
    req.user = { ...payload, id: payload.sub };
    next();
  } catch {
    throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
  }
}

/**
 * Task 10 - used by `POST /api/auth/logout` only.
 *
 * Logging out must work even when the access token has already expired. With
 * the strict middleware, a user who left the tab open past the 15-minute
 * access TTL got a 401 on logout, the client swallowed it, and the refresh
 * token was left VALID in the database - so the next page load silently
 * restored the session the user believed they had ended. That is a real
 * defect, not a cosmetic one.
 *
 * This variant attaches `req.user` when a valid token is present and simply
 * leaves it undefined otherwise. The logout service then falls back to the
 * refresh-token record itself to decide whose session is being revoked, and
 * revocation is by token hash either way - so nothing here weakens the
 * authorization of the actual revoke.
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.jwt.accessSecret) as AccessTokenPayload;
    req.user = { ...payload, id: payload.sub };
  } catch {
    // An expired or malformed token is treated exactly like no token: the
    // cookie is still the thing being revoked.
  }
  next();
}
