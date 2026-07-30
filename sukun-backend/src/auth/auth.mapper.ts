import { SafeUser, UserEntity } from './auth.types';
import { ResolvedAccountState } from './accountState';

// Never leak passwordHash / internal lockout counters to API responses.
export function toSafeUser(user: UserEntity): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export interface SessionUserDto {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  backendRole: UserEntity['role'];
  role: ResolvedAccountState['frontendRole'];
  accountStatus: UserEntity['status'];
  landingRoute: string;
}

export interface SessionResponseDto extends SessionUserDto {
  accessToken: string;
}

// Single shape for every session-producing response (login/register/refresh)
// and GET /auth/me (which omits accessToken) - see accountState.ts for why
// `role` here is the derived frontend role, not the raw backend UserRole.
export function toSessionUserDto(user: UserEntity, accountState: ResolvedAccountState): SessionUserDto {
  return {
    userId: user.id,
    displayName: user.name,
    email: user.email,
    phone: user.phone,
    backendRole: user.role,
    role: accountState.frontendRole,
    accountStatus: user.status,
    landingRoute: accountState.landingRoute,
  };
}

export function toSessionResponseDto(
  user: UserEntity,
  accountState: ResolvedAccountState,
  accessToken: string,
): SessionResponseDto {
  return { ...toSessionUserDto(user, accountState), accessToken };
}
