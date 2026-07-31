/**
 * Guards the mobile corrections in `globals.css`.
 *
 * jsdom has no layout engine, so a unit test cannot measure overflow — that is
 * verified by the Playwright sweep across 375/390/393/430/1440. What IS worth
 * locking down here, because it is what actually broke twice during this pass,
 * is the SHAPE of these rules:
 *
 *   * every mobile correction stays inside a `max-width` media query, so it can
 *     never reach the frozen 1440x900 desktop rendering;
 *   * the rules that must beat an inline `style` attribute keep `!important`
 *     (without it they silently do nothing — both of them did, at first);
 *   * the bottom-nav rule sets only the INLINE padding, so the component's
 *     `env(safe-area-inset-bottom)` is preserved;
 *   * the stylesheet still parses (an earlier edit produced an unterminated
 *     comment that silently swallowed a whole media block).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Splits the file into top-level blocks so "is this inside @media?" is answerable. */
function blockAt(index: number): string {
  const before = css.slice(0, index);
  const open = before.lastIndexOf("@media");
  if (open === -1) return "";
  return css.slice(open, index);
}

describe("globals.css mobile corrections", () => {
  it("parses — braces and comments are balanced", () => {
    expect(css.split("{").length).toBe(css.split("}").length);
    // Every `/*` has a matching `*/`, and no stray `*/` appears first.
    expect(css.split("/*").length).toBe(css.split("*/").length);
  });

  it("bumps form controls to 16px only inside a narrow, touch-only media query", () => {
    const i = css.indexOf("font-size: 16px !important");
    expect(i).toBeGreaterThan(-1);
    const scope = blockAt(i);
    expect(scope).toMatch(/max-width:\s*560px/);
    expect(scope).toMatch(/pointer:\s*coarse/);
    expect(scope).toMatch(/hover:\s*none/);
  });

  it("keeps !important on the rule that must outrank an inline style attribute", () => {
    // Every control carries its font-size inline, so the rule is inert without it.
    expect(css).toMatch(/font-size:\s*16px\s*!important/);
  });

  it("never touches the bottom nav's own padding — its safe-area inset must survive", () => {
    // The nav measures 377px at 375px in RTL, but that is a symptom of the
    // document overflow, not its cause (hiding the nav does not change it).
    // A padding override here would be both useless and a real risk to
    // `calc(8px + env(safe-area-inset-bottom))`.
    expect(css).not.toMatch(/data-sk-bottom-nav/);
  });

  it("adds no unscoped rule — every mobile correction is inside a max-width query", () => {
    for (const marker of ["font-size: 16px !important", "[data-sk-mobile-fit] table"]) {
      const i = css.indexOf(marker);
      expect(i, `${marker} must exist`).toBeGreaterThan(-1);
      expect(blockAt(i), `${marker} must be inside a max-width media query`).toMatch(/max-width/);
    }
  });

  it("raises tap targets to 44px, and only below the md breakpoint", () => {
    const i = css.indexOf("min-height: 44px");
    expect(i).toBeGreaterThan(-1);
    expect(blockAt(i)).toMatch(/max-width:\s*767px/);
  });

  it("centres a taller control's label without changing its box type", () => {
    // `display: flex` on a button whose content is a block (a whole card
    // rendered as a button) would re-lay-out it; `align-content` does not.
    const i = css.indexOf("min-height: 44px");
    const rule = css.slice(i, css.indexOf("}", i));
    expect(rule).toContain("align-content: center");
    expect(rule).not.toMatch(/display:\s*(inline-)?flex/);
  });

  it("keeps the 44px tap-target floor out of the min-width zeroing rule", () => {
    // `[style*="min-width: 4"]` matched `min-width: 44px` and collapsed the
    // account/drawer buttons to their icon's width.
    const i = css.indexOf('[style*="min-width: 4"]');
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, css.indexOf("{", i))).toContain(':not([style*="min-width: 44px"])');
  });

  it("collapses each uneven two-column split, inside the md breakpoint", () => {
    // Listed literally, not pattern-matched: each template string occurs once
    // in the codebase, so the rule cannot reach a grid nobody looked at.
    for (const template of [
      "1.05fr .95fr",
      "1.15fr 1fr",
      "1.15fr .85fr",
      "1.3fr 1fr",
      "1.35fr 1fr",
      "1.5fr 1fr",
      "1fr 1.3fr",
      "1.6fr 1fr",
    ]) {
      // `lastIndexOf`: three of these also appear in the older, narrower
      // `data-sk-mobile-fit`-scoped block at 560px, which this supersedes.
      const i = css.lastIndexOf(`[style*="grid-template-columns: ${template}"]`);
      expect(i, `${template} must be collapsed`).toBeGreaterThan(-1);
      expect(blockAt(i), `${template} must be inside a max-width query`).toMatch(/max-width:\s*767px/);
    }
  });

  it("collapses an EQUAL pair only at the narrowest widths", () => {
    // Two fields side by side still read at 375px; stacking them there would
    // lengthen forms that were never reported.
    const i = css.indexOf('[style*="grid-template-columns: 1fr 1fr"]');
    expect(i).toBeGreaterThan(-1);
    expect(blockAt(i)).toMatch(/max-width:\s*360px/);
    // A `grid-column: span 2` child would re-create the second track implicitly.
    expect(css.slice(i)).toContain("grid-column: auto !important");
  });

  it("recomposes the landing hero only below the md breakpoint", () => {
    for (const marker of [
      "[data-sk-hero-copy]",
      "[data-sk-hero-media]",
      "[data-sk-hero-veil]",
      "[data-sk-hero-glow]",
      "[data-sk-hero-scroll]",
      "[data-sk-landing-bar]",
    ]) {
      const i = css.indexOf(marker);
      expect(i, `${marker} must be styled`).toBeGreaterThan(-1);
      expect(blockAt(i), `${marker} must be inside a max-width query`).toMatch(/max-width/);
    }
  });

  it("orders the hero title -> paragraph -> CTA -> image, never the reverse", () => {
    // The copy must come before the photograph. If these two ever swap, the
    // page is back to the composition that put the paragraph on top of a
    // palm tree.
    const copy = css.slice(css.indexOf("[data-sk-hero-copy] {"));
    const media = css.slice(css.indexOf("[data-sk-hero-media] {"));
    expect(copy.slice(0, copy.indexOf("}"))).toMatch(/order:\s*1/);
    expect(media.slice(0, media.indexOf("}"))).toMatch(/order:\s*2/);
  });

  it("keeps one gutter for the bar and the hero copy at each step", () => {
    // The logo lining up with the headline is the whole point; two different
    // values would put them 4px apart, which is exactly what "accidental"
    // looks like.
    const at360 = css.slice(css.lastIndexOf("@media (max-width: 360px)"));
    expect(at360).toContain("[data-sk-hero-copy]");
    expect(at360).toContain("[data-sk-landing-bar]");
    expect((at360.match(/padding-inline:\s*16px/g) ?? []).length).toBe(2);
  });

  it("re-reserves the company search field's icon space on the logical side", () => {
    const i = css.indexOf("[data-sk-search-field]");
    expect(i).toBeGreaterThan(-1);
    expect(blockAt(i)).toMatch(/max-width:\s*767px/);
    // The inline `padding` shorthand outranks any rule without `!important`.
    expect(css.slice(i, css.indexOf("}", i))).toMatch(/padding-inline:\s*42px 14px\s*!important/);
  });

  it("still confines the pre-existing grid corrections to data-sk-mobile-fit subtrees", () => {
    // These were scoped deliberately after an unscoped version changed fifteen
    // other screens; re-widening them would be a silent visual regression.
    const gridRules = css.match(/\[data-sk-mobile-fit\][^{]*\{[^}]*grid-template-columns[^}]*\}/g) ?? [];
    expect(gridRules.length).toBeGreaterThan(0);
    for (const rule of gridRules) {
      expect(rule).toContain("[data-sk-mobile-fit]");
    }
  });
});
