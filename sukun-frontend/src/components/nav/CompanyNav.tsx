"use client";

/**
 * The company top nav (02_Navigation_Map.md §5: RE1's "top nav: المشاريع /
 * الملاك / الفنيون", plus RE2/RE5's own button tables listing the same nav
 * pills back to RE1/RE2/RE4/RE5). Same situation as HomeownerNav — no
 * `.dc.html` export renders cross-screen chrome, so this is new integration
 * chrome built from the existing design tokens, not a ported element.
 * RE3 is deliberately not one of the destinations: its own back control is
 * the breadcrumb (D19), and it isn't one of this bar's own targets either.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { SCREEN_PATHS } from "@/lib/nav/routes";

const ITEMS = [
  { label: "لوحة التحكم", href: SCREEN_PATHS.RE1_CompanyDashboard },
  { label: "المشاريع", href: SCREEN_PATHS.RE2_ProjectsManagement },
  { label: "السكان", href: SCREEN_PATHS.RE4_HomeownersManagement },
  { label: "المقاولون", href: SCREEN_PATHS.RE5_TechniciansManagement },
] as const;

export function CompanyNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 110,
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "var(--n-surface)",
        borderBottom: "1px solid var(--n-border)",
        padding: "10px 20px",
      }}
      aria-label="التنقل الرئيسي"
    >
      <Link
        href={SCREEN_PATHS.RE1_CompanyDashboard}
        aria-label="سُكن"
        style={{ display: "flex", padding: "0 4px", marginInlineEnd: 18 }}
      >
        <SukunLogo size={42} />
      </Link>
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--r-full)",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: 600,
              color: active ? "var(--t-on-dark)" : "var(--t-secondary)",
              background: active ? "var(--g-900)" : "transparent",
              transition: "color .2s var(--ease), background .2s var(--ease)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
