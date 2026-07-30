import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/**
 * Task 10: a development-only fallback must never silently become a
 * production value. In production the fallback is refused outright and the
 * variable is reported by `collectConfigurationErrors()` below, which turns
 * into ONE controlled configuration error at boot - never a stack trace, and
 * never a server that runs happily on `dev-access-secret`.
 */
function devFallback(name: string, fallback: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (isProduction) return '';
  void name;
  return fallback;
}

/**
 * Task 9: an unset or malformed operational threshold resolves to `null`
 * ("not configured"), never to a number. Zero and negatives are rejected for
 * the same reason - a threshold of 0 would fire on everything, which is not
 * what an operator who typed a bad value meant.
 */
function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Returns null unless the value parses AND falls inside the documented range. */
function parseBoundedFloat(raw: string | undefined, min: number, max: number): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The per-IP auth limiter's shipped values. Named constants rather than inline
 * literals so the number the tests assert, the number the code runs on and the
 * number the operator reads are provably the same one.
 */
export const AUTH_RATE_LIMIT_DEFAULT_MAX = 200;
export const AUTH_RATE_LIMIT_DEFAULT_WINDOW_MINUTES = 15;

const frontendUrlRaw = process.env.FRONTEND_URL ?? 'http://localhost:5173';
// Trailing slashes make an exact CORS origin comparison fail for no good
// reason - `https://x.vercel.app/` is the same origin as `https://x.vercel.app`.
const frontendUrl = frontendUrlRaw.replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Exact-origin allowlist (FRONTEND_URLS).
//
// `FRONTEND_URL` admits exactly ONE credentialed origin, and it drives both
// `cors({ credentials: true })` and the `requireAllowedOrigin` CSRF guard. That
// is correct and stays correct - but a second, separately-deployed frontend
// (and a local integration run on http://localhost:3001) needs to be admissible
// without taking the first one away.
//
// `FRONTEND_URLS` is therefore an OPTIONAL comma-separated list of ADDITIONAL
// exact origins. It is not a relaxation:
//
//   * every entry must parse as a real `scheme://host[:port]` origin and must
//     be byte-identical to its own canonical `URL.origin` - so a path, a query
//     string, a fragment, credentials, a non-default-stripped port spelling or
//     anything unparseable is refused outright, never coerced;
//   * `*` anywhere in an entry is refused - a wildcard is illegal alongside
//     credentials and must never be reachable by configuration;
//   * matching is exact string equality, so `https://sakn-app.vercel.app.evil`
//     and `https://evil-sakn-app.vercel.app` never match - there is no suffix,
//     prefix or substring comparison anywhere in this file or in the guard;
//   * `FRONTEND_URL` is ALWAYS a member of the resolved list, verbatim, so an
//     existing single-origin deployment behaves exactly as it did before;
//   * entries are trimmed and de-duplicated, and blank entries (a trailing or
//     doubled comma) are dropped rather than admitted.
//
// A refused entry is not silently ignored: it is reported by
// `collectConfigurationErrors()` in production and by `configurationReport()`
// everywhere, so a typo fails loudly instead of quietly narrowing the list.
// ---------------------------------------------------------------------------

/**
 * Returns the canonical origin for `raw`, or `null` if `raw` is not an exact,
 * unambiguous origin. Deliberately strict: this value ends up in
 * `Access-Control-Allow-Origin` on credentialed responses.
 */
export function normalizeAllowedOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  // Refused before parsing: `new URL('https://*.vercel.app')` parses happily.
  if (trimmed.includes('*')) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  // The decisive check: anything the URL parser had to normalize away (a path,
  // an explicit default port, uppercase host, ...) makes this unequal, and an
  // origin we had to rewrite is an origin the operator did not actually type.
  if (url.origin !== trimmed) return null;

  return url.origin;
}

export interface AllowedOriginsResolution {
  /** Exact origins admitted for credentialed CORS and the CSRF origin guard. */
  origins: string[];
  /** Entries of `FRONTEND_URLS` that were refused. Never admitted, always reported. */
  invalid: string[];
}

/**
 * Resolves the one allowlist shared by `cors()` and `requireAllowedOrigin`.
 * `frontendUrl` is always first and always present (backwards compatibility);
 * `frontendUrlsRaw` contributes only entries that survive
 * `normalizeAllowedOrigin`.
 */
