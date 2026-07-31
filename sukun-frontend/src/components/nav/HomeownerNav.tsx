"use client";

/**
 * The persistent homeowner nav bar (02_Navigation_Map.md §2:
 * "Persistent homeowner nav bar (4 items, present on H7-H10)": منزلي/بلاغاتي/
 * الضمان/ابحث عن منزل → H7/H9/H10/H3). No single `.dc.html` export renders
 * this bar — each screen export is a standalone single-screen demo — so
 * there is no literal markup to port; this is new integration chrome built
 * from the existing design tokens (`globals.css`), not a redesign of
 * anything that shipped before.
 *
 * Renders two variants of the same items, toggled purely via Tailwind's
 * `md:` breakpoint (no separate desktop component to keep in sync): a fixed
 * bottom tab bar below `md` (native-app-style mobile nav), and a sticky top
 * pill bar at `md` and above — a bottom bar reads as a mobile pattern, not a
 * desktop one, so desktop gets its own top-of-content nav instead.
 *
 * ── ROLE-SPECIFIC ITEMS (user instruction, 2026-07-31) ──────────────────────
 *
 * The four items above are an OWNER's map. Three of them — منزلي (`/home`),
 * بلاغاتي (`/reports`) and الضمان (`/warranty`) — are `HOMEOWNER_ACTIVE_ONLY`
 * in the Route Table, so for a Home Seeker (`homeowner_prospect`) they are not
 * merely irrelevant: `RouteGuard` bounces the tap straight back to
 * `/discovery` with nothing shown. Three of a seeker's four tabs were dead
 * ends that silently returned them to where they started.
 *
 * A seeker now gets the five destinations that actually exist for them, all
 * inside `/discovery`: the dashboard, search, favourites, the AI advisor and
 * their own account. Everyone else keeps the owner bar exactly as it was —
 * which is what `/home`, `/reports` and `/warranty` still render, unchanged.
 *
 * NO ROUTE IS ADDED OR CHANGED. A seeker's tabs are `/discovery` plus a hash;
 * `DiscoveryScreen` already models these as in-screen state, and reading a
 * `#fragment` on mount is the same deep-link convention RE4/RE5 use for a
 * homeowner id and this screen's own `#sec-book` uses for the booking form.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { useAuth } from "@/lib/auth/AuthContext";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

/** H7-H10 — an owner's map. Unchanged. Exported for `HomeownerNav.test.ts`. */
export const OWNER_ITEMS: NavItem[] = [
  {
    label: "منزلي",
    href: SCREEN_PATHS.H7_MyHome,
    icon: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  },
  {
    label: "بلاغاتي",
    href: SCREEN_PATHS.H9_MyReports,
    icon: "M9 3h6l1 3h3v2H5V6h3l1-3zM6 8h12l-1 12H7L6 8z",
  },
  {
    label: "الضمان",
    href: SCREEN_PATHS.H10_WarrantyCenter,
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  },
  {
    label: "ابحث عن منزل",
    href: SCREEN_PATHS.H3_Discovery,
    icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35",
  },
];

/**
 * A Home Seeker's map. Every destination is a screen `DiscoveryScreen`
 * already renders — nothing here is a new feature, and none of it is an
 * owner feature. The labels are short because five tabs share 390px.
 */
