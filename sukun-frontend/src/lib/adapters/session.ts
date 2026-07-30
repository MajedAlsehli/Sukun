/**
 * The DTO -> view-model boundary for authentication/session.
 *
 *   Backend DTO (SessionResponseDto)
 *     -> validated/typed domain response (assertSessionDto)
 *     -> frontend view model (SessionViewModel)
 *     -> unchanged visual component
 *
 * No visual component ever sees a `SessionUserDto`. `AuthContext` exposes the
 * view model, and the view model deliberately keeps the `PublicUser` shape the
 * frozen screens already read (`DiscoveryScreen` renders `user.name`), so the
 * adapter absorbs the field renames (`displayName` -> `name`,
 * `userId` -> `id`, `accountStatus` -> `status`) rather than the UI.
 */

import type {
  AccountStatus,
  BackendFrontendRole,
  BackendRole,
  SessionResponseDto,
  SessionUserDto,
} from "@/lib/backend/auth";
import type { AppRole } from "@/lib/auth/roles";
import type { PublicUser } from "@/lib/api";

/** The six values `accountState.ts` can return — identical to this app's `AppRole`. */
const APP_ROLES: readonly BackendFrontendRole[] = [
  "homeowner_prospect",
  "homeowner_pending",
  "homeowner_active",
  "technician",
  "pm",
  "company",
];

const BACKEND_ROLES: readonly BackendRole[] = [
  "HOME_SEEKER",
  "HOMEOWNER",
  "TECHNICIAN",
  "PROJECT_MANAGER",
  "COMPANY",
];

export class SessionDtoError extends Error {
  constructor(field: string) {
    super(`Session response is missing or has an invalid \`${field}\``);
    this.name = "SessionDtoError";
  }
}

/**
 * Validates the fields this app actually depends on. Deliberately narrow: it
 * proves the response is a session (and that `role` is one of the six the route
 * table understands) without rejecting a future additive backend field.
 */
export function assertSessionDto(value: unknown): asserts value is SessionUserDto {
  const dto = value as Partial<SessionUserDto> | null;
  if (!dto || typeof dto !== "object") throw new SessionDtoError("body");
  if (typeof dto.userId !== "string" || !dto.userId) throw new SessionDtoError("userId");
  if (typeof dto.displayName !== "string") throw new SessionDtoError("displayName");
  if (!APP_ROLES.includes(dto.role as BackendFrontendRole)) throw new SessionDtoError("role");
  if (!BACKEND_ROLES.includes(dto.backendRole as BackendRole)) throw new SessionDtoError("backendRole");
}

/**
 * `PublicUser.status` is the frozen screens' `"active" | "inactive"`; the
 * Backend's `UserStatus` is `ACTIVE`/`ARCHIVED` (decisions.md F8 — `ARCHIVED`
 * is deactivation, not deletion). Mapped here, once.
 */
function toPublicStatus(status: AccountStatus | undefined): PublicUser["status"] {
  return status === "ACTIVE" ? "active" : "inactive";
}

export interface SessionViewModel {
  /** The `PublicUser` shape every frozen screen already reads. */
  user: PublicUser;
  /** The server-derived role. Never re-derived on the client (decisions.md A1/D2). */
  role: AppRole;
  /** Kept verbatim for diagnostics; navigation uses `lib/auth/routeRoles.ts` instead. */
  backendLandingRoute: string;
  accountStatus: AccountStatus;
}

export function toSessionViewModel(dto: SessionUserDto): SessionViewModel {
  return {
    user: {
      id: dto.userId,
      name: dto.displayName,
      email: dto.email ?? "",
      phone: dto.phone ?? "",
      role: dto.backendRole,
      status: toPublicStatus(dto.accountStatus),
    },
    role: dto.role as AppRole,
    backendLandingRoute: dto.landingRoute ?? "",
    accountStatus: dto.accountStatus,
  };
}

/** Convenience for the session-producing endpoints, which also carry the access token. */
export function toSessionWithToken(dto: SessionResponseDto): {
  session: SessionViewModel;
  accessToken: string;
} {
  assertSessionDto(dto);
  if (typeof dto.accessToken !== "string" || !dto.accessToken) {
    throw new SessionDtoError("accessToken");
  }
  return { session: toSessionViewModel(dto), accessToken: dto.accessToken };
}
