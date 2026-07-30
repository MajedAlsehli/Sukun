/**
 * Sukun brand primitives — the visual identity every redesigned screen pulls
 * from, so "premium" is a shared system rather than per-screen decoration.
 *
 * The mark is the official one from the brand kit (three nested arches with
 * navy/blue/gold keystones — see `SukunLogo.tsx`), no longer the rounded navy
 * tile that stood in for it. The gold ramp stays reserved for the AI/
 * assistant surfaces specifically. One accent colour, no glows — depth comes
 * from tinted shadows and 1px inner borders.
 */

import type { CSSProperties, ReactNode } from "react";
import { SukunLogo, SukunMark as OfficialSukunMark } from "./SukunLogo";
import { SparkIcon } from "./Icons";

/* ------------------------------------------------------------------ logo */

/**
 * Both logo entry points now render the official kit artwork (see
 * `SukunLogo.tsx`); these wrappers stay so the screens that already import
 * them keep working, and so "the logo" has one definition app-wide.
 */

export function SukunMark({ size = 34, tone = "navy" }: { size?: number; tone?: "navy" | "gold" | "onDark" }) {
  return <OfficialSukunMark size={size} tone={tone === "navy" ? "ink" : tone === "gold" ? "gold" : "onDark"} />;
}

/**
 * The screen-header lockup: official vertical logo, with an optional context
 * tagline set beside it against a hairline rule — so the logo itself is never
 * restyled per screen, only what sits next to it.
 */
export function SukunWordmark({
  size = 18,
  tone = "navy",
  tagline,
}: {
  size?: number;
  tone?: "navy" | "onDark";
  tagline?: string;
}) {
  const onDark = tone === "onDark";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <SukunLogo size={size * 2.6} tone={onDark ? "onDark" : "ink"} />
      {tagline && (
        <>
          <span
            style={{
              width: 1,
              alignSelf: "stretch",
              margin: "3px 0",
              background: onDark ? "rgba(244,241,234,.22)" : "var(--n-border-strong)",
            }}
          />
          <span
            style={{
              fontSize: size * 0.8,
              fontWeight: 600,
              letterSpacing: "-.1px",
              color: onDark ? "var(--t-on-dark-soft)" : "var(--t-secondary)",
            }}
          >
            {tagline}
          </span>
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------- surfaces */

/** The gold "assistant" chip that marks anything the AI produced. */
export function AiChip({ label = "مستشار سُكن", tone = "gold" }: { label?: string; tone?: "gold" | "onDark" }) {
  const onDark = tone === "onDark";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12,
        fontWeight: 700,
        padding: "6px 13px 6px 11px",
        borderRadius: "var(--r-full)",
        color: onDark ? "var(--a-200)" : "var(--a-700)",
        background: onDark ? "rgba(224,172,110,.16)" : "var(--a-50)",
        boxShadow: onDark ? "inset 0 0 0 1px rgba(224,172,110,.28)" : "inset 0 0 0 1px var(--a-100)",
      }}
    >
      <SparkIcon size={14} />
      {label}
    </span>
  );
}

/**
 * The dark brand panel used for every AI-owned surface (analysis, advisor,
 * result headers). A mesh of two soft radial washes over the navy base, plus
 * an inner top highlight so the edge reads as a physical bevel rather than a
 * flat fill.
 */
export function BrandPanel({
  children,
  radius = "var(--r-2xl)",
  padding = 30,
  style,
}: {
  children: ReactNode;
  radius?: string;
  padding?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: radius,
        padding,
        background:
          "radial-gradient(110% 80% at 88% 0%, rgba(184,132,72,.22) 0%, transparent 58%)," +
          "radial-gradient(90% 70% at 0% 100%, rgba(56,104,202,.18) 0%, transparent 60%)," +
          "linear-gradient(160deg, var(--g-800) 0%, var(--g-900) 62%, var(--g-950) 100%)",
        color: "var(--t-on-dark)",
        boxShadow: "var(--sh-4), inset 0 1px 0 rgba(244,241,234,.09)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Hairline section heading — label above, rule beside. Replaces bare <h3>s. */
export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "0 2px 16px" }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.2px", margin: 0 }}>{title}</h3>
        {hint && (
          <p style={{ fontSize: 12.5, color: "var(--t-tertiary)", margin: "4px 0 0", lineHeight: 1.6 }}>{hint}</p>
        )}
      </div>
      <span style={{ flex: 1, height: 1, background: "var(--n-border)" }} />
      {action}
    </div>
  );
}

