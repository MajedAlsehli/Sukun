import { env, collectConfigurationErrors, configurationReport, assertProductionConfiguration, ConfigurationError } from '../config/env';

/**
 * Task 10 - production configuration validation.
 *
 * The rule under test: a missing REQUIRED production variable produces one
 * controlled, readable configuration error naming the variables. Never a stack
 * trace, never a 500 halfway through a request, and never a server that boots
 * on a development default and looks healthy.
 *
 * Optional providers are deliberately NOT boot failures - a missing OpenAI
 * key, Storage bucket or routing secret is a documented honest-unavailable
 * state.
 */
describe('production configuration validation (Task 10)', () => {
  const snapshot = JSON.parse(
    JSON.stringify({
      isProduction: env.isProduction,
      databaseUrl: env.databaseUrl,
      jwt: env.jwt,
      frontendUrl: env.frontendUrl,
      cookie: env.cookie,
      routing: env.routing,
      reportMedia: env.reportMedia,
      demo: env.demo,
    }),
  );
  const originalFrontendUrlVar = process.env.FRONTEND_URL;

  const STRONG_A = 'a'.repeat(48);
  const STRONG_B = 'b'.repeat(48);

  function makeValidProduction() {
    env.isProduction = true;
    env.databaseUrl = 'postgresql://user:pass@db.example:6543/postgres';
    env.jwt.accessSecret = STRONG_A;
    env.jwt.refreshSecret = STRONG_B;
    env.frontendUrl = 'https://sakn-app.vercel.app';
    process.env.FRONTEND_URL = 'https://sakn-app.vercel.app';
    env.cookie.sameSite = 'none';
    env.cookie.secure = true;
    env.routing.retrySecret = '';
    env.reportMedia.driver = '';
    env.demo.password = '';
  }

  afterEach(() => {
    env.isProduction = snapshot.isProduction;
    env.databaseUrl = snapshot.databaseUrl;
    env.jwt.accessSecret = snapshot.jwt.accessSecret;
    env.jwt.refreshSecret = snapshot.jwt.refreshSecret;
    env.frontendUrl = snapshot.frontendUrl;
    env.cookie.sameSite = snapshot.cookie.sameSite;
    env.cookie.secure = snapshot.cookie.secure;
    env.routing.retrySecret = snapshot.routing.retrySecret;
    env.reportMedia.driver = snapshot.reportMedia.driver;
    env.demo.password = snapshot.demo.password;
    if (originalFrontendUrlVar === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrlVar;
  });

  it('reports nothing outside production - development keeps its fallbacks', () => {
    env.isProduction = false;
    env.databaseUrl = '';
    env.jwt.accessSecret = '';
    expect(collectConfigurationErrors()).toEqual([]);
  });

  it('accepts a fully configured production environment', () => {
    makeValidProduction();
    expect(collectConfigurationErrors()).toEqual([]);
    expect(() => assertProductionConfiguration()).not.toThrow();
  });

  it('names every missing required variable at once, rather than failing on the first', () => {
    makeValidProduction();
    env.databaseUrl = '';
    env.jwt.accessSecret = '';
    delete process.env.FRONTEND_URL;

    const errors = collectConfigurationErrors();
    expect(errors.join('\n')).toContain('DATABASE_URL');
    expect(errors.join('\n')).toContain('JWT_ACCESS_SECRET');
    expect(errors.join('\n')).toContain('FRONTEND_URL');
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('throws ONE readable ConfigurationError, never a bare crash', () => {
    makeValidProduction();
    env.databaseUrl = '';

    expect(() => assertProductionConfiguration()).toThrow(ConfigurationError);
    try {
      assertProductionConfiguration();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigurationError);
      expect((err as ConfigurationError).missing).toHaveLength(1);
      expect((err as Error).message).toContain('Invalid production configuration');
    }
  });

  // The single most important case: a development fallback silently becoming
  // the production signing key.
  it('refuses the development JWT fallback in production', () => {
    makeValidProduction();
    env.jwt.accessSecret = 'dev-access-secret';
    expect(collectConfigurationErrors().join('\n')).toContain('JWT_ACCESS_SECRET must be at least 32');
  });

  it('refuses a shared access/refresh secret', () => {
    makeValidProduction();
    env.jwt.refreshSecret = STRONG_A;
    expect(collectConfigurationErrors().join('\n')).toContain('must be different values');
  });

  it('refuses a non-https frontend origin in production', () => {
    makeValidProduction();
    env.frontendUrl = 'http://sakn-app.vercel.app';
    process.env.FRONTEND_URL = 'http://sakn-app.vercel.app';
    expect(collectConfigurationErrors().join('\n')).toContain('https://');
  });

  it('refuses SameSite=None without Secure', () => {
    makeValidProduction();
    env.cookie.secure = false;
    expect(collectConfigurationErrors().join('\n')).toContain('SameSite=None');
  });

  it('accepts an UNSET routing secret (endpoint stays closed) but refuses a weak one', () => {
    makeValidProduction();
    env.routing.retrySecret = '';
    expect(collectConfigurationErrors()).toEqual([]);

    env.routing.retrySecret = 'changeme';
    expect(collectConfigurationErrors().join('\n')).toContain('ROUTING_RETRY_SECRET must be at least 32');
  });

  it('refuses the non-durable test media driver in production', () => {
    makeValidProduction();
    env.reportMedia.driver = 'test';
    expect(collectConfigurationErrors().join('\n')).toContain('not permitted in production');
  });

  it('refuses a demo seed password left in the running production environment', () => {
    makeValidProduction();
    env.demo.password = 'anything';
    expect(collectConfigurationErrors().join('\n')).toContain('DEMO_SEED_PASSWORD');
  });

  it('does NOT fail the boot for any optional provider being absent', () => {
    makeValidProduction();
    env.routing.retrySecret = '';
    expect(collectConfigurationErrors()).toEqual([]);
  });
});

describe('configuration report (Task 10)', () => {
  it('reports presence only - never a secret value', () => {
    const report = configurationReport();
    const serialized = JSON.stringify(report);

    // Every entry is a boolean-plus-description, so a real secret cannot leak
    // through this surface even if one is configured.
    for (const entry of report) {
      expect(typeof entry.configured).toBe('boolean');
      expect(typeof entry.required).toBe('boolean');
    }
    if (env.jwt.accessSecret) expect(serialized).not.toContain(env.jwt.accessSecret);
    if (env.ai.openAiApiKey) expect(serialized).not.toContain(env.ai.openAiApiKey);
    if (env.databaseUrl) expect(serialized).not.toContain(env.databaseUrl);
  });

  it('covers every variable the deployment runbook lists as required', () => {
    const names = configurationReport().map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'DIRECT_URL',
        'FRONTEND_URL',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'OPENAI_API_KEY',
        'SUPABASE_STORAGE_URL',
        'SUPABASE_STORAGE_SERVICE_KEY',
        'SUPABASE_STORAGE_BUCKET',
        'SUPABASE_STORAGE_PRIVATE_BUCKET',
        'ROUTING_RETRY_SECRET',
        'YOLO_INFERENCE_URL',
        'YOLO_INFERENCE_API_KEY',
      ]),
    );
  });
});
