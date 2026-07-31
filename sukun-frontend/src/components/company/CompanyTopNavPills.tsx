"use client";

/**
 * The pill-shaped top nav embedded literally inside every RE `.dc.html`
 * file's own top bar — same markup/styling in each file, but the label
 * text/icon/href set differs per screen (e.g. RE1's own copy says "الملاك"/
 * "الفنيون" for the same two destinations RE2's copy calls "السكان"/
 * "المقاولون" — a real inconsistency in the production source itself, not
 * normalized here per the "no redesign" instruction). Each screen passes
 * its own literal `items`; only the shared visual shell lives here.
 *
 * MOBILE (< 768px). The pill bar is the only multi-destination navigation the
 * company screens have, and it does not fit a phone: it became a horizontal
 * scroller that opened centred on the CURRENT pill, so the destinations you
 * might actually want were the ones scrolled off both edges — reachable only
 * by discovering that a bar which looks static can be dragged. Below `md` the
 * bar is replaced by a header (hamburger · logo · current screen · account)
 * and the SAME `items`, in the same order, move into a drawer where each row
 * is a full-width 48px target.
 *
 * Nothing is added or removed: the drawer renders exactly the `items` its
 * screen already passed, links to the same hrefs, and marks the same current
 * entry. The desktop pill bar is untouched — it renders from the identical
 * markup it did before, inside `.sk-only-desktop`.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { AccountMenu } from "@/components/auth/AccountMenu";

export interface NavPillItem {
  key: string;
  label: string;
  icon: ReactNode;
  href?: string;
  current?: boolean;
}

/** iOS Human Interface minimum, same constant `AccountMenu` uses. */
const TAP_TARGET = 44;

export function CompanyTopNavPills({ items }: { items: NavPillItem[] }) {
  // The pill bar IS the company header on every RE screen, so it hosts the
  // mobile account menu. Rendered outside the scrolling pill row so it stays
  // reachable, and mobile-only so the desktop bar is unchanged.
  const barRef = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.current);
  const currentKey = current?.key;

  // Mobile only — the drawer below. Desktop never mounts it.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

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

  // Same five dismissal paths `AccountMenu` already implements, for the same
  // reasons: a drawer that will not close is worse than no drawer.
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    // The page behind a full-height drawer must not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <>
    {/* ---- Desktop: the pill bar, exactly as it was ------------------- */}
    <div className="sk-only-desktop" style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 20px" }}>
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
    </div>

    {/* ---- Mobile: the same destinations behind a drawer --------------- */}
    <div
      className="sk-only-mobile"
      style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 20px" }}
    >
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="فتح قائمة التنقل"
        aria-expanded={drawerOpen}
        aria-controls="sk-company-drawer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: TAP_TARGET,
          minWidth: TAP_TARGET,
          padding: "8px 12px",
          border: "1px solid var(--n-border)",
          borderRadius: "var(--r-full)",
          background: "var(--n-surface)",
          color: "var(--t-primary)",
          boxShadow: "var(--sh-1)",
          cursor: "pointer",
          flex: "none",
        }}
      >
        <BurgerIcon />
      </button>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <SukunLogo size={32} />
        <span
          style={{
            fontSize: "13.5px",
            fontWeight: 700,
            color: "var(--t-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {current?.label ?? ""}
        </span>
      </span>
      <span style={{ marginInlineStart: "auto" }}>
        <AccountMenu variant="compact" />
      </span>
    </div>

    {drawerOpen && (
      <div
        className="sk-only-mobile"
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 250,
          background: "rgba(var(--g-900-rgb), .45)",
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <nav
          id="sk-company-drawer"
          dir="rtl"
          aria-label="التنقل الرئيسي"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(82vw, 320px)",
            height: "100%",
            overflowY: "auto",
            background: "var(--n-surface)",
            borderInlineEnd: "1px solid var(--n-border)",
            boxShadow: "var(--sh-4)",
            padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
            animation: "sk-rise .28s var(--ease) both",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              paddingBottom: 14,
              marginBottom: 12,
              borderBottom: "1px solid var(--n-border)",
            }}
          >
            <SukunLogo size={40} />
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="إغلاق القائمة"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: TAP_TARGET,
                minWidth: TAP_TARGET,
                border: "1px solid var(--n-border-strong)",
                borderRadius: "var(--r-full)",
                background: "transparent",
                color: "var(--t-secondary)",
                cursor: "pointer",
              }}
            >
              <CloseIcon />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => {
              const rowStyle = {
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                minHeight: 48,
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                fontSize: "14px",
                fontWeight: 600,
                textAlign: "start" as const,
                textDecoration: "none",
                border: "none",
                cursor: item.current ? "default" : "pointer",
                background: item.current ? "var(--g-900)" : "var(--n-surface2)",
                color: item.current ? "var(--t-on-dark)" : "var(--t-primary)",
              };
              if (item.current || !item.href) {
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={item.current ? "page" : undefined}
                    disabled={item.current}
                    onClick={closeDrawer}
                    style={rowStyle}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              }
              return (
                <Link key={item.key} href={item.href} onClick={closeDrawer} style={rowStyle}>
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    )}
    </>
  );
}

function BurgerIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
