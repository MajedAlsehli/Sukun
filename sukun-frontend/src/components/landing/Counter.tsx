"use client";

/** Port of `Sakn Landing.dc.html`'s `runCounters` — same 1600ms cubic
 * ease-out count-up, same instant-to-target behavior under
 * prefers-reduced-motion. `active` flips once when the stats section
 * scrolls into view (see LandingScreen's own IntersectionObserver). */

import { useEffect, useRef, useState } from "react";

export function Counter({
  target,
  suffix,
  active,
}: {
  target: number;
  suffix: string;
  active: boolean;
}) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(target);
      return;
    }

    const duration = 1600;
    const start = performance.now();
    let frame: number;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}
