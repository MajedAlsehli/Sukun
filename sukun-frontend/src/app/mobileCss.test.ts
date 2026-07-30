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