/* ---------------------------------------------------------- empty states */

/**
 * Composed empty state — an illustrated arch motif rather than a lone icon,
 * with the action that populates the view attached. Used anywhere a list can
 * legitimately be empty.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "56px 28px",
        borderRadius: "var(--r-xl)",
        background: "linear-gradient(180deg,var(--n-surface) 0%, var(--n-surface2) 100%)",
        boxShadow: "inset 0 0 0 1px var(--n-border)",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 96,
          height: 96,
          marginBottom: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <circle cx="48" cy="48" r="47" stroke="var(--n-border-strong)" strokeDasharray="4 7" />
        </svg>
        {/* The brand arch itself, held back to a watermark so the state's own
            icon still leads. */}
        <span style={{ position: "absolute", opacity: 0.14 }}>
          <SukunMark size={46} />
        </span>
        <span style={{ position: "absolute", color: "var(--a-500)" }}>{icon}</span>
      </span>
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
      <p
        style={{
          fontSize: 14,
          color: "var(--t-secondary)",
          lineHeight: 1.75,
          margin: "10px 0 0",
          maxWidth: "44ch",
        }}
      >
        {body}
      </p>
      {action && <div style={{ marginTop: 24 }}>{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- controls */

export const brandButton = (variant: "primary" | "gold" | "ghost" | "onDark" = "primary"): CSSProperties => {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    fontSize: 15,
    fontWeight: 600,
    padding: "14px 26px",
    borderRadius: "var(--r-md)",
    border: "none",
    cursor: "pointer",
    transition: "transform .18s var(--ease), box-shadow .18s var(--ease), background .18s var(--ease)",
  };
  if (variant === "gold")
    return {
      ...base,
      background: "linear-gradient(135deg,var(--a-400),var(--a-600))",
      color: "var(--t-on-dark)",
      boxShadow: "var(--sh-2)",
    };
  if (variant === "ghost")
    return {
      ...base,
      background: "transparent",
      color: "var(--t-primary)",
      boxShadow: "inset 0 0 0 1.5px var(--n-border-strong)",
    };
  if (variant === "onDark")
    return { ...base, background: "var(--t-on-dark)", color: "var(--g-900)", boxShadow: "var(--sh-2)" };
  return { ...base, background: "var(--g-900)", color: "var(--t-on-dark)", boxShadow: "var(--sh-2)" };
};

/** Stat/meta pill used across the redesigned screens. */
export function MetaPill({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  tone?: "neutral" | "gold" | "ok" | "warn" | "err" | "onDark";
}) {
  const tones: Record<string, { c: string; b: string }> = {
    neutral: { c: "var(--t-secondary)", b: "var(--n-surface2)" },
    gold: { c: "var(--a-700)", b: "var(--a-50)" },
    ok: { c: "var(--ok-strong)", b: "var(--ok-bg)" },
    warn: { c: "var(--warn-strong)", b: "var(--warn-bg)" },
    err: { c: "var(--err)", b: "var(--err-bg)" },
    onDark: { c: "var(--t-on-dark)", b: "rgba(244,241,234,.1)" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12.5,
        fontWeight: 600,
        color: t.c,
        background: t.b,
        padding: "7px 13px",
        borderRadius: "var(--r-full)",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
      {value && <b style={{ fontWeight: 700 }}>{value}</b>}
    </span>
  );
}
