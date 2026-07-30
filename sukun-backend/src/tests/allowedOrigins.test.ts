import request from 'supertest';
import express from 'express';
import cors from 'cors';
import {
  env,
  collectConfigurationErrors,
  configurationReport,
  normalizeAllowedOrigin,
  resolveAllowedOrigins,
} from '../config/env';
import { isAllowedOrigin, requireAllowedOrigin } from '../shared/originGuard.middleware';
import { errorMiddleware } from '../shared/error.middleware';
import { requestIdMiddleware } from '../shared/requestId.middleware';

/**
 * Task 2 (frontend integration) - the ONE narrowly-scoped backend change:
 * an exact-origin allowlist shared by credentialed CORS and the
 * `requireAllowedOrigin` CSRF guard.
 *
 * What must remain true, and is asserted below:
 *
 *   * the old production origin still passes CORS and the origin guard;
 *   * `http://localhost:3001` (the Task 2 local integration run) passes both;
 *   * a foreign origin fails both;
 *   * a DECEPTIVE SUFFIX of an allowed origin fails both - the comparison is
 *     equality, never `endsWith`/`startsWith`/`includes`;
 *   * a wildcard can never be configured into the list;
 *   * the pre-existing single-`FRONTEND_URL` behaviour is unchanged;
 *   * `Access-Control-Allow-Origin` is never `*` on a credentialed response.
 */

const OLD_PRODUCTION_ORIGIN = 'https://sakn-app.vercel.app';
const LOCAL_INTEGRATION_ORIGIN = 'http://localhost:3001';
const FOREIGN_ORIGIN = 'https://attacker.example';
// Reads as "sakn-app.vercel.app" to a substring check and is a completely
// different registrable domain.
const DECEPTIVE_SUFFIX_ORIGIN = 'https://sakn-app.vercel.app.attacker.example';
const DECEPTIVE_PREFIX_ORIGIN = 'https://evil-sakn-app.vercel.app';

// ---------------------------------------------------------------------------
// Pure resolution - no Express, no environment mutation.
// ---------------------------------------------------------------------------

describe('normalizeAllowedOrigin', () => {
  it.each([
    ['https://sakn-app.vercel.app', 'https://sakn-app.vercel.app'],
    ['http://localhost:3001', 'http://localhost:3001'],
    // Trailing slashes are the same origin, not a different one.
    ['https://sakn-app.vercel.app/', 'https://sakn-app.vercel.app'],
    ['https://sakn-app.vercel.app///', 'https://sakn-app.vercel.app'],
    ['  https://sakn-app.vercel.app  ', 'https://sakn-app.vercel.app'],
  ])('accepts %s', (raw, expected) => {
    expect(normalizeAllowedOrigin(raw)).toBe(expected);
  });

  it.each([
    ['a wildcard host', 'https://*.vercel.app'],
    ['a bare wildcard', '*'],
    ['a wildcard inside a host', 'https://sakn-*.vercel.app'],
    ['a path', 'https://sakn-app.vercel.app/app'],
    ['a deep path', 'https://sakn-app.vercel.app/a/b'],
    ['a query string', 'https://sakn-app.vercel.app?x=1'],
    ['a fragment', 'https://sakn-app.vercel.app#frag'],
    ['embedded credentials', 'https://user:pass@sakn-app.vercel.app'],
    ['a non-http scheme', 'ftp://sakn-app.vercel.app'],
    ['a javascript scheme', 'javascript:alert(1)'],
    ['an unparseable value', 'not a url'],
    ['a bare host with no scheme', 'sakn-app.vercel.app'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    // `new URL` rewrites this to `https://x.example`; an origin we had to
    // rewrite is not the origin the operator typed.
    ['an explicit default port', 'https://sakn-app.vercel.app:443'],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeAllowedOrigin(raw)).toBeNull();
  });
});

