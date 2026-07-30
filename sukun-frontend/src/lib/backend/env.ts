/**
 * The ONE place the Sakn Backend base URL is resolved and normalized.
 *
 * `NEXT_PUBLIC_API_URL` is the only backend-related environment variable this
 * frontend reads. It is public by construction (every `NEXT_PUBLIC_*` value is
 * compiled into the browser bundle), so it may only ever hold an origin — never
 * a key, a secret, a database URL, or a Supabase service-role credential. The
 * backend keeps every secret on its own side; private media reaches this app as
 * a short-lived signed URL the backend minted after authorizing the request
 * (`sakn-backend/docs/integration/decisions.md` K3).
 *
 * Normalization exists because the two obvious ways to configure this are both
 * in use in this project's history:
 *
 *   NEXT_PUBLIC_API_URL=https://sakn-backend.vercel.app
 *   NEXT_PUBLIC_API_URL=https://sakn-backend.vercel.app/api
 *
 * Every backend route is mounted under `/api/*` (`sakn-backend/src/app.ts`), so
 * callers throughout this codebase write paths WITHOUT the prefix
 * (`/auth/login`, `/reports`, ...). `normalizeApiBaseUrl` therefore guarantees
 * the resolved base always ends in exactly one `/api`, so a caller can never
 * accidentally produce `/api/api/auth/login` — the failure mode the Vite
 * frontend's own README calls out.
 */

/** Fallback used when `NEXT_PUBLIC_API_URL` is unset — a same-origin `/api` mount. */
export const DEFAULT_API_BASE_URL = "/api";

/**
 * Collapses any of the accepted spellings onto one canonical base that ends in
 * a single `/api` and never has a trailing slash.
 *
 * - `""` / `undefined`            -> `/api`
 * - `https://host`                -> `https://host/api`
 * - `https://host/`               -> `https://host/api`
 * - `https://host/api`            -> `https://host/api`
 * - `https://host/api/`           -> `https://host/api`
 * - `https://host/api/api`        -> `https://host/api`
 * - `/api` / `/api/`              -> `/api`
 */
export function normalizeApiBaseUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;

  // Strip every trailing slash, then every trailing `/api` segment, then re-add
  // exactly one. Repeating the strip handles a doubled prefix without a loop
  // over an attacker-controlled string.
  let base = trimmed.replace(/\/+$/, "");
  while (/\/api$/i.test(base)) {
    base = base.slice(0, -"/api".length).replace(/\/+$/, "");
  }
  return `${base}/api`;
}

/**
 * Joins the normalized base with a caller path. Callers pass backend paths
 * without the `/api` prefix (`/auth/login`); an absolute `http(s)://` path is
 * passed through untouched so a signed media URL can be fetched directly.
 */
export function joinApiPath(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${suffix}`;
}

/**
 * Resolved once per module evaluation. Read through `getApiBaseUrl()` rather
 * than importing this constant directly, so tests can reason about the
 * normalization function independently of the ambient environment.
 */
const RESOLVED_API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export function getApiBaseUrl(): string {
  return RESOLVED_API_BASE_URL;
}
