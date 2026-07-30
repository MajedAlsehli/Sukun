"use client";

/**
 * Two small viewport primitives the mobile corrections need in JS, because CSS
 * alone cannot express them.
 *
 * `useIsMobile` gates behaviour (not styling) that must differ on a phone —
 * specifically, suppressing a duplicated fixed action. Styling stays in
 * `globals.css`; this is only for logic that has to know.
 *
 * `useInViewport` answers "is the original of this action currently on
 * screen?", which is what decides whether a sticky duplicate of it should
 * exist at all.
 */

import { useEffect, useState } from "react";

/** Matches the one breakpoint the whole mobile pass uses. */
export const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  // `false` on the server and on the first client frame: the desktop
  // composition is the default, and a phone corrects itself immediately after
  // mount. The reverse would flash a mobile-only change onto desktop.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // `matchMedia` is absent in jsdom and in older embedded webviews. Its
    // absence means "we cannot tell", and the honest answer to that is the
    // desktop default — never a mobile-only behaviour applied blind.
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return isMobile;
}

/**
 * `[ref, isInViewport]` — attach `ref` to the element you care about.
 *
 * A CALLBACK ref, not a `useRef` object, and that is the whole point. With a
 * ref object the observer effect runs once, on mount, when `ref.current` is
 * still `null` — the element only exists after the screen's data arrives and
 * it renders past its loading state. The effect never re-runs (a ref object's
 * identity is stable), so nothing is ever observed and the value stays `false`
 * forever. That is exactly why the first version of the sticky-CTA fix looked
 * correct and did nothing in production.
 *
 * A callback ref sets state when the node attaches, which re-runs the effect
 * with a real element.
 *
 * `enabled: false` short-circuits to `false`, so a screen can opt out entirely
 * at desktop width.
 */
export function useInViewport({
  enabled = true,
  rootMargin = "0px",
}: { enabled?: boolean; rootMargin?: string } = {}): [(node: Element | null) => void, boolean] {
  const [node, setNode] = useState<Element | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || !node || typeof IntersectionObserver === "undefined") {
      setVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, enabled, rootMargin]);

  return [setNode, visible];
}