describe('resolveAllowedOrigins', () => {
  it('keeps the single-FRONTEND_URL behaviour when FRONTEND_URLS is unset', () => {
    expect(resolveAllowedOrigins(OLD_PRODUCTION_ORIGIN, undefined)).toEqual({
      origins: [OLD_PRODUCTION_ORIGIN],
      invalid: [],
    });
    expect(resolveAllowedOrigins(OLD_PRODUCTION_ORIGIN, '')).toEqual({
      origins: [OLD_PRODUCTION_ORIGIN],
      invalid: [],
    });
  });

  it('always includes FRONTEND_URL first, for backwards compatibility', () => {
    const { origins } = resolveAllowedOrigins(
      OLD_PRODUCTION_ORIGIN,
      `${LOCAL_INTEGRATION_ORIGIN},https://another.example`,
    );
    expect(origins[0]).toBe(OLD_PRODUCTION_ORIGIN);
    expect(origins).toEqual([
      OLD_PRODUCTION_ORIGIN,
      LOCAL_INTEGRATION_ORIGIN,
      'https://another.example',
    ]);
  });

  it('trims entries and de-duplicates, including against FRONTEND_URL itself', () => {
    const { origins } = resolveAllowedOrigins(
      OLD_PRODUCTION_ORIGIN,
      `  ${LOCAL_INTEGRATION_ORIGIN} , ${OLD_PRODUCTION_ORIGIN}/ , ${LOCAL_INTEGRATION_ORIGIN}`,
    );
    expect(origins).toEqual([OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN]);
  });

  it('drops blank entries from doubled/trailing commas without reporting them', () => {
    const { origins, invalid } = resolveAllowedOrigins(
      OLD_PRODUCTION_ORIGIN,
      `${LOCAL_INTEGRATION_ORIGIN},,  ,`,
    );
    expect(origins).toEqual([OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN]);
    expect(invalid).toEqual([]);
  });

  it('refuses a wildcard entry and reports it instead of admitting it', () => {
    const { origins, invalid } = resolveAllowedOrigins(
      OLD_PRODUCTION_ORIGIN,
      `https://*.vercel.app,${LOCAL_INTEGRATION_ORIGIN}`,
    );
    expect(origins).toEqual([OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN]);
    expect(origins).not.toContain('https://*.vercel.app');
    expect(invalid).toEqual(['https://*.vercel.app']);
  });

  it('refuses paths, query strings, fragments and unparseable entries', () => {
    const { origins, invalid } = resolveAllowedOrigins(OLD_PRODUCTION_ORIGIN, [
      'https://a.example/path',
      'https://b.example?q=1',
      'https://c.example#f',
      'nonsense',
    ].join(','));
    expect(origins).toEqual([OLD_PRODUCTION_ORIGIN]);
    expect(invalid).toHaveLength(4);
  });

  it('never resolves to a list containing a wildcard', () => {
    const { origins } = resolveAllowedOrigins(OLD_PRODUCTION_ORIGIN, '*,https://*.example,*.vercel.app');
    expect(origins.some((o) => o.includes('*'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The guard and CORS, driven through real Express apps built on the resolved
// list. `env.frontendUrls` is swapped for the duration and restored after.
// ---------------------------------------------------------------------------

describe('exact-origin allowlist in CORS and the origin guard', () => {
  const originalFrontendUrls = env.frontendUrls;

  function useAllowlist(...origins: string[]) {
    env.frontendUrls = origins;
  }

  afterEach(() => {
    env.frontendUrls = originalFrontendUrls;
  });

  /** A minimal app with exactly the credentialed CORS `app.ts` configures. */
  function corsApp() {
    const app = express();
    app.use(cors({ origin: env.frontendUrls, credentials: true }));
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  /** A minimal app with exactly the guard `/auth/refresh` and `/auth/logout` use. */
  function guardApp() {
    const app = express();
    app.use(requestIdMiddleware);
    app.post('/api/auth/refresh', requireAllowedOrigin, (_req, res) =>
      res.status(200).json({ ok: true }),
    );
    app.post('/api/auth/logout', requireAllowedOrigin, (_req, res) =>
      res.status(200).json({ ok: true }),
    );
    app.use(errorMiddleware);
    return app;
  }

  describe('the old production origin keeps working', () => {
    it('passes CORS with the exact origin reflected and credentials allowed', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp()).get('/probe').set('Origin', OLD_PRODUCTION_ORIGIN);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(OLD_PRODUCTION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('passes the refresh and logout origin guard', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
        const res = await request(guardApp()).post(path).set('Origin', OLD_PRODUCTION_ORIGIN);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('localhost:3001 (the Task 2 local integration run)', () => {
    it('passes CORS with its own origin reflected, not the production one', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp()).get('/probe').set('Origin', LOCAL_INTEGRATION_ORIGIN);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(LOCAL_INTEGRATION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('passes a credentialed preflight', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp())
        .options('/probe')
        .set('Origin', LOCAL_INTEGRATION_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBe(LOCAL_INTEGRATION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('passes the refresh and logout origin guard', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
        const res = await request(guardApp()).post(path).set('Origin', LOCAL_INTEGRATION_ORIGIN);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('a foreign origin is refused', () => {
    it('receives no Access-Control-Allow-Origin header at all', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp()).get('/probe').set('Origin', FOREIGN_ORIGIN);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('is 403 ACCESS_DENIED on refresh and logout', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
        const res = await request(guardApp()).post(path).set('Origin', FOREIGN_ORIGIN);
        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe('ACCESS_DENIED');
      }
    });
  });

  describe('a deceptive suffix/prefix of an allowed origin is refused', () => {
    it.each([
      ['suffix', DECEPTIVE_SUFFIX_ORIGIN],
      ['prefix', DECEPTIVE_PREFIX_ORIGIN],
      ['scheme downgrade', 'http://sakn-app.vercel.app'],
      ['different port on an allowed host', 'http://localhost:3002'],
    ])('refuses the %s case in CORS', async (_label, origin) => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp()).get('/probe').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it.each([
      ['suffix', DECEPTIVE_SUFFIX_ORIGIN],
      ['prefix', DECEPTIVE_PREFIX_ORIGIN],
      ['scheme downgrade', 'http://sakn-app.vercel.app'],
      ['different port on an allowed host', 'http://localhost:3002'],
    ])('refuses the %s case in the origin guard', async (_label, origin) => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(guardApp()).post('/api/auth/refresh').set('Origin', origin);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACCESS_DENIED');
    });

    it('isAllowedOrigin uses equality, not substring matching', () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      expect(isAllowedOrigin(OLD_PRODUCTION_ORIGIN)).toBe(true);
      expect(isAllowedOrigin(`${OLD_PRODUCTION_ORIGIN}/`)).toBe(true);
      expect(isAllowedOrigin(DECEPTIVE_SUFFIX_ORIGIN)).toBe(false);
      expect(isAllowedOrigin(DECEPTIVE_PREFIX_ORIGIN)).toBe(false);
      expect(isAllowedOrigin('https://vercel.app')).toBe(false);
      expect(isAllowedOrigin('*')).toBe(false);
    });
  });

  describe('a request with no Origin header keeps its server-to-server behaviour', () => {
    it('is served, and never receives a wildcard ACAO', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(corsApp()).get('/probe');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('passes the origin guard, exactly as before', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN, LOCAL_INTEGRATION_ORIGIN);
      const res = await request(guardApp()).post('/api/auth/refresh');
      expect(res.status).toBe(200);
    });
  });

  describe('the pre-existing single-origin configuration is unchanged', () => {
    it('still allows its one origin and refuses every other', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN);
      const allowed = await request(corsApp()).get('/probe').set('Origin', OLD_PRODUCTION_ORIGIN);
      expect(allowed.headers['access-control-allow-origin']).toBe(OLD_PRODUCTION_ORIGIN);

      for (const origin of [LOCAL_INTEGRATION_ORIGIN, FOREIGN_ORIGIN, DECEPTIVE_SUFFIX_ORIGIN]) {
        const refused = await request(corsApp()).get('/probe').set('Origin', origin);
        expect(refused.headers['access-control-allow-origin']).toBeUndefined();
        const guarded = await request(guardApp()).post('/api/auth/logout').set('Origin', origin);
        expect(guarded.status).toBe(403);
      }
    });

    it('never answers a credentialed request with Access-Control-Allow-Origin: *', async () => {
      useAllowlist(OLD_PRODUCTION_ORIGIN);
      for (const origin of [OLD_PRODUCTION_ORIGIN, FOREIGN_ORIGIN, '*']) {
        const res = await request(corsApp()).get('/probe').set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Configuration reporting - a refused entry fails loudly.
// ---------------------------------------------------------------------------

describe('allowlist configuration reporting', () => {
  const snapshot = {
    isProduction: env.isProduction,
    databaseUrl: env.databaseUrl,
    accessSecret: env.jwt.accessSecret,
    refreshSecret: env.jwt.refreshSecret,
    frontendUrl: env.frontendUrl,
    frontendUrlsInvalid: env.frontendUrlsInvalid,
    sameSite: env.cookie.sameSite,
    secure: env.cookie.secure,
    retrySecret: env.routing.retrySecret,
    reportMediaDriver: env.reportMedia.driver,
    demoPassword: env.demo.password,
  };
  const originalFrontendUrlVar = process.env.FRONTEND_URL;

  function makeValidProduction() {
    env.isProduction = true;
    env.databaseUrl = 'postgresql://user:pass@db.example:6543/postgres';
    env.jwt.accessSecret = 'a'.repeat(48);
    env.jwt.refreshSecret = 'b'.repeat(48);
    env.frontendUrl = OLD_PRODUCTION_ORIGIN;
    process.env.FRONTEND_URL = OLD_PRODUCTION_ORIGIN;
    env.frontendUrlsInvalid = [];
    env.cookie.sameSite = 'none';
    env.cookie.secure = true;
    env.routing.retrySecret = '';
    env.reportMedia.driver = '';
    env.demo.password = '';
  }

  afterEach(() => {
    env.isProduction = snapshot.isProduction;
    env.databaseUrl = snapshot.databaseUrl;
    env.jwt.accessSecret = snapshot.accessSecret;
    env.jwt.refreshSecret = snapshot.refreshSecret;
    env.frontendUrl = snapshot.frontendUrl;
    env.frontendUrlsInvalid = snapshot.frontendUrlsInvalid;
    env.cookie.sameSite = snapshot.sameSite;
    env.cookie.secure = snapshot.secure;
    env.routing.retrySecret = snapshot.retrySecret;
    env.reportMedia.driver = snapshot.reportMediaDriver;
    env.demo.password = snapshot.demoPassword;
    if (originalFrontendUrlVar === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrlVar;
  });

  it('a valid production allowlist produces no configuration error', () => {
    makeValidProduction();
    expect(collectConfigurationErrors()).toEqual([]);
  });

  it('reports refused FRONTEND_URLS entries as a configuration error', () => {
    makeValidProduction();
    env.frontendUrlsInvalid = ['https://*.vercel.app'];
    const errors = collectConfigurationErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('FRONTEND_URLS');
    expect(errors[0]).toContain('1 invalid entry');
  });

  it('refuses a wildcard in FRONTEND_URL itself', () => {
    makeValidProduction();
    env.frontendUrl = 'https://*.vercel.app';
    process.env.FRONTEND_URL = 'https://*.vercel.app';
    const errors = collectConfigurationErrors();
    expect(errors.some((e) => e.includes('FRONTEND_URL must be one exact origin'))).toBe(true);
  });

  it('reports FRONTEND_URLS in the configuration report without leaking a secret', () => {
    const entry = configurationReport().find((p) => p.name === 'FRONTEND_URLS');
    expect(entry).toBeDefined();
    expect(entry!.required).toBe(false);
    expect(typeof entry!.configured).toBe('boolean');
    if (env.jwt.accessSecret) expect(entry!.note).not.toContain(env.jwt.accessSecret);
  });
});
