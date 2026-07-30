import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { env } from '../config/env';
import { prisma } from '../config/prisma';

// HTTP-layer integration tests: exercise the real Express app (middleware,
// routing, auth, RBAC, DTO validation) end-to-end without a live database.
// No DATABASE_URL is configured in this environment, so anything past
// validation/auth would hit Prisma and fail - every case here is chosen to
// resolve (200/400/401/403) before a DB call would ever be made. True
// request->DB integration tests are Task 018's one gap; see task report.
const app = createApp();

function signToken(payload: { sub: string; role: string; companyId: string | null }): string {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: '15m' });
}

describe('health and docs', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    // Task 10 added `configured`: liveness must stay answerable even when
    // production configuration is incomplete, and an operator needs to be able
    // to see "running but misconfigured" rather than guessing.
    expect(res.body).toEqual({ status: 'ok', configured: true });
  });

  it('GET /health/config reports provider availability without ever returning a value', async () => {
    const res = await request(app).get('/health/config');
    expect(res.status).toBe(200);

    const providers = res.body.providers as Array<{ name: string; configured: boolean }>;
    expect(providers.map((p) => p.name)).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'OPENAI_API_KEY', 'SUPABASE_STORAGE_PRIVATE_BUCKET']),
    );
    for (const provider of providers) {
      expect(typeof provider.configured).toBe('boolean');
    }
    // Booleans and descriptions only - the actual secrets must not appear.
    const body = JSON.stringify(res.body);
    if (env.jwt.accessSecret) expect(body).not.toContain(env.jwt.accessSecret);
    if (env.ai.openAiApiKey) expect(body).not.toContain(env.ai.openAiApiKey);
    if (env.databaseUrl) expect(body).not.toContain(env.databaseUrl);
  });

  it('GET /docs serves Swagger UI', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
  });
});