export function resolveAllowedOrigins(
  frontendUrlValue: string,
  frontendUrlsRaw: string | undefined,
): AllowedOriginsResolution {
  const origins: string[] = [frontendUrlValue];
  const invalid: string[] = [];

  for (const entry of (frontendUrlsRaw ?? '').split(',')) {
    // A blank entry is a formatting artefact of a trailing/doubled comma, not
    // an operator intention - dropped, never admitted, never an error.
    if (entry.trim() === '') continue;
    const normalized = normalizeAllowedOrigin(entry);
    if (normalized === null) {
      invalid.push(entry.trim());
      continue;
    }
    if (!origins.includes(normalized)) origins.push(normalized);
  }

  return { origins, invalid };
}

const allowedOrigins = resolveAllowedOrigins(frontendUrl, process.env.FRONTEND_URLS);

/**
 * Task 10: `SameSite=Lax` is not sent on a cross-site request, and on Vercel
 * the frontend (`sakn-app.vercel.app`) and the backend
 * (`sakn-backend.vercel.app`) are cross-site - `.vercel.app` is on the Public
 * Suffix List, so the two are separate registrable domains. A production
 * deployment therefore needs `SameSite=None; Secure` or the refresh cookie is
 * simply never sent and every session dies on reload.
 *
 * `SameSite=None` re-opens CSRF on the two cookie-authenticated endpoints, so
 * `shared/originGuard.middleware.ts` pins them to the one allowed origin.
 * Override with SESSION_COOKIE_SAMESITE only if you deploy same-site (e.g.
 * behind one domain with a path rewrite), where `lax` is stronger.
 */
function resolveSameSite(): 'lax' | 'none' | 'strict' {
  const raw = (process.env.SESSION_COOKIE_SAMESITE ?? '').trim().toLowerCase();
  if (raw === 'lax' || raw === 'none' || raw === 'strict') return raw;
  return isProduction ? 'none' : 'lax';
}

const sameSite = resolveSameSite();

