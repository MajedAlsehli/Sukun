/**
 * The current Backend's `/api/auth/*` contract, typed.
 *
 * Verified against the code on disk, not against comments elsewhere in this
 * frontend (several of which describe a Task-1-era contract that no longer
 * exists):
 *
 *   sakn-backend/src/auth/auth.routes.ts      — the seven live routes
 *   sakn-backend/src/auth/auth.dto.ts         — request schemas
 *   sakn-backend/src/auth/auth.mapper.ts      — SessionUserDto / SessionResponseDto
 *   sakn-backend/src/auth/accountState.ts     — the server-derived `role`
 *   sakn-backend/src/auth/refreshCookie.ts    — the httpOnly cookie
 *
 * Two facts drive everything here:
 *
 *  - **The refresh token never appears in a response body.** It is set as an
 *    httpOnly, `/api/auth`-scoped cookie by the controller and read back off the
 *    request the same way. `refresh()` and `logout()` therefore send NO body and
 *    rely entirely on `credentials: 'include'`.
 *  - **`role` is already the derived frontend role.** `accountState.ts` resolves
 *    `homeowner_prospect` / `homeowner_pending` / `homeowner_active` server-side
 *    from `User.role` + the latest `HomeownerActivation` row. The client must
 *    never re-derive it (decisions.md A1/D2).
 */

import { apiClient } from "./client";

export type BackendRole = "HOME_SEEKER" | "HOMEOWNER" | "TECHNICIAN" | "PROJECT_MANAGER" | "COMPANY";

/** `sakn-backend/src/auth/accountState.ts#FrontendRole` — identical values to this app's `AppRole`. */
export type BackendFrontendRole =
  | "homeowner_prospect"
  | "homeowner_pending"
  | "homeowner_active"
  | "technician"
  | "pm"
  | "company";

/** Prisma `UserStatus`. `ARCHIVED` is this product's deactivated state (decisions.md F8). */
export type AccountStatus = "ACTIVE" | "ARCHIVED";

/** `auth.mapper.ts#SessionUserDto` — what `GET /auth/me` returns. */
export interface SessionUserDto {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  backendRole: BackendRole;
  role: BackendFrontendRole;
  accountStatus: AccountStatus;
  /**
   * The Backend's own landing route. It mirrors the **Vite** app's path table
   * (`/discover`, `/technician/tasks`), NOT this Next.js app's `SCREEN_PATHS`.
   * It is recorded here for completeness and deliberately never used for
   * navigation — `lib/auth/routeRoles.ts` maps `role` onto this app's frozen
   * routes instead.
   */
  landingRoute: string;
}

/** `auth.mapper.ts#SessionResponseDto` — login / register / refresh / invitation-accept. */
export interface SessionResponseDto extends SessionUserDto {
  accessToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
}

interface CallOptions {
  signal?: AbortSignal;
}

/**
 * Every call sets `skipAuthRefresh`. A 401 from any of these endpoints is an
 * expected, directly-handled outcome — bad credentials, no cookie to restore
 * from, an already-revoked session — not a "your live session just died" event.
 * Without it, a guest's silent restore attempt on every page load would trigger
 * the global session-expired handler and burn the Backend's shared auth rate
 * limit (20 requests / 15 minutes / IP, which counts refresh calls).
 */
const AUTH_CALL = { skipAuthRefresh: true } as const;

export const backendAuth = {
  /** `POST /api/auth/login` — email + password only; there is no phone-login route. */
  login: (body: LoginRequest, options?: CallOptions) =>
    apiClient.post<SessionResponseDto>("/auth/login", body, { ...options, ...AUTH_CALL }),

  /** `POST /api/auth/register` — always creates a `HOME_SEEKER`; the server assigns the role. */
  register: (body: RegisterRequest, options?: CallOptions) =>
    apiClient.post<SessionResponseDto>("/auth/register", body, { ...options, ...AUTH_CALL }),

  /**
   * `POST /api/auth/refresh` — silent session restoration. Sends no body: the
   * opaque refresh token travels only in the httpOnly cookie. Single-use and
   * rotating; presenting an already-rotated token revokes every session for the
   * account (replay detection, `auth.service.ts#refresh`), which is exactly why
   * the client must issue at most one refresh at a time.
   */
  refresh: (options?: CallOptions) =>
    apiClient.post<SessionResponseDto>("/auth/refresh", undefined, { ...options, ...AUTH_CALL }),

  /**
   * `POST /api/auth/logout` — revokes the presented refresh token server-side.
   * Authenticated by the cookie it revokes (`optionalAuthMiddleware`), so it
   * still succeeds when the 15-minute access token has already expired. That
   * fix is load-bearing: before it, an expired-token logout 401'd, the refresh
   * token stayed live, and the next page load silently restored the session the
   * user believed they had ended (decisions.md K2).
   */
  logout: (options?: CallOptions) =>
    apiClient.post<{ loggedOut: true }>("/auth/logout", undefined, { ...options, ...AUTH_CALL }),

  /** `GET /api/auth/me` — re-derives account state fresh; omits `accessToken`. */
  me: (options?: CallOptions) =>
    apiClient.get<SessionUserDto>("/auth/me", { ...options, ...AUTH_CALL }),

  /**
   * `POST /api/auth/forgot-password` — step one of the two-step reset. Always a
   * generic success; it never reveals whether the email exists.
   */
  requestPasswordReset: (body: ForgotPasswordRequest, options?: CallOptions) =>
    apiClient.post<{ message: string }>("/auth/forgot-password", body, { ...options, ...AUTH_CALL }),

  /** `POST /api/auth/reset-password` — step two. Revokes every refresh token for the account. */
  resetPassword: (body: ResetPasswordRequest, options?: CallOptions) =>
    apiClient.post<{ message: string }>("/auth/reset-password", body, { ...options, ...AUTH_CALL }),

  /**
   * `POST /api/auth/invitations/accept` — purpose-bound invitation redemption
   * (currently technician activation only). Typed and callable, but **no screen
   * in this frontend renders an invitation form yet**: `AuthScreen`'s screen
   * inventory has no invitation step and there is no `/auth/invitation` route in
   * `SCREEN_PATHS`. Wiring a UI for it is Task 3 work, not a Task 1 licence to
   * add a screen to a frozen design.
   */
  acceptInvitation: (body: AcceptInvitationRequest, options?: CallOptions) =>
    apiClient.post<SessionResponseDto>("/auth/invitations/accept", body, { ...options, ...AUTH_CALL }),
};
