"use client";

/**
 * The session/role layer every route guard and persistent nav shell reads from.
 *
 * **Two independent modes, one unchanged public surface.** Every field and
 * method below existed before this file was rewritten, with the same name and
 * the same meaning to its consumers (`RouteGuard`, `DemoRoleSwitcher`,
 * `AuthScreen`, `DiscoveryScreen`) — so no visual component changed. What
 * changed is where the session comes from:
 *
 * - `NEXT_PUBLIC_DEMO_MODE=true` (Showcase): unchanged. A synthetic session
 *   from `lib/demo/fixtures.ts` is stored in localStorage by
 *   `api.ts#storeDemoSession` and hydrated here exactly as before. The
 *   `ownerIntent` mocked bridge and the localStorage-backed
 *   `homeownerActivated` flag stay live, because that is what makes the Demo
 *   Role Switcher's six synthetic journeys work with no backend at all.
 *
 * - `NEXT_PUBLIC_DEMO_MODE=false` (Integrated production): the real
 *   architecture. The access token lives in memory only
 *   (`lib/backend/session.ts`), the opaque rotating refresh token lives in an
 *   httpOnly cookie this code cannot read, and startup performs a silent
 *   `POST /auth/refresh` to restore the session. The role comes from the
 *   Backend's own derived `role` field and is never re-derived here.
 *   localStorage is not read for, and never written with, session state.
 *
 * `isHydrated` keeps its exact previous contract: `false` until the session
 * question has been answered once on the client, so `RouteGuard` renders
 * nothing (its existing, approved "not decided yet" presentation) rather than
 * flashing a guest or an authenticated screen. In real mode that window now
 * also covers the silent restore round-trip — same visual language, no new
 * loading component.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearDemoSessionFlag,
  clearTokens,
  clearUser,
  getStoredAccessToken,
  getStoredHomeownerActivated,
  getStoredOwnerIntent,
  getStoredUser,
  isDemoSessionStored,
  logout as demoLogout,
  storeDemoSession,
  storeHomeownerActivated,
  storeOwnerIntent,
  storeUser as persistUser,
  type PublicUser,
} from "@/lib/api";
import { backendRoleForAppRole, resolveAppRole, type AppRole, type SessionRole } from "@/lib/auth/roles";
import { demoUserFor } from "@/lib/demo/fixtures";
import { DEMO_MODE } from "@/lib/demo/config";
import { apiClient } from "@/lib/backend/client";
import { backendAuth, type SessionResponseDto } from "@/lib/backend/auth";
import { clearAccessToken, setAccessToken } from "@/lib/backend/session";
import { toSessionWithToken, type SessionViewModel } from "@/lib/adapters/session";

interface AuthState {
  /** `false` until the session question has been answered once on the client. */
  isHydrated: boolean;
  user: PublicUser | null;
  sessionRole: SessionRole;
  /**
   * Real mode: derived from the Backend's `role` (`homeowner_active`), never
   * from a stored flag. Demo Mode: the localStorage flag, as before.
   */
  homeownerActivated: boolean;
  /**
   * The Task-1-era mocked bridge that let a `HOME_SEEKER` present as
   * `homeowner_pending`. **Demo Mode only** — in real mode the Backend resolves
   * `homeowner_pending` itself from the latest `HomeownerActivation` row, so
   * this is always `false` and nothing reads it as an account fact.
   */
  ownerIntent: boolean;
  /** `true` when the current session came from `enterDemoRole`, not a real login. */
  isDemoSession: boolean;
  /** Demo/legacy: adopt a `PublicUser` as the current session. */
  setSession: (user: PublicUser) => void;
  /** Real mode: adopt a Backend session response (login / register / invitation accept). */
  setBackendSession: (response: SessionResponseDto) => void;
  markHomeownerActivated: () => void;
  markOwnerIntent: () => void;
  /** Demo Mode only (`lib/demo/config.ts#DEMO_MODE`) — see `components/demo/DemoRoleSwitcher.tsx`. */
  enterDemoRole: (role: AppRole) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [homeownerActivated, setHomeownerActivated] = useState(false);
  const [ownerIntent, setOwnerIntent] = useState(false);
  const [isDemoSession, setIsDemoSession] = useState(false);
  /** Real mode only: the server-derived role. `null` == no session. */
  const [backendRole, setBackendRole] = useState<AppRole | null>(null);

  /**
   * Guards the mount-time restore against React StrictMode's dev-only
   * mount/cleanup/mount double-invoke. A `let cancelled` cleanup flag is
   * deliberately NOT used here: the working Vite app shipped exactly that and it
   * dropped the only real response, leaving the app stuck in its restoring state
   * forever (decisions.md D6). The ref persists across both invocations, the
   * request fires once, and its result is always applied.
   */
  const restoreAttempted = useRef(false);

  /** Wipes every trace of a session from React state and from the in-memory token store. */
  const clearLocalSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setBackendRole(null);
    setHomeownerActivated(false);
    setOwnerIntent(false);
    setIsDemoSession(false);
  }, []);

  const adoptSession = useCallback((view: SessionViewModel) => {
    setUser(view.user);
    setBackendRole(view.role);
    setHomeownerActivated(view.role === "homeowner_active");
    setOwnerIntent(false);
    setIsDemoSession(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    if (DEMO_MODE) {
      // Unchanged Demo Mode hydration — synthetic session out of localStorage.
      const storedUser = getStoredUser();
      const hasToken = getStoredAccessToken() !== null;
      const activeUser = hasToken ? storedUser : null;
      setUser(activeUser);
      setIsDemoSession(hasToken && isDemoSessionStored());
      setHomeownerActivated(getStoredHomeownerActivated(activeUser?.id ?? null));
      setOwnerIntent(getStoredOwnerIntent(activeUser?.id ?? null));
      setIsHydrated(true);
      return;
    }

    // Real mode: silent session restoration. A failure here (no cookie, an
    // expired/revoked refresh token, an offline device) is the expected outcome
    // for a guest and must not surface as an error — it simply means no session.
    backendAuth
      .refresh()
      .then((response) => {
        const { session, accessToken } = toSessionWithToken(response);
        setAccessToken(accessToken);
        adoptSession(session);
      })
      .catch(() => {
        clearLocalSession();
      })
      .finally(() => {
        setIsHydrated(true);
      });
  }, [adoptSession, clearLocalSession]);

  // ---------------------------------------------------------------------------
  // API-client session wiring (real mode only)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (DEMO_MODE) return;

    apiClient.setSessionHooks({
      /**
       * The single shared refresh the client funnels concurrent 401s into. It
       * also refreshes the resolved role, so an activation completed elsewhere
       * takes effect without a reload.
       */
      refresh: async () => {
        try {
          const response = await backendAuth.refresh();
          const { session, accessToken } = toSessionWithToken(response);
          setAccessToken(accessToken);
          adoptSession(session);
          return true;
        } catch {
          return false;
        }
      },
      onSessionExpired: () => {
        clearLocalSession();
      },
    });

    return () => apiClient.setSessionHooks(null);
  }, [adoptSession, clearLocalSession]);

  // ---------------------------------------------------------------------------
  // Session mutators
  // ---------------------------------------------------------------------------

  /** Real mode: adopt a login/register/invitation response. */
  const setBackendSession = useCallback(
    (response: SessionResponseDto) => {
      const { session, accessToken } = toSessionWithToken(response);
      setAccessToken(accessToken);
      adoptSession(session);
    },
    [adoptSession],
  );

  /**
   * Demo/legacy path, kept for the synthetic journeys and for any caller that
   * still hands over a bare `PublicUser`. In real mode it never writes a token
   * anywhere — `setBackendSession` is the real entry point.
   */
  const setSession = useCallback((nextUser: PublicUser) => {
    if (DEMO_MODE) {
      persistUser(nextUser);
      setUser(nextUser);
      setHomeownerActivated(getStoredHomeownerActivated(nextUser.id));
      setOwnerIntent(getStoredOwnerIntent(nextUser.id));
      setIsDemoSession(false);
      return;
    }
    setUser(nextUser);
    setIsDemoSession(false);
  }, []);

  const markHomeownerActivated = useCallback(() => {
    if (!DEMO_MODE) {
      // Real mode: activation is a server fact. `POST /api/homeowners/activate`
      // promotes the account and the next session response carries
      // `role: 'homeowner_active'`. Flipping a client flag here would let the UI
      // claim an activation the Backend has not recorded.
      return;
    }
    const id = getStoredUser()?.id ?? null;
    storeHomeownerActivated(id);
    setHomeownerActivated(true);
  }, []);

  const markOwnerIntent = useCallback(() => {
    // Real mode: `homeowner_pending` is resolved server-side from the latest
    // `HomeownerActivation` row (decisions.md A1/D2). The mocked bridge would
    // contradict it, so it stays a Demo Mode affordance only.
    if (!DEMO_MODE) return;
    const id = getStoredUser()?.id ?? null;
    storeOwnerIntent(id);
    setOwnerIntent(true);
  }, []);

  const enterDemoRole = useCallback((role: AppRole) => {
    if (!DEMO_MODE) return;
    const { backendRole: demoBackendRole, homeownerActivated: activated } = backendRoleForAppRole(role);
    const demoUser = demoUserFor(demoBackendRole);
    storeDemoSession(demoUser);
    storeHomeownerActivated(activated ? demoUser.id : null);
    storeOwnerIntent(null);
    setUser(demoUser);
    setHomeownerActivated(activated);
    setOwnerIntent(false);
    setIsDemoSession(true);
  }, []);

  /**
   * Real mode: the server revoke is issued BEFORE local state is cleared and is
   * awaited, so the request provably carries the credential that authorizes it.
   * It never throws — a failed revoke (offline, already-expired token) must
   * still end the local session. The Backend's logout is authenticated by the
   * refresh COOKIE, so an expired access token still genuinely revokes
   * (decisions.md K2).
   */
  const signOut = useCallback(async () => {
    if (DEMO_MODE) {
      try {
        await demoLogout();
      } finally {
        clearTokens();
        clearUser();
        clearDemoSessionFlag();
        clearLocalSession();
      }
      return;
    }

    try {
      await backendAuth.logout();
    } catch {
      // Best-effort — the local session ends regardless.
    } finally {
      clearLocalSession();
    }
  }, [clearLocalSession]);

  /**
   * Real mode: the Backend's derived role IS the session role — one resolver,
   * server-side, for all six states (decisions.md A1/D2).
   *
   * Demo Mode: unchanged. `HOME_SEEKER` + `ownerIntent` presents as the
   * homeowner-activation lifecycle, exactly as before.
   */
  const sessionRole: SessionRole = useMemo(() => {
    if (!DEMO_MODE) return backendRole ?? "guest";
    if (!user) return "guest";
    if (user.role === "HOME_SEEKER" && ownerIntent) {
      return homeownerActivated ? "homeowner_active" : "homeowner_pending";
    }
    return resolveAppRole(user.role, homeownerActivated);
  }, [backendRole, user, homeownerActivated, ownerIntent]);

  const value: AuthState = {
    isHydrated,
    user,
    sessionRole,
    homeownerActivated,
    ownerIntent,
    isDemoSession,
    setSession,
    setBackendSession,
    markHomeownerActivated,
    markOwnerIntent,
    enterDemoRole,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * The session-readiness gate every authenticated resource load waits on.
 *
 * `ready` is `false` for exactly as long as the question "is there a session?"
 * is still open — in real mode that is the silent `POST /auth/refresh` this
 * provider fires at startup. A domain request issued inside that window goes
 * out with no `Authorization` header, is answered 401, and cannot be recovered:
 * `apiClient`'s refresh hook may not even be registered yet. It then settles as
 * a permanent error that never retries, which is how a hard refresh could show
 * a failure (or, worse, a screen's empty state) on a route that works perfectly
 * when reached by in-app navigation.
 *
 * `key` changes whenever the session identity changes, so a resource keyed by
 * it re-runs when the session ARRIVES and again if the user switches accounts —
 * no cached response from a previous session survives.
 *
 * Deliberately non-throwing, unlike `useAuth`: with no provider in the tree
 * (unit tests, isolated hook rendering) there is no restore to wait for, so the
 * honest answer is "ready".
 */
export function useSessionGate(): { ready: boolean; key: string } {
  const ctx = useContext(AuthContext);
  if (!ctx) return { ready: true, key: "no-provider" };
  return { ready: ctx.isHydrated, key: `${ctx.user?.id ?? "guest"}:${ctx.sessionRole}` };
}
