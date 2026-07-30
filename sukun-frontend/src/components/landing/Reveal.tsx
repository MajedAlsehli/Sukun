"use client";

/**
 * Runtime equivalent of `Sakn Landing.dc.html`'s own `[data-reveal]` +
 * `IntersectionObserver` script (see that file's `componentDidMount`):
 * each wrapped block starts hidden/offset and fades/slides into place the
 * first time it scrolls into view, then stays (the observer unobserves
 * itself, same as the source). `prefers-reduced-motion` shows everything
 * immediately, matching the source's own reduced-motion branch.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function Reveal({
  children,
  as: Tag = "div",
  translateY = 28,
  duration = 0.7,
  delay = "0s",
  style,
  className,
}: {
  children: ReactNode;
  as?: "div" | "section";
  translateY?: number;
  duration?: number;
  delay?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : `translateY(${translateY}px)`,
        transition: `opacity ${duration}s var(--ease), transform ${duration}s var(--ease)`,
        transitionDelay: delay,
        ...style,
      }}
    >
      {children}
    </Comp>
  );
}
