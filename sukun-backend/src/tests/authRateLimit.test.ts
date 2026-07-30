import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import {
  AUTH_RATE_LIMIT_DEFAULT_MAX,
  AUTH_RATE_LIMIT_DEFAULT_WINDOW_MINUTES,
  env,
} from '../config/env';
import { authRateLimiter } from '../shared/rateLimit.middleware';
import { sendError } from '../shared/response';

// ---------------------------------------------------------------------------
// The per-IP auth limiter's exact boundary.
//
// This exists so the boundary is proven HERE, in memory, in milliseconds -
// and never by firing hundreds of requests at Production to find out where it
// bites. Production is verified by reading the `RateLimit-Policy` header off
// ONE ordinary request; the arithmetic below is what makes that header
// trustworthy.
//
// What must stay true:
//   * the shipped configuration is 200 requests per 15 minutes;
//   * request N <= limit is ACCEPTED;
//   * request limit+1 is REJECTED with 429 TOO_MANY_REQUESTS;
//   * limiting is still ON - "raise the limit" never became "remove it".
// ---------------------------------------------------------------------------

describe('auth rate limit - configuration', () => {
  it('is configured to exactly 200 requests per 15-minute window', () => {
    expect(env.authRateLimit.max).toBe(200);
    expect(env.authRateLimit.windowMinutes).toBe(15);
  });

  it('ships those values as the in-code defaults, not only as an env override', () => {
    // The Production environment sets AUTH_RATE_LIMIT_MAX=200 explicitly, but a
    // deployment that lost the variable must not silently fall back to 20.
    expect(AUTH_RATE_LIMIT_DEFAULT_MAX).toBe(200);
    expect(AUTH_RATE_LIMIT_DEFAULT_WINDOW_MINUTES).toBe(15);
  });

  it('expresses the window to express-rate-limit in milliseconds', () => {
    expect(env.authRateLimit.windowMinutes * 60_000).toBe(900_000);
  });
});

/**
 * A limiter built from the SAME env values the real one is built from, on its
 * own in-memory store so the count cannot leak between test files. Asserted
 * below to be byte-identical in policy to the exported `authRateLimiter`.
 */
function freshLimiter() {
  return rateLimit({
    windowMs: env.authRateLimit.windowMinutes * 60_000,
    limit: env.authRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests - try again later.');
    },
  });
}

function appWithLimiter(limiter: express.RequestHandler) {
  const app = express();
  app.use(limiter);
  app.post('/probe', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('auth rate limit - the boundary', () => {
  const limit = env.authRateLimit.max;

  it('accepts every request up to and including the configured limit', async () => {
    const app = appWithLimiter(freshLimiter());

    // Sequential on purpose: this is an ordering assertion, not a load test.
    for (let i = 1; i <= limit; i += 1) {
      const res = await request(app).post('/probe');
      if (res.status !== 200) {
        throw new Error(`request ${i} of ${limit} was rejected with ${res.status}`);
      }
    }
  }, 60_000);

  it('rejects the first request past the limit with 429 TOO_MANY_REQUESTS', async () => {
    const app = appWithLimiter(freshLimiter());

    for (let i = 1; i <= limit; i += 1) {
      await request(app).post('/probe');
    }

    const overflow = await request(app).post('/probe');
    expect(overflow.status).toBe(429);
    expect(overflow.body).toMatchObject({
      success: false,
      errorCode: 'TOO_MANY_REQUESTS',
    });
  }, 60_000);

  it('publishes the policy so Production can be verified from one ordinary request', async () => {
    const app = appWithLimiter(freshLimiter());
    const res = await request(app).post('/probe');

    expect(res.headers['ratelimit-limit']).toBe('200');
    expect(res.headers['ratelimit-policy']).toContain('w=900');
  });

  it('is still enabled on the real limiter - raising the limit did not remove it', async () => {
    // The exported middleware itself, not a copy: mounting it must still count
    // and must still publish a 200/900s policy.
    const app = appWithLimiter(authRateLimiter);
    const res = await request(app).post('/probe');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('200');
    expect(res.headers['ratelimit-policy']).toBe('200;w=900');
  });
});

describe('auth rate limit - malformed configuration', () => {
  const saved = process.env.AUTH_RATE_LIMIT_MAX;

  afterEach(() => {
    if (saved === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = saved;
    jest.resetModules();
  });

  it('falls back to 200 rather than resolving to NaN, which would block everything', () => {
    process.env.AUTH_RATE_LIMIT_MAX = 'not-a-number';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reloaded = require('../config/env') as typeof import('../config/env');
    expect(reloaded.env.authRateLimit.max).toBe(200);
  });

  it('refuses a zero/negative override for the same reason', () => {
    process.env.AUTH_RATE_LIMIT_MAX = '0';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reloaded = require('../config/env') as typeof import('../config/env');
    expect(reloaded.env.authRateLimit.max).toBe(200);
  });
});