export const SEEKER_ITEMS: NavItem[] = [
  {
    label: "الرئيسية",
    href: `${SCREEN_PATHS.H3_Discovery}#dashboard`,
    icon: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  },
  {
    label: "استكشف",
    href: `${SCREEN_PATHS.H3_Discovery}#search`,
    icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35",
  },
  {
    label: "المفضّلة",
    href: `${SCREEN_PATHS.H3_Discovery}#fav`,
    icon: "M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9z",
  },
  {
    label: "المستشار",
    href: `${SCREEN_PATHS.H3_Discovery}#recs`,
    icon: "M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9z",
  },
  {
    label: "حسابي",
    href: `${SCREEN_PATHS.H3_Discovery}#profile`,
    icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
];

/**
 * `usePathname` is identical for all five seeker tabs — they differ only by
 * fragment, which Next does not expose and which changes without a
 * navigation. This tracks it so the right tab is highlighted.
 */
function useHash(): string {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return hash;
}

export function HomeownerNav({ showDesktop = true }: { showDesktop?: boolean } = {}) {
  const pathname = usePathname();
  const hash = useHash();
  const { sessionRole } = useAuth();

  const isSeeker = sessionRole === "homeowner_prospect";
  const items = isSeeker ? SEEKER_ITEMS : OWNER_ITEMS;

  /**
   * A seeker's tabs all share `/discovery`, so the fragment decides. An empty
   * fragment is the dashboard, which is the screen's own initial state. On
   * `/discovery/[projectId]` no tab is current — the project page is not one
   * of them, and lighting one up would misreport where you are.
   */
  function isCurrent(href: string): boolean {
    const [path, frag] = href.split("#");
    if (pathname !== path) return false;
    if (!frag) return true;
    return (hash || "#dashboard") === `#${frag}`;
  }

  /**
   * `Link` to a same-page fragment goes through the Next router, which updates
   * the URL with `history.pushState` — and `pushState` does not fire
   * `hashchange`. The tab therefore changed the address bar and nothing else:
   * neither this bar's highlight nor `DiscoveryScreen`'s own listener ever
   * heard about it.
   *
   * Assigning `location.hash` is what fires the event natively, so a
   * same-route tab does that instead. A tab pressed from ANOTHER route (the
   * project page) still goes through `Link`: that is a real navigation, and
   * `DiscoveryScreen` reads the fragment when it mounts.
   */
  const onTabClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      const [path, frag] = href.split("#");
      if (!frag || pathname !== path) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (window.location.hash === `#${frag}`) return;
      window.location.hash = frag;
    },
    [pathname],
  );

  return (
    <>
      {/* Mobile: fixed bottom tab bar, hidden at md and above */}
      <nav
        className="flex md:hidden"
        style={{
          position: "fixed",
          insetInlineStart: 0,
          insetInlineEnd: 0,
          bottom: 0,
          zIndex: 120,
          justifyContent: "space-around",
          background: "var(--n-surface)",
          borderTop: "1px solid var(--n-border)",
          boxShadow: "var(--sh-2)",
          padding: "8px 6px calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="التنقل الرئيسي"
      >
        {items.map((item) => {
          const active = isCurrent(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => onTabClick(e, item.href)}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                // Five tabs share 390px, so the inline padding gives way
                // before the tap target does — the row itself stays 44px+.
                padding: isSeeker ? "6px 6px" : "6px 14px",
                minWidth: 0,
                borderRadius: "var(--r-md)",
                textDecoration: "none",
                color: active ? "var(--g-900)" : "var(--t-tertiary)",
                background: active ? "rgba(var(--a-500-rgb), .14)" : "transparent",
                transition: "color .2s var(--ease), background .2s var(--ease)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sticky top pill bar, hidden below md. Skipped on screens
          that already ship their own desktop header/nav (Discovery, Project
          Details) — a second bar there would duplicate, not fix, nav. */}
      {showDesktop && (
      <nav
        className="hidden md:flex"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 120,
          alignItems: "center",
          gap: 6,
          padding: "12px 26px",
          background: "rgba(246,239,232,.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--n-border)",
        }}
        aria-label="التنقل الرئيسي"
      >
        <Link href={SCREEN_PATHS.H7_MyHome} aria-label="سُكن" style={{ marginInlineEnd: 22, display: "flex", padding: "0 4px" }}>
          <SukunLogo size={42} />
        </Link>
        {items.map((item) => {
          const active = isCurrent(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => onTabClick(e, item.href)}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 16px",
                borderRadius: "var(--r-full)",
                textDecoration: "none",
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--t-on-dark)" : "var(--t-secondary)",
                background: active ? "var(--g-900)" : "transparent",
                transition: "color .2s var(--ease), background .2s var(--ease)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
      )}
    </>
  );
}