describe('every response includes a request ID', () => {
  it('sets X-Request-Id on a plain 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('authentication gate (SYS-008: auth before authorization)', () => {
  it.each([
    ['GET', '/api/projects'],
    ['POST', '/api/visits'],
    ['GET', '/api/inspection-reports'],
    ['POST', '/api/repairs'],
    ['GET', '/api/warranty-reports'],
    ['POST', '/api/homeowners'],
    ['GET', '/api/notifications'],
    ['GET', '/api/audit'],
    ['GET', '/api/company/dashboard'],
    ['GET', '/api/company/overview'],
    ['GET', '/api/company/projects/summary'],
    ['GET', '/api/company/activity'],
    ['GET', '/api/contractors'],
    ['GET', '/api/managers'],
    ['GET', '/api/projects/some-id/workspace'],
    ['GET', '/api/projects/some-id/units'],
    ['GET', '/api/projects/some-id/homeowners'],
    ['GET', '/api/projects/some-id/activity'],
  ])('%s %s without a token returns 401 AUTH_REQUIRED', async (method, url) => {
    const agent = request(app);
    const res = await (method === 'GET' ? agent.get(url) : agent.post(url));
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_REQUIRED');
  });

  it('rejects a malformed/invalid JWT with 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });
});

describe('authorization gate (SYS-009: RBAC after authentication)', () => {
  it('rejects a HOME_SEEKER token on a Company-only endpoint with 403', async () => {
    const token = signToken({ sub: 'user-1', role: 'HOME_SEEKER', companyId: null });
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', code: 'X-1', city: 'Riyadh' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('allows a COMPANY token past the role gate (fails later at DTO validation, not RBAC)', async () => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({}); // missing required fields
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('DTO validation runs before any database access', () => {
  it('rejects an invalid email on register with 400, not a DB error', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', phone: '0500000000', password: 'Passw0rd1' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a weak password on register with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'a@example.com', phone: '0500000000', password: 'weak' });
    expect(res.status).toBe(400);
  });
});

describe('public endpoints are genuinely public (no auth middleware)', () => {
  it('POST /api/homeowners/activate with a bad body returns 400, not 401', async () => {
    const res = await request(app).post('/api/homeowners/activate').send({});
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('POST /api/auth/login with a bad body returns 400, not 401', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('no-delete guarantee (D5/A7) - forbidden DELETE routes removed', () => {
  it.each([
    ['/api/projects/some-id'],
    ['/api/buildings/some-id'],
  ])('DELETE %s no longer exists (404, not 200/403)', async (url) => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const res = await request(app).delete(url).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /api/projects/:id/status replaces it (auth-gated, validates {active:boolean})', async () => {
    const unauth = await request(app).patch('/api/projects/some-id/status').send({ active: false });
    expect(unauth.status).toBe(401);

    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const badBody = await request(app)
      .patch('/api/projects/some-id/status')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(badBody.status).toBe(400);
    expect(badBody.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/buildings/:id/status replaces it (auth-gated, validates {active:boolean})', async () => {
    const unauth = await request(app).patch('/api/buildings/some-id/status').send({ active: false });
    expect(unauth.status).toBe(401);

    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const badBody = await request(app)
      .patch('/api/buildings/some-id/status')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(badBody.status).toBe(400);
    expect(badBody.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it.each([['/api/projects/some-id/archive'], ['/api/buildings/some-id/archive']])(
    'PATCH %s (decisions.md E1) is auth-gated and requires no body',
    async (url) => {
      const unauth = await request(app).patch(url);
      expect(unauth.status).toBe(401);
    },
  );
});

describe('Task 4 role scoping - company-management endpoints reject every non-Company role', () => {
  it.each([
    ['HOME_SEEKER'],
    ['HOMEOWNER'],
    ['TECHNICIAN'],
    ['PROJECT_MANAGER'],
  ])('%s cannot list contractors or managers (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: null });

    const contractors = await request(app).get('/api/contractors').set('Authorization', `Bearer ${token}`);
    expect(contractors.status).toBe(403);
    expect(contractors.body.errorCode).toBe('ACCESS_DENIED');

    const managers = await request(app).get('/api/managers').set('Authorization', `Bearer ${token}`);
    expect(managers.status).toBe(403);
    expect(managers.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('PROJECT_MANAGER cannot open RE1\'s company overview (403, not a silent empty response)', async () => {
    const token = signToken({ sub: 'user-1', role: 'PROJECT_MANAGER', companyId: null });
    const res = await request(app).get('/api/company/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('a Company token with no linked companyId is rejected at the service layer (403, not a crash)', async () => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: null });
    const res = await request(app).get('/api/contractors').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Task 6 correction (decisions.md G16) - GET /api/projects and GET /api/projects/:id are Company-only, closing the consumer-access overlap with the new /api/discovery/* surface', () => {
  it.each([
    // HOME_SEEKER covers both homeowner_prospect and homeowner_pending -
    // both are backend role HOME_SEEKER; "pending" is a frontend-derived
    // sub-state (decisions.md A1), not a distinct backend role, so there is
    // no separate RBAC decision point to test for it.
    ['HOME_SEEKER'],
    ['HOMEOWNER'],
    ['TECHNICIAN'],
    ['PROJECT_MANAGER'],
  ])('%s cannot list the internal project portfolio (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: null });
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it.each([
    ['HOME_SEEKER'],
    ['HOMEOWNER'],
    ['TECHNICIAN'],
    ['PROJECT_MANAGER'],
  ])('%s cannot get internal project details by id (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: null });
    const res = await request(app).get('/api/projects/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('an unauthenticated (no-token) request is rejected before any role check (401 AUTH_REQUIRED)', async () => {
    const list = await request(app).get('/api/projects');
    expect(list.status).toBe(401);
    expect(list.body.errorCode).toBe('AUTH_REQUIRED');

    const byId = await request(app).get('/api/projects/some-id');
    expect(byId.status).toBe(401);
    expect(byId.body.errorCode).toBe('AUTH_REQUIRED');
  });

  it('a Company token still passes the role gate (RBAC is not the reason it would ever fail)', async () => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('Task 6 closeout correction (decisions.md G17) - the same overlap on building/unit browse routes, found while fixing G16', () => {
  const nonCompanyRoles = [
    // HOME_SEEKER covers both homeowner_prospect and homeowner_pending - see
    // the identical note on the G16 describe block above.
    ['HOME_SEEKER'],
    ['HOMEOWNER'],
    ['TECHNICIAN'],
    ['PROJECT_MANAGER'],
  ] as const;

  it.each(nonCompanyRoles)(
    '%s cannot list buildings for a project (403 ACCESS_DENIED)',
    async (role) => {
      const token = signToken({ sub: 'user-1', role, companyId: null });
      const res = await request(app)
        .get('/api/projects/some-id/buildings')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACCESS_DENIED');
    },
  );

  it.each(nonCompanyRoles)('%s cannot get building details by id (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: null });
    const res = await request(app).get('/api/buildings/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it.each(nonCompanyRoles)(
    '%s cannot list units for a building (403 ACCESS_DENIED)',
    async (role) => {
      const token = signToken({ sub: 'user-1', role, companyId: null });
      const res = await request(app)
        .get('/api/buildings/some-id/units')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACCESS_DENIED');
    },
  );

  it.each(nonCompanyRoles)('%s cannot get unit details by id (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: null });
    const res = await request(app).get('/api/units/some-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('unauthenticated requests are rejected before any role check (401 AUTH_REQUIRED)', async () => {
    for (const url of [
      '/api/projects/some-id/buildings',
      '/api/buildings/some-id',
      '/api/buildings/some-id/units',
      '/api/units/some-id',
    ]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('AUTH_REQUIRED');
    }
  });

  it('a Company token still passes the role gate on all four routes', async () => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    for (const url of [
      '/api/projects/some-id/buildings',
      '/api/buildings/some-id',
      '/api/buildings/some-id/units',
      '/api/units/some-id',
    ]) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    }
  });
});

describe('Task 7 (H6/H7/H10) - homeowner self-service endpoints reject every non-Homeowner role', () => {
  // HOME_SEEKER covers both homeowner_prospect and homeowner_pending (A1) -
  // a still-pending homeowner must not reach H7/H10 just because a PENDING
  // HomeownerActivation row exists; there is no separate backend RBAC
  // decision point for "pending" vs "prospect" to test.
  const nonHomeownerRoles = [['HOME_SEEKER'], ['TECHNICIAN'], ['PROJECT_MANAGER'], ['COMPANY']] as const;

  it.each(nonHomeownerRoles)('%s cannot open GET /api/homeowners/me (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: role === 'COMPANY' ? 'company-1' : null });
    const res = await request(app).get('/api/homeowners/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it.each(nonHomeownerRoles)('%s cannot open GET /api/warranty (403 ACCESS_DENIED)', async (role) => {
    const token = signToken({ sub: 'user-1', role, companyId: role === 'COMPANY' ? 'company-1' : null });
    const res = await request(app)
      .get('/api/warranty')
      .query({ unitId: 'some-unit' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('unauthenticated requests are rejected before any role check (401 AUTH_REQUIRED)', async () => {
    const me = await request(app).get('/api/homeowners/me');
    expect(me.status).toBe(401);
    expect(me.body.errorCode).toBe('AUTH_REQUIRED');

    const warranty = await request(app).get('/api/warranty').query({ unitId: 'some-unit' });
    expect(warranty.status).toBe(401);
    expect(warranty.body.errorCode).toBe('AUTH_REQUIRED');
  });

  it('a HOMEOWNER token passes the role gate on both routes (fails later on missing data, not RBAC)', async () => {
    const token = signToken({ sub: 'no-such-user', role: 'HOMEOWNER', companyId: null });

    const me = await request(app).get('/api/homeowners/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).not.toBe(403);
    expect(me.status).not.toBe(401);

    const warranty = await request(app)
      .get('/api/warranty')
      .query({ unitId: 'some-unit' })
      .set('Authorization', `Bearer ${token}`);
    expect(warranty.status).not.toBe(403);
    expect(warranty.status).not.toBe(401);
  });

  it('GET /api/warranty rejects a missing unitId with 400 VALIDATION_ERROR before any RBAC-bypassing client override is possible', async () => {
    const token = signToken({ sub: 'user-1', role: 'HOMEOWNER', companyId: null });
    const res = await request(app).get('/api/warranty').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_REQUIRED');
  });

  it('rejects a token for a user that no longer exists', async () => {
    const token = signToken({ sub: 'nonexistent-user', role: 'HOME_SEEKER', companyId: null });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });
});

describe('POST /api/auth/refresh and /api/auth/logout', () => {
  it('refresh with no cookie and no body token returns 401 INVALID_TOKEN, not a crash', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });

  // Task 10: this used to assert 401 AUTH_REQUIRED. That was the defect, not
  // the contract: with a strict guard, a user whose 15-minute access token had
  // expired got a 401 on logout, the client swallowed it, and the refresh
  // token stayed LIVE in the database - so the next page load silently
  // restored the session they believed they had ended. Logout is now
  // authenticated by the cookie it revokes.
  it('logs out without a valid access token, so an expired session can still be ended', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ loggedOut: true });
  });

  it('clears the refresh cookie on logout with every attribute it was set with', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    const cleared = (setCookie ?? []).find((c) => c.startsWith('sakn_refresh_token='));
    expect(cleared).toBeDefined();
    // Path must match the cookie that was set, or the browser keeps the original.
    expect(cleared).toContain('Path=/api/auth');
    expect(cleared).toContain('HttpOnly');
  });
});

// Task 10 (decisions.md K2): production needs SameSite=None on the refresh
// cookie (the frontend and the API are separate origins on Vercel, and
// SameSite=Lax is simply not sent cross-site). That re-opens CSRF on the two
// endpoints authenticated by that cookie alone, so both are pinned to the one
// configured frontend origin.
describe('CSRF boundary on the cookie-authenticated auth endpoints', () => {
  it('refuses a refresh carrying a foreign browser Origin', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('refuses a logout carrying a foreign browser Origin', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('ACCESS_DENIED');
  });

  it('allows the configured frontend origin through to the real handler', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', env.frontendUrl)
      .send({});
    // 401 (no cookie) rather than 403: the origin check passed and the real
    // handler ran.
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });

  it('allows a non-browser request with no Origin at all (cron, curl, server-side)', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
  });

  it('treats a trailing slash on the Origin as the same origin', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', `${env.frontendUrl}/`)
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/invitations/accept is genuinely public', () => {
  it('a bad body returns 400, not 401', async () => {
    const res = await request(app).post('/api/auth/invitations/accept').send({});
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('an unknown token returns 409 INVALID_INVITATION_TOKEN, not a crash', async () => {
    const res = await request(app)
      .post('/api/auth/invitations/accept')
      .send({ token: 'definitely-not-a-real-token', password: 'Passw0rd1' });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INVALID_INVITATION_TOKEN');
  });
});

describe('unknown routes', () => {
  it('returns a 404 for a path with no matching route', async () => {
    const res = await request(app).get('/api/this-does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('security hardening', () => {
  it('sets standard security headers via helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('never leaks a stack trace on an unexpected error', async () => {
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    // Task 4: POST /api/projects now validates manager/contractor eligibility
    // (clean 404/409s) before ever reaching a raw DB call, so a genuine
    // unexpected error is no longer organically reachable through this body
    // alone - force one deterministically instead, same spy pattern the
    // health/ready 503 test above already uses.
    const spy = jest
      .spyOn(prisma.projectManager, 'findUnique')
      .mockRejectedValueOnce(new Error('simulated unexpected failure'));
    try {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sedra',
          city: 'Riyadh',
          managerId: 'manager-1',
          primaryContractorId: 'contractor-1',
          buildings: [{ name: 'مبنى A', floors: 1, units: { perFloor: 1 } }],
        });
      expect(res.status).toBe(500);
      expect(res.body.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack frames
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a JWT signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 'user-1', role: 'COMPANY', companyId: null }, 'wrong-secret', {
      expiresIn: '15m',
    });
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });
});

describe('production readiness', () => {
  it('GET /health/ready returns 200 when the database is reachable', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    // A live DATABASE_URL is configured in this environment (see project
    // README), so unreachability has to be simulated rather than relying on
    // no DB being configured - a prior version of this test asserted 503
    // unconditionally, which only ever passed by accident of environment state.
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    try {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.database).toBe('unreachable');
    } finally {
      spy.mockRestore();
    }
  });

  it('rate-limits auth endpoints (defense-in-depth alongside SEC-007)', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Task 8 (docs/integration/decisions.md Part I): canonical report API.
//
// These are HTTP-layer proofs of the invariants that must hold before any
// business logic runs - role gates, the absence of a manual-assignment
// endpoint, the absence of an arbitrary status PATCH, and the protection on
// the cron-suitable routing-retry endpoint. Every case here resolves at the
// middleware/validation layer, so none of them needs a live database.
// ---------------------------------------------------------------------------
describe('Task 8 - canonical reports: authentication gate', () => {
  it.each([
    ['GET', '/api/reports'],
    ['POST', '/api/reports'],
    ['GET', '/api/reports/some-id'],
    ['GET', '/api/reports/some-id/timeline'],
    ['POST', '/api/reports/some-id/start'],
    ['POST', '/api/reports/some-id/submit-repair'],
    ['POST', '/api/reports/some-id/approve'],
    ['POST', '/api/reports/some-id/reopen'],
    ['POST', '/api/reports/analyze'],
    ['POST', '/api/reports/warranty-check'],
    ['POST', '/api/reports/media'],
    ['GET', '/api/reports/providers'],
    ['GET', '/api/technician/tasks'],
    ['GET', '/api/technician/tasks/summary'],
    ['GET', '/api/technician/repairs/history'],
  ])('%s %s without a token returns 401 AUTH_REQUIRED', async (method, url) => {
    const agent = request(app);
    const res = await (method === 'GET' ? agent.get(url) : agent.post(url));
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_REQUIRED');
  });
});

describe('Task 8 - canonical reports: role gates (decisions.md I12)', () => {
  const token = (role: string, companyId: string | null = null) =>
    signToken({ sub: `user-${role}`, role, companyId });

  it('excludes HOME_SEEKER from the canonical report domain entirely', async () => {
    for (const url of ['/api/reports', '/api/reports/some-id', '/api/reports/some-id/timeline']) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${token('HOME_SEEKER')}`);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACCESS_DENIED');
    }
  });

  it.each([['TECHNICIAN'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at POST /api/reports - only a homeowner files a report',
    async (role) => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`)
        .send({ mediaKeys: ['k'], category: 'PLUMBING', problemText: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ACCESS_DENIED');
    },
  );

  it.each([['HOMEOWNER'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at POST /api/reports/:id/start - only the technician repairs',
    async (role) => {
      const res = await request(app)
        .post('/api/reports/some-id/start')
        .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`)
        .send({});
      expect(res.status).toBe(403);
    },
  );

  it.each([['HOMEOWNER'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at POST /api/reports/:id/submit-repair',
    async (role) => {
      const res = await request(app)
        .post('/api/reports/some-id/submit-repair')
        .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`)
        .send({ afterPhotos: [] });
      expect(res.status).toBe(403);
    },
  );

  it.each([['TECHNICIAN'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at POST /api/reports/:id/approve - only the homeowner closes their report',
    async (role) => {
      const res = await request(app)
        .post('/api/reports/some-id/approve')
        .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`)
        .send({ rating: 5 });
      expect(res.status).toBe(403);
    },
  );

  it.each([['TECHNICIAN'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at POST /api/reports/:id/reopen',
    async (role) => {
      const res = await request(app)
        .post('/api/reports/some-id/reopen')
        .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`)
        .send({ reason: 'still broken' });
      expect(res.status).toBe(403);
    },
  );

  it.each([['HOMEOWNER'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s on the technician self-service surfaces (C1/C3)',
    async (role) => {
      for (const url of [
        '/api/technician/tasks',
        '/api/technician/tasks/summary',
        '/api/technician/repairs/history',
      ]) {
        const res = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`);
        expect(res.status).toBe(403);
      }
    },
  );

  it.each([['TECHNICIAN'], ['PROJECT_MANAGER'], ['COMPANY'], ['HOME_SEEKER']])(
    'refuses %s at the homeowner-only analyze/warranty-check/media endpoints',
    async (role) => {
      const auth = `Bearer ${token(role, role === 'COMPANY' ? 'company-1' : null)}`;
      const analyze = await request(app)
        .post('/api/reports/analyze')
        .set('Authorization', auth)
        .send({ mediaKeys: ['k'] });
      expect(analyze.status).toBe(403);

      const warranty = await request(app)
        .post('/api/reports/warranty-check')
        .set('Authorization', auth)
        .send({ category: 'PLUMBING' });
      expect(warranty.status).toBe(403);

      const media = await request(app)
        .post('/api/reports/media')
        .set('Authorization', auth)
        .send({ fileName: 'a.png', mimeType: 'image/png', contentBase64: 'AA==' });
      expect(media.status).toBe(403);
    },
  );

  it('lets every supervising/participating role past the READ role gate', async () => {
    for (const [role, companyId] of [
      ['HOMEOWNER', null],
      ['TECHNICIAN', null],
      ['PROJECT_MANAGER', null],
      ['COMPANY', 'company-1'],
    ] as [string, string | null][]) {
      const res = await request(app)
        .get('/api/reports/providers')
        .set('Authorization', `Bearer ${signToken({ sub: 'u', role, companyId })}`);
      expect(res.status).toBe(200);
    }
  });
});

describe('Task 8 - endpoints that must NOT exist (decisions.md I0/I2/I8, A7)', () => {
  const homeowner = () => signToken({ sub: 'u', role: 'HOMEOWNER', companyId: null });
  const pm = () => signToken({ sub: 'u', role: 'PROJECT_MANAGER', companyId: null });

  it('has NO manual assignment endpoint for canonical reports (B2/I8)', async () => {
    for (const url of ['/api/reports/assign', '/api/reports/some-id/assign']) {
      const res = await request(app).post(url).set('Authorization', `Bearer ${pm()}`).send({
        technicianId: 'tech-1',
      });
      // 404 = the route does not exist at all. Not 403, not 200.
      expect(res.status).toBe(404);
    }
  });

  it('has NO arbitrary status PATCH (I2)', async () => {
    const res = await request(app)
      .patch('/api/reports/some-id/status')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(404);
  });

  it('has NO DELETE on a report or its timeline (A7 - never deleted)', async () => {
    for (const url of ['/api/reports/some-id', '/api/reports/some-id/timeline']) {
      const res = await request(app).delete(url).set('Authorization', `Bearer ${homeowner()}`);
      expect(res.status).toBe(404);
    }
  });

  it('keeps the LEGACY pre-ownership PM assignment route intact (I0 #7 - preserve legacy behaviour)', async () => {
    // POST /api/repairs still exists and is still PM-only; it belongs to the
    // InspectionReport pipeline B1's resolution deliberately preserves.
    const res = await request(app)
      .post('/api/repairs')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({ reportId: 'r', technicianId: 't' });
    expect(res.status).toBe(403); // exists, but not for this role
  });
});

describe('Task 8 - routing retry endpoint protection (decisions.md I9)', () => {
  it('cannot be invoked by an ordinary authenticated user', async () => {
    for (const role of ['HOMEOWNER', 'TECHNICIAN', 'PROJECT_MANAGER', 'COMPANY']) {
      const res = await request(app)
        .post('/api/reports/routing/retry')
        .set('Authorization', `Bearer ${signToken({ sub: 'u', role, companyId: 'company-1' })}`);
      // A user JWT is not the machine secret, so this is never a success.
      expect([401, 503]).toContain(res.status);
      expect(res.body.success).toBe(false);
    }
  });

  it('is closed (503 ROUTING_RETRY_NOT_CONFIGURED), not open, when no secret is configured', async () => {
    expect(env.routing.retrySecret).toBe('');
    const res = await request(app).post('/api/reports/routing/retry');
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe('ROUTING_RETRY_NOT_CONFIGURED');
  });

  it('rejects a wrong secret once one IS configured', async () => {
    env.routing.retrySecret = 'integration-test-secret';
    try {
      const res = await request(app)
        .post('/api/reports/routing/retry')
        .set('x-routing-retry-secret', 'not-the-secret');
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('INVALID_TOKEN');
    } finally {
      env.routing.retrySecret = '';
    }
  });
});

describe('Task 8 - request validation happens before any business logic', () => {
  const homeowner = () => signToken({ sub: 'u', role: 'HOMEOWNER', companyId: null });
  const technician = () => signToken({ sub: 'u', role: 'TECHNICIAN', companyId: null });

  it('rejects a report with no photos (H8 requires 1-10)', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({ mediaKeys: [], category: 'PLUMBING', problemText: 'تسريب' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a report with more than ten photos', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({
        mediaKeys: Array.from({ length: 11 }, (_, i) => `k${i}`),
        category: 'PLUMBING',
        problemText: 'تسريب',
      });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown category - the enum is the server\'s, not the client\'s', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({ mediaKeys: ['k'], category: 'HVAC', problemText: 'تسريب' });
    expect(res.status).toBe(400);
  });

  it('rejects a reopen with no reason (required by the product rule)', async () => {
    const res = await request(app)
      .post('/api/reports/some-id/reopen')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an approval with no rating, or an out-of-range one', async () => {
    for (const body of [{}, { rating: 0 }, { rating: 6 }, { rating: 3.5 }]) {
      const res = await request(app)
        .post('/api/reports/some-id/approve')
        .set('Authorization', `Bearer ${homeowner()}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('rejects a submit-repair with no after-photo (C2\'s hard rule)', async () => {
    const res = await request(app)
      .post('/api/reports/some-id/submit-repair')
      .set('Authorization', `Bearer ${technician()}`)
      .send({ afterPhotos: [] });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported image MIME type on the media endpoint', async () => {
    const res = await request(app)
      .post('/api/reports/media')
      .set('Authorization', `Bearer ${homeowner()}`)
      .send({ fileName: 'x.gif', mimeType: 'image/gif', contentBase64: 'AA==' });
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range pageSize on the list endpoint', async () => {
    const res = await request(app)
      .get('/api/reports?pageSize=5000')
      .set('Authorization', `Bearer ${homeowner()}`);
    expect(res.status).toBe(400);
  });

  it('rejects an unknown status filter rather than silently ignoring it', async () => {
    const res = await request(app)
      .get('/api/reports?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${homeowner()}`);
    expect(res.status).toBe(400);
  });
});

describe('Task 8 - provider honesty over HTTP (decisions.md I7/I11)', () => {
  it('reports YOLO unavailable and media non-durable, and leaks no secret', async () => {
    const res = await request(app)
      .get('/api/reports/providers')
      .set('Authorization', `Bearer ${signToken({ sub: 'u', role: 'HOMEOWNER', companyId: null })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.objectDetection.available).toBe(false);
    expect(res.body.data.media.durable).toBe(false);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(env.ai.openAiApiKey || '__no_key__');
    expect(serialized).not.toContain('SUPABASE');
    expect(serialized).not.toContain('apiKey');
  });
});

describe('Task 8 - the /files static mount is loadable cross-origin (decisions.md I11)', () => {
  it('sets Cross-Origin-Resource-Policy: cross-origin on /files', async () => {
    // helmet() sets `same-origin` globally, which silently breaks every <img>
    // pointing at this mount whenever the app and API differ in origin - the
    // exact defect the Task 8 browser pass surfaced.
    const res = await request(app).get('/files/does-not-exist.png');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('leaves helmet\'s stricter default in place everywhere else', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});

// ---------------------------------------------------------------------------
// Task 9 (decisions.md J1/J2/J3) - the PM operations surface.
// ---------------------------------------------------------------------------

describe('Task 9 - the PM operations API is Project-Manager-only (decisions.md J3)', () => {
  const PM_ROUTES: Array<[string, string]> = [
    ['get', '/api/pm/overview'],
    ['get', '/api/pm/alerts'],
    ['get', '/api/pm/activity'],
    ['get', '/api/pm/reports'],
    ['get', '/api/pm/contractors'],
    ['get', '/api/pm/contractors/tech-1/performance'],
    ['get', '/api/pm/contractors/tech-1/insight'],
    ['post', '/api/pm/copilot/summary'],
    ['post', '/api/pm/copilot/chat'],
  ];

  it.each(PM_ROUTES)('%s %s requires a token', async (method, url) => {
    const res = await (request(app) as never as Record<string, (u: string) => request.Test>)[method](url);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_REQUIRED');
  });

  it.each(PM_ROUTES)('%s %s rejects a COMPANY token with 403', async (method, url) => {
    // A company supervises its own portfolio through /api/company/*; it does
    // not borrow the PM's project-scoped surface.
    const token = signToken({ sub: 'user-1', role: 'COMPANY', companyId: 'company-1' });
    const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it.each(PM_ROUTES)('%s %s rejects a HOMEOWNER token with 403', async (method, url) => {
    const token = signToken({ sub: 'user-1', role: 'HOMEOWNER', companyId: null });
    const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it.each(PM_ROUTES)('%s %s rejects a TECHNICIAN token with 403', async (method, url) => {
    const token = signToken({ sub: 'user-1', role: 'TECHNICIAN', companyId: null });
    const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Task 9 - the PM is READ-ONLY, enforced by route absence (decisions.md J3)', () => {
  const token = signToken({ sub: 'pm-user', role: 'PROJECT_MANAGER', companyId: null });

  // Every mutating verb a supervisory role might plausibly be given. None of
  // these routes exists on the PM surface, and none may ever be added.
  const FORBIDDEN: Array<[string, string]> = [
    ['post', '/api/pm/reports/report-1/assign'],
    ['patch', '/api/pm/reports/report-1/status'],
    ['patch', '/api/pm/reports/report-1/priority'],
    ['post', '/api/pm/reports/report-1/close'],
    ['post', '/api/pm/reports/report-1/reopen'],
    ['post', '/api/pm/contractors/tech-1/transfer'],
    ['patch', '/api/pm/contractors/tech-1/status'],
    ['delete', '/api/pm/reports/report-1'],
    ['delete', '/api/pm/contractors/tech-1'],
  ];

  it.each(FORBIDDEN)('%s %s does not exist at all (404, i.e. no route)', async (method, url) => {
    const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    // 404 rather than 403: the route is ABSENT, not merely forbidden.
    expect(res.status).toBe(404);
  });

  const COMPANY_ONLY_MUTATIONS: Array<[string, string]> = [
    ['patch', '/api/technicians/tech-1'],
    ['patch', '/api/technicians/tech-1/status'],
    ['post', '/api/technicians/tech-1/transfer'],
    ['post', '/api/technicians/tech-1/resend-invitation'],
    ['post', '/api/technicians'],
    ['post', '/api/homeowners'],
    ['patch', '/api/homeowners/ho-1'],
    ['patch', '/api/homeowners/ho-1/status'],
    ['post', '/api/homeowners/ho-1/transfer'],
    ['post', '/api/projects'],
    ['patch', '/api/projects/proj-1'],
    ['patch', '/api/projects/proj-1/status'],
  ];

  it.each(COMPANY_ONLY_MUTATIONS)(
    'a PM token is refused on the company-only mutation %s %s',
    async (method, url) => {
      const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
        [method](url)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      // Never 2xx. The PM has no path to any of these, hidden UI or not.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect([401, 403, 404]).toContain(res.status);
    },
  );

  const CANONICAL_REPORT_MUTATIONS: Array<[string, string]> = [
    ['post', '/api/reports'],
    ['post', '/api/reports/report-1/start'],
    ['post', '/api/reports/report-1/submit-repair'],
    ['post', '/api/reports/report-1/approve'],
    ['post', '/api/reports/report-1/reopen'],
  ];

  it.each(CANONICAL_REPORT_MUTATIONS)(
    'a PM token cannot drive the canonical report lifecycle: %s %s',
    async (method, url) => {
      const res = await (request(app) as never as Record<string, (u: string) => request.Test>)
        [method](url)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([401, 403, 404]).toContain(res.status);
    },
  );
});

describe('Task 9 - PM query parameters cannot widen scope (decisions.md J2)', () => {
  it('validates projectId as a uuid before it reaches any scoping code', async () => {
    const token = signToken({ sub: 'pm-user', role: 'PROJECT_MANAGER', companyId: null });
    const res = await request(app)
      .get('/api/pm/overview?projectId=not-a-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('bounds the activity limit', async () => {
    const token = signToken({ sub: 'pm-user', role: 'PROJECT_MANAGER', companyId: null });
    const res = await request(app)
      .get('/api/pm/activity?limit=100000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('requires a non-empty chat message', async () => {
    const token = signToken({ sub: 'pm-user', role: 'PROJECT_MANAGER', companyId: null });
    const res = await request(app)
      .post('/api/pm/copilot/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('bounds the chat message length', async () => {
    const token = signToken({ sub: 'pm-user', role: 'PROJECT_MANAGER', companyId: null });
    const res = await request(app)
      .post('/api/pm/copilot/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('Task 9 - the legacy PM dashboard is preserved, not repurposed (decisions.md J1)', () => {
  it('still exists and still requires a PROJECT_MANAGER token', async () => {
    const companyToken = signToken({ sub: 'u', role: 'COMPANY', companyId: 'c' });
    const res = await request(app)
      .get('/api/pm/dashboard')
      .set('Authorization', `Bearer ${companyToken}`);
    // Unchanged behaviour: the role gate is the same one it always had.
    expect(res.status).toBe(403);
  });

  it('the new granular routes did not shadow it', async () => {
    const res = await request(app).get('/api/pm/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('AUTH_REQUIRED');
  });
});
