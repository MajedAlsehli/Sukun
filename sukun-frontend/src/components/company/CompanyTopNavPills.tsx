"use client";

/**
 * The pill-shaped top nav embedded literally inside every RE `.dc.html`
 * file's own top bar — same markup/styling in each file, but the label
 * text/icon/href set differs per screen (e.g. RE1's own copy says "الملاك"/
 * "الفنيون" for the same two destinations RE2's copy calls "السكان"/
 * "المقاولون" — a real inconsistency in the production source itself, not
 * normalized here per the "no redesign" instruction). Each screen passes
 * its own literal `items`; only the shared visual shell lives here.
 */
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { AccountMenu } from "@/components/auth/AccountMenu";

export interface NavPillItem {
  key: string;
  label: string;
  icon: ReactNode;
  href?: string;
  current?: boolean;
}

export function CompanyTopNavPills({ items }: { items: NavPillItem[] }) {
  // The pill bar IS the company header on every RE screen, so it hosts the
  // mobile account menu. Rendered outside the scrolling pill row so it stays
  // reachable, and mobile-only so the desktop bar is unchanged.
  const barRef = useRef<HTMLDivElement>(null);
  const currentKey = items.find((i) => i.current)?.key;

  /**
   * The bar is wider than a phone, so it scrolls (deliberately — hiding a
   * destination to make it fit would be worse). But it opened scrolled to the
   * start, which on these screens left the CURRENT pill half-cut at the edge:
   * the one item that tells you where you are was the one you could not read.
   * Bringing it into view costs nothing at desktop, where the bar already fits
   * and there is nothing to scroll.
   */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
    const active = bar.querySelector<HTMLElement>("[data-sk-nav-current]");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentKey]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 20px" }}>
    <div
      ref={barRef}
      data-sk-scroll-row
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px",
        background: "var(--n-surface)",
        border: "1px solid var(--n-border)",
        borderRadius: "var(--r-full)",
        boxShadow: "var(--sh-1)",
        width: "fit-content",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {/* The company screens carry no other chrome, so the logo rides at the
          head of this bar — one edit, all four RE screens, no layout change. */}
      <span style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 6px 0 2px", flex: "none" }}>
        <SukunLogo size={38} />
        <span style={{ width: 1, height: 24, background: "var(--n-border)" }} />
      </span>
      {items.map((item) => {
        const pillStyle = {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: 600,
          padding: "9px 17px",
          borderRadius: "var(--r-full)",
          whiteSpace: "nowrap" as const,
          textDecoration: "none",
          border: "none",
          cursor: item.current ? "default" : "pointer",
          background: item.current ? "var(--g-900)" : "transparent",
          color: item.current ? "var(--t-on-dark)" : "var(--t-secondary)",
        };
        if (item.current || !item.href) {
          return (
            <button
              key={item.key}
              data-sk-nav-current={item.current ? "" : undefined}
              style={pillStyle}
              disabled={item.current}
            >
              {item.icon}
              {item.label}
            </button>
          );
        }
        return (
          <Link key={item.key} href={item.href} style={pillStyle}>
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </div>
      <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}>
        <AccountMenu variant="compact" />
      </span>
    </div>
  );
}