export const env = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv,
  isProduction,

  databaseUrl: process.env.DATABASE_URL ?? '',
  // Task 10: pooled (PgBouncer, port 6543) for the running app; direct
  // (port 5432) for `prisma migrate deploy`, which needs a real session and
  // advisory locks a transaction pooler cannot provide. Prisma reads this
  // itself via schema.prisma's `directUrl`; it is listed here only so the
  // configuration report can tell you whether it is set.
  directDatabaseUrl: process.env.DIRECT_URL ?? '',

  // Origin allowed to send credentialed (cookie-carrying) requests - CORS
  // rejects credentialed requests from any other origin, and a wildcard
  // ("*") is not legal for Access-Control-Allow-Origin when credentials are
  // involved, so this must be one explicit origin, not a list or a wildcard.
  frontendUrl,

  // The resolved exact-origin allowlist: `frontendUrl` plus every valid entry
  // of the optional `FRONTEND_URLS`. THE one list - `app.ts`'s credentialed
  // `cors()` and `shared/originGuard.middleware.ts` both read it and nothing
  // else. Never contains a wildcard; matching is always exact equality.
  frontendUrls: allowedOrigins.origins,
  /** Refused `FRONTEND_URLS` entries - reported, never admitted. */
  frontendUrlsInvalid: allowedOrigins.invalid,

  // Absolute origin this API is reachable at. Used for the `test` report-media
  // driver's file URLs and for the Swagger server entry.
  publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),

  jwt: {
    accessSecret: devFallback('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: devFallback('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  cookie: {
    sameSite,
    // Never sendable over plain HTTP once Secure is set, so it stays off in
    // local development; `SameSite=None` is invalid without it, so any
    // deployment that needs cross-site cookies must be HTTPS (Vercel always is).
    secure: isProduction || sameSite === 'none',
  },

  password: {
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH ?? '8', 10),
  },

  login: {
    maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? '15', 10),
  },

  // Per-IP limiter on the auth surface. Still ON, still per-IP, and still
  // entirely separate from SEC-007's per-account lockout, which these values
  // do not weaken in any way.
  //
  // The limit is 200 requests per 15 minutes. It is deliberately NOT 20 any
  // more: the auth surface counts the silent `/auth/refresh` that every full
  // page load fires, so a handful of real people demonstrating six roles from
  // one office IP legitimately exceeds 20 and gets 429s that say nothing about
  // anything except the limiter itself. 200/15min is a permanent operational
  // value, not a temporary event override - there is no scheduled rollback.
  //
  // Both halves stay configurable through the environment so an operator can
  // change them without a code deploy; `AUTH_RATE_LIMIT_MAX=200` is set
  // explicitly in the Production environment so the effective value is stated
  // in configuration as well as in code. A malformed or non-positive override
  // falls back to the default rather than resolving to NaN, which
  // express-rate-limit would treat as "no request is ever allowed".
  authRateLimit: {
    max: parseIntOr(process.env.AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_DEFAULT_MAX),
    windowMinutes: parseIntOr(
      process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
      AUTH_RATE_LIMIT_DEFAULT_WINDOW_MINUTES,
    ),
  },

  storage: {
    root: process.env.STORAGE_ROOT ?? './storage',
  },

  // Task 4 (decisions.md E7) / Task 10 (decisions.md K3): Supabase Storage.
  // Two buckets, because the media in this product is not all equally public:
  //
  //   * `bucket`        - PUBLIC. Project covers and gallery images only. These
  //                       are marketing content on a discoverable project and
  //                       are meant to be loadable by an anonymous browser.
  //   * `privateBucket` - PRIVATE. Report photos and visit note/issue photos:
  //                       a homeowner's own property evidence. Objects are
  //                       reachable only through a short-lived signed URL the
  //                       server mints AFTER it has already authorized the
  //                       caller for the parent report/visit.
  //
  // Absent/incomplete config means each adapter honestly reports itself
  // unavailable rather than silently falling back to local disk.
  supabaseStorage: {
    url: (process.env.SUPABASE_STORAGE_URL ?? '').replace(/\/+$/, ''),
    serviceKey: process.env.SUPABASE_STORAGE_SERVICE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? '',
    // Falls back to the public bucket name only when explicitly unset, so an
    // existing single-bucket deployment keeps working; production should set
    // both and mark this one private.
    privateBucket:
      process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? process.env.SUPABASE_STORAGE_BUCKET ?? '',
    // Signed-URL lifetime for private objects. Short enough that a leaked URL
    // expires quickly, long enough that a slow page load still renders.
    signedUrlTtlSeconds: parseIntOr(process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS, 300),
  },

  // Task 8 (decisions.md I11): canonical report/repair photos. Supabase
  // Storage is the only production-capable driver; `test` is an explicit,
  // non-durable local-disk driver for automated/browser verification that
  // refuses to construct under NODE_ENV=production. Anything else leaves the
  // adapter honestly unavailable (REPORT_MEDIA_STORAGE_NOT_CONFIGURED).
  reportMedia: {
    driver: process.env.REPORT_MEDIA_STORAGE_DRIVER ?? '',
    // Only the `test` driver needs this: it serves photos back through this
    // API's own /files mount, so the URL has to be absolute against the API
    // origin - a root-relative path would resolve against the FRONTEND origin
    // and 404 whenever the two differ (which they do in dev). Supabase URLs are
    // already absolute and ignore this entirely.
    publicBaseUrl: process.env.PUBLIC_API_BASE_URL ?? '',
  },

  // Task 9 (decisions.md J5a). The SLA "at risk" threshold has NO evidence
  // anywhere in the reference set - PM2 renders a "near" chip without ever
  // saying when it triggers - so it is an operational heuristic that must be
  // configured deliberately, not a default that looks like a product rule.
  //
  // UNSET (the shipped state) means the AT_RISK label is not produced at all:
  // a report reads ON_TIME until it genuinely BREACHES. Set to a fraction
  // strictly between 0 and 1 to enable it (0.75 reproduces Task 8's original
  // behaviour). A malformed value is ignored, never coerced.
  //
  // This never affects the stored `Report.slaStartDueAt` or the hard states
  // (ON_TIME / BREACHED / MET / NOT_CONFIGURED), which stay based strictly on
  // the immutable due date Task 8 wrote at creation.
  reportSla: {
    atRiskFractionRaw: process.env.REPORT_SLA_AT_RISK_FRACTION ?? '',
  },

  // Task 9 (decisions.md J6): PM alert thresholds that the reference does not
  // evidence either. Both UNSET by default, and an unset threshold means the
  // corresponding alert type is NOT generated - the alerts payload reports the
  // rule as unconfigured rather than implying it was checked and found clean.
  pmAlerts: {
    awaitingApprovalHours: parsePositiveNumber(process.env.PM_ALERT_AWAITING_APPROVAL_HOURS),
    stalledHours: parsePositiveNumber(process.env.PM_ALERT_STALLED_HOURS),
  },

  // Task 8 (decisions.md I9): protects POST /api/reports/routing/retry, the
  // endpoint Vercel Cron calls (Task 10 ships the schedule in vercel.json).
  // Unset means the route responds 503 ROUTING_RETRY_NOT_CONFIGURED and does
  // nothing - it is never open, and no secret is hard-coded anywhere in source.
  //
  // Task 10 additionally refuses a weak secret in production: fewer than 32
  // characters is reported as a configuration error rather than accepted, so a
  // cron endpoint can never end up guarded by "changeme".
  routing: {
    retrySecret: process.env.ROUTING_RETRY_SECRET ?? '',
  },

  ai: {
    openAiApiKey: process.env.OPENAI_API_KEY ?? '',
    // Task 008's pre-existing inspection-report detection layer. Left with its
    // own name on purpose - wiring the Task 8 YOLO provider below must not
    // silently activate this one, or vice versa (decisions.md I7).
    yoloServiceUrl: process.env.YOLO_DETECTION_SERVICE_URL ?? '',
    // Task 8 (decisions.md I7) / Task 10: the canonical report-domain
    // object-detection provider. UNCONFIGURED in this environment - standard
    // pretrained YOLO weights are not a building-defect detector, and nothing
    // claims YOLO is active until a real custom-trained inference service
    // exists behind these. `YOLO_INFERENCE_API_KEY` is the name Task 10
    // standardises on; `YOLO_API_KEY` stays accepted so an existing
    // environment keeps working.
    yoloInferenceUrl: process.env.YOLO_INFERENCE_URL ?? '',
    yoloApiKey: process.env.YOLO_INFERENCE_API_KEY ?? process.env.YOLO_API_KEY ?? '',
    // Optional detector tuning. Both are sent ONLY when configured and only
    // inside the ranges the service's own OpenAPI declares - an out-of-range
    // value is ignored rather than forwarded, because the deployed service
    // answers 502 to some of them (measured, not assumed).
    yoloConfidence: parseBoundedFloat(process.env.YOLO_INFERENCE_CONFIDENCE, 0.01, 1),
    yoloIou: parseBoundedFloat(process.env.YOLO_INFERENCE_IOU, 0.01, 0.99),
  },

  // Task 10: real outbound delivery has never been configured in this product.
  // With these unset, notifications are persisted and left QUEUED, and nothing
  // anywhere claims an email or SMS was sent (notifications/notification.service.ts).
  messaging: {
    emailProvider: process.env.EMAIL_PROVIDER ?? '',
    emailApiKey: process.env.EMAIL_API_KEY ?? '',
    emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? '',
    smsProvider: process.env.SMS_PROVIDER ?? '',
    smsApiKey: process.env.SMS_API_KEY ?? '',
    smsFromNumber: process.env.SMS_FROM_NUMBER ?? '',
  },

  // Task 10: the investor-demo tenant. The password is NEVER defaulted and
  // never written to disk by the seed - it is supplied per-run through this
  // variable (or an interactive prompt) and is not part of any committed file.
  demo: {
    tenantLabel: process.env.DEMO_TENANT_LABEL ?? 'SAKN-DEMO',
    password: process.env.DEMO_SEED_PASSWORD ?? '',
    emailDomain: process.env.DEMO_EMAIL_DOMAIN ?? 'sakn-demo.sa',
  },

  sakani: {
    baseUrl:
      process.env.SAKANI_API_BASE_URL ??
      'https://api.parse.bot/scraper/3c3b72cb-83ce-403f-b898-78ebf5629b32',
    apiKey: process.env.PARSE_API_KEY ?? '',
    snapshotVersion: process.env.PARSE_API_SNAPSHOT_VERSION ?? '6',
  },

  docs: {
    // Task 10: Swagger is a complete map of the API surface. It stays open in
    // development, and in production it is served only when explicitly enabled
    // (and, if SWAGGER_TOKEN is set, only to a caller presenting it).
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? '').toLowerCase() === 'true' || !isProduction,
    swaggerToken: process.env.SWAGGER_TOKEN ?? '',
  },
};

