"use client";

/**
 * The data-hook layer's first (and, in Task 1, only) member.
 *
 * `lib/hooks/` is where a screen's loading / empty / error state, its
 * `AbortSignal` wiring and its cache invalidation will live once Tasks 2 and 3
 * wire real domain data. Nothing here fetches anything yet — `useSession` is a
 * thin, typed read of the auth layer, so later hooks have an established place
 * to sit and a session shape to key their caches by.
 */

import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_ROUTE_FOR_ROLE } from "@/lib/auth/routeRoles";
import type { AppRole, SessionRole } from "@/lib/auth/roles";
import type { PublicUser } from "@/lib/api";

export interface SessionSnapshot {
  /** `false` while the silent restore (real mode) or localStorage read (Demo Mode) is still settling. */
  isReady: boolean;
  isAuthenticated: boolean;
  role: SessionRole;
  user: PublicUser | null;
  /** `true` when this session came from the Demo Role Switcher rather than a real login. */
  isDemoSession: boolean;
  /** This role's landing route in the frozen route table, or `null` for a guest. */
  defaultRoute: string | null;
  /**
   * A stable key for per-session caches. Changing it is the signal to drop every
   * cached domain response — the "no data from the previous session anywhere"
   * rule the Backend's own verification checklist §7.5 tests for.
   */
  cacheKey: string;
}

export function useSession(): SessionSnapshot {
  const { isHydrated, user, sessionRole, isDemoSession } = useAuth();
  const isAuthenticated = sessionRole !== "guest";
  return {
    isReady: isHydrated,
    isAuthenticated,
    role: sessionRole,
    user,
    isDemoSession,
    defaultRoute: isAuthenticated ? DEFAULT_ROUTE_FOR_ROLE[sessionRole as AppRole] : null,
    cacheKey: `${user?.id ?? "guest"}:${sessionRole}`,
  };
}
