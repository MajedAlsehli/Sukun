"use client";

/**
 * The 4-item persistent homeowner nav bar (02_Navigation_Map.md §2:
 * "Persistent homeowner nav bar (4 items, present on H7-H10)": منزلي/بلاغاتي/
 * الضمان/ابحث عن منزل → H7/H9/H10/H3). No single `.dc.html` export renders
 * this bar — each screen export is a standalone single-screen demo — so
 * there is no literal markup to port; this is new integration chrome built
 * from the existing design tokens (`globals.css`), not a redesign of
 * anything that shipped before.
 *
 * Renders two variants of the same 4 items, toggled purely via Tailwind's
 * `md:` breakpoint (no separate desktop component to keep in sync): a fixed
 * bottom tab bar below `md` (native-app-style mobile nav), and a sticky top
 * pill bar at `md` and above — a bottom bar reads as a mobile pattern, not a
 * desktop one, so desktop gets its own top-of-content nav instead.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { SCREEN_PATHS } from "@/lib/nav/routes";

const ITEMS = [
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
] as const;

export function HomeownerNav({ showDesktop = true }: { showDesktop?: boolean } = {}) {
  const pathname = usePathname();

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
          padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="التنقل الرئيسي"
      >
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "6px 14px",
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
              <span style={{ fontSize: "11px", fontWeight: 600 }}>{item.label}</span>
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
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
