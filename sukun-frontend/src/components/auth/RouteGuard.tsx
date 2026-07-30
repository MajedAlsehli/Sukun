"use client";

/**
 * Client-side enforcement of the Route Table (18_Frontend_Navigation_Integration.md
 * § Route Table). Tokens live in localStorage, not a cookie, so Next.js
 * middleware can't see the session — this is the enforcement point instead.
 * This does not replace server-side auth: every backend route already
 * guards itself independently (`requireAuth` + per-route role checks); this
 * only stops an out-of-role screen from ever rendering client-side.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_ROUTE_FOR_ROLE } from "@/lib/auth/routeRoles";
import type { AppRole, ScreenRoles } from "@/lib/auth/roles";

export function RouteGuard({
  allow,
  children,
}: {
  /** The screen's Route Table row — allowed AppRoles. */
  allow: ScreenRoles;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isHydrated, sessionRole } = useAuth();

  const isAllowed = sessionRole !== "guest" && (allow as readonly string[]).includes(sessionRole);

  useEffect(() => {
    if (!isHydrated) return;
    if (sessionRole === "guest") {
      router.replace("/login");
      return;
    }
    if (!isAllowed) {
      /**
       * Out-of-role for this screen. A signed-in user goes to THEIR OWN
       * landing route, not to `/`.
       *
       * The old comment said role landing routes had no real screen behind
       * them yet. Every one of them does now — `/company`, `/pm`,
       * `/contractor`, `/home`, `/discovery`, `/activate` are all live — so
       * dropping a signed-in company user on the public marketing page, with
       * no indication of what happened, is a dead end they have to navigate
       * out of by hand. `/` stays the fallback only if the role has no route.
       */
      const landing = DEFAULT_ROUTE_FOR_ROLE[sessionRole as AppRole];
      router.replace(landing ?? "/");
    }
  }, [isHydrated, sessionRole, isAllowed, router]);

  if (!isHydrated || !isAllowed) return null;

  return <>{children}</>;
}
