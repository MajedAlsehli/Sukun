import rateLimit from 'express-rate-limit';
import { sendError } from './response';
import { env } from '../config/env';

// Defense-in-depth alongside SEC-007's per-account lockout: this limits by
// IP regardless of which account is being targeted, covering credential-
// stuffing across many accounts and brute-forcing activation/reset codes.
export const authRateLimiter = rateLimit({
  // 200 requests / 15 minutes, permanently. Both halves are configurable
  // through the environment and default to those values in code - see
  // config/env.ts#authRateLimit. Limiting stays ON: this middleware is
  // mounted on the whole auth router (auth/auth.routes.ts) and on the
  // unauthenticated activation endpoint (homeowners/homeowner.routes.ts).
  windowMs: env.authRateLimit.windowMinutes * 60_000,
  limit: env.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests - try again later.');
  },
});

// Task 6 (decisions.md G14): limits the one Discovery endpoint that spends
// real OpenAI budget per call. Same per-process/in-memory caveat as
// authRateLimiter above - not a durable global limit under a serverless
// execution model, disclosed honestly in decisions.md G14 rather than
// implied to be stronger than it is.
export const discoveryRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests - try again later.');
  },
});

// Task 8 (decisions.md I6): POST /api/reports/analyze is the canonical report
// domain's only endpoint that spends real OpenAI budget per call, and it takes
// up to ten full-size photos per request. Same shape and same honest
// per-process/in-memory caveat as the two limiters above.
export const aiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests - try again later.');
  },
});

// Task 9 (decisions.md J12): the PM Copilot's three AI endpoints. Same shape and
// the same honest per-process/in-memory caveat as the three limiters above -
// under a serverless execution model this is a per-instance limit, not a
// durable global one, and that is disclosed rather than implied away.
export const pmCopilotRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests - try again later.');
  },
});