// ---------------------------------------------------------------------------
// Task 10 - production configuration validation.
//
// The rule this enforces: a missing REQUIRED production variable must produce
// one controlled, readable configuration error naming the variables - never a
// stack trace, never a 500 halfway through a request, and never a server that
// boots on a development default and looks healthy.
//
// Optional providers are deliberately NOT listed here. A missing OpenAI key,
// Storage bucket or routing secret is a documented honest-unavailable state,
// not a boot failure.
// ---------------------------------------------------------------------------

export interface ConfigurationReportEntry {
  name: string;
  configured: boolean;
  required: boolean;
  note: string;
}

const MIN_SECRET_LENGTH = 32;

export function collectConfigurationErrors(): string[] {
  if (!env.isProduction) return [];

  const errors: string[] = [];

  if (!env.databaseUrl) {
    errors.push('DATABASE_URL is required (pooled Supabase/PostgreSQL connection string).');
  }
  if (!env.jwt.accessSecret) {
    errors.push('JWT_ACCESS_SECRET is required in production (no development fallback applies).');
  } else if (env.jwt.accessSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  if (!env.jwt.refreshSecret) {
    errors.push('JWT_REFRESH_SECRET is required in production (no development fallback applies).');
  } else if (env.jwt.refreshSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  if (env.jwt.accessSecret && env.jwt.accessSecret === env.jwt.refreshSecret) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
  if (!process.env.FRONTEND_URL) {
    errors.push(
      'FRONTEND_URL is required in production - credentialed CORS needs one explicit frontend origin, never a wildcard.',
    );
  } else if (!/^https:\/\//.test(env.frontendUrl)) {
    errors.push('FRONTEND_URL must be an https:// origin in production.');
  }
  // A wildcard is illegal alongside `credentials: true` and must never be
  // reachable by configuration - not through FRONTEND_URL, not through
  // FRONTEND_URLS. (A wildcard in FRONTEND_URLS is already refused by
  // `normalizeAllowedOrigin` and lands in `frontendUrlsInvalid` below; this
  // catches the one origin that is admitted verbatim for compatibility.)
  if (env.frontendUrl.includes('*')) {
    errors.push(
      'FRONTEND_URL must be one exact origin - a wildcard is not legal for credentialed CORS.',
    );
  }
  // Count only, never the values: a refused entry must fail loudly rather than
  // quietly narrowing the allowlist to something the operator did not intend.
  if (env.frontendUrlsInvalid.length > 0) {
    errors.push(
      `FRONTEND_URLS has ${env.frontendUrlsInvalid.length} invalid entr${
        env.frontendUrlsInvalid.length === 1 ? 'y' : 'ies'
      } - each must be one exact origin (scheme://host[:port]) with no wildcard, path, query string or fragment.`,
    );
  }
  if (env.cookie.sameSite === 'none' && !env.cookie.secure) {
    errors.push('SameSite=None session cookies require Secure - production must be served over HTTPS.');
  }
  // Optional, but a *weak* value is worse than an absent one: an unset secret
  // closes the endpoint, a short one leaves it guessable.
  if (env.routing.retrySecret && env.routing.retrySecret.length < MIN_SECRET_LENGTH) {
    errors.push(
      `ROUTING_RETRY_SECRET must be at least ${MIN_SECRET_LENGTH} characters when set (leave it unset to keep the endpoint closed).`,
    );
  }
  if (env.reportMedia.driver === 'test') {
    errors.push('REPORT_MEDIA_STORAGE_DRIVER=test is not permitted in production.');
  }
  if (env.demo.password) {
    errors.push(
      'DEMO_SEED_PASSWORD must not be present in the running production environment - it is a one-off seed input, not a runtime variable.',
    );
  }

  return errors;
}

/**
 * A single, readable summary of every optional provider's real state. Nothing
 * here prints or returns a secret value - only whether one is present.
 */
export function configurationReport(): ConfigurationReportEntry[] {
  const s = env.supabaseStorage;
  return [
    { name: 'DATABASE_URL', configured: !!env.databaseUrl, required: true, note: 'pooled connection used by the running app' },
    { name: 'DIRECT_URL', configured: !!env.directDatabaseUrl, required: false, note: 'direct connection used by prisma migrate deploy' },
    { name: 'FRONTEND_URL', configured: !!process.env.FRONTEND_URL, required: true, note: `credentialed CORS origin (${env.frontendUrl})` },
    {
      name: 'FRONTEND_URLS',
      configured: !!process.env.FRONTEND_URLS,
      required: false,
      // Origins, never secrets - the same class of value FRONTEND_URL already
      // reports above. The refused count is named; the refused values are not.
      note:
        `${env.frontendUrls.length} exact origin(s) allowed for credentialed CORS and the refresh/logout origin guard` +
        (env.frontendUrlsInvalid.length > 0
          ? `; ${env.frontendUrlsInvalid.length} invalid entr${env.frontendUrlsInvalid.length === 1 ? 'y was' : 'ies were'} refused`
          : ''),
    },
    { name: 'JWT_ACCESS_SECRET', configured: !!env.jwt.accessSecret, required: true, note: 'access-token signing key' },
    { name: 'JWT_REFRESH_SECRET', configured: !!env.jwt.refreshSecret, required: true, note: 'refresh-token signing key' },
    { name: 'OPENAI_API_KEY', configured: !!env.ai.openAiApiKey, required: false, note: 'AI analysis, recommendations, PM Copilot; unset = honest unavailable' },
    { name: 'SUPABASE_STORAGE_URL', configured: !!s.url, required: false, note: 'media storage base URL' },
    { name: 'SUPABASE_STORAGE_SERVICE_KEY', configured: !!s.serviceKey, required: false, note: 'server-only service credential' },
    { name: 'SUPABASE_STORAGE_BUCKET', configured: !!s.bucket, required: false, note: 'PUBLIC bucket - project covers/gallery' },
    { name: 'SUPABASE_STORAGE_PRIVATE_BUCKET', configured: !!s.privateBucket, required: false, note: 'PRIVATE bucket - report and visit photos (signed URLs only)' },
    { name: 'ROUTING_RETRY_SECRET', configured: !!env.routing.retrySecret, required: false, note: 'unset = POST /api/reports/routing/retry answers 503 and stays closed' },
    { name: 'YOLO_INFERENCE_URL', configured: !!env.ai.yoloInferenceUrl, required: false, note: 'external defect-detection service; unset = not enabled' },
    { name: 'YOLO_INFERENCE_API_KEY', configured: !!env.ai.yoloApiKey, required: false, note: 'auth for the above' },
    { name: 'EMAIL_PROVIDER', configured: !!env.messaging.emailProvider, required: false, note: 'unset = notifications persist QUEUED, nothing is sent' },
    { name: 'SMS_PROVIDER', configured: !!env.messaging.smsProvider, required: false, note: 'unset = notifications persist QUEUED, nothing is sent' },
    { name: 'PARSE_API_KEY', configured: !!env.sakani.apiKey, required: false, note: 'Sakani market-data scraper; unset = no import' },
    { name: 'REPORT_SLA_AT_RISK_FRACTION', configured: !!env.reportSla.atRiskFractionRaw, required: false, note: 'unset = AT_RISK label never produced' },
    { name: 'PM_ALERT_AWAITING_APPROVAL_HOURS', configured: env.pmAlerts.awaitingApprovalHours !== null, required: false, note: 'unset = alert type not generated' },
    { name: 'PM_ALERT_STALLED_HOURS', configured: env.pmAlerts.stalledHours !== null, required: false, note: 'unset = alert type not generated' },
  ];
}

/** Thrown once, at boot, when production configuration is incomplete. */
export class ConfigurationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Invalid production configuration:\n  - ${missing.join('\n  - ')}`);
    this.name = 'ConfigurationError';
    this.missing = missing;
  }
}

export function assertProductionConfiguration(): void {
  const errors = collectConfigurationErrors();
  if (errors.length > 0) throw new ConfigurationError(errors);
}
