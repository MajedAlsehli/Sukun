"use client";

/**
 * Measures the fixed layers at the bottom of the screen and publishes their
 * REAL heights, so the offsets in `globals.css` stop being guesses.
 *
 * Three layers can share that band: the homeowner bottom nav, a screen's own
 * fixed CTA bar, and the global session badge. Each has to clear the ones below
 * it, and the document has to reserve enough padding that the last row of real
 * content is not permanently underneath them. On a real iPhone all three were
 * drawn on top of one another and on top of the page.
 *
 * Hard-coded constants were the first attempt and they were wrong by a few
 * pixels in both directions: the nav is 62px plus `env(safe-area-inset-bottom)`
 * (0 on a desktop browser, 34 on a notched iPhone), and the project-details CTA
 * bar is 74px on one line and 129px when it wraps at 390px. A stale constant
 * either leaves a gap or lets the layers touch — which is exactly the class of
 * defect this is fixing — so the values are measured instead.
 *
 * Mounted once, in the root layout. It writes only CSS custom properties on
 * `<body>`; every rule that reads them is inside a media query or gated on the
 * CTA-present flag, so nothing here changes a layout on its own.
 */

import { useEffect } from "react";

const NAV_SELECTOR = 'nav[aria-label="التنقل الرئيسي"]';
const CTA_SELECTOR = "[data-sk-cta-bar]";
const ASSISTANT_SELECTOR = "[data-sk-assistant-card]";
const BADGE_SELECTOR = "[data-sk-session-menu]";

function isFixed(el: Element): boolean {
  return getComputedStyle(el).position === "fixed";
}

function fixedHeight(selector: string): number {
  const el = Array.from(document.querySelectorAll(selector)).find(
    (candidate) => isFixed(candidate) && candidate.getBoundingClientRect().height > 0,
  );
  return el ? Math.round(el.getBoundingClientRect().height) : 0;
}

export function BottomStack() {
  useEffect(() => {
    const body = document.body;

    const measure = () => {
      // Only the FIXED bottom nav counts; the desktop variant is a sticky top
      // bar with the same aria-label and occupies no bottom space.
      const navH = fixedHeight(NAV_SELECTOR);
      const ctaH = fixedHeight(CTA_SELECTOR);
      // The PM assistant is a bottom-right card at desktop (no collision with
      // the bottom-left badge) and a full-width sheet on a phone (a direct
      // collision — production drew the badge on top of it).
      const assistantEl = Array.from(document.querySelectorAll(ASSISTANT_SELECTOR)).find(
        (el) => isFixed(el) && el.getBoundingClientRect().height > 0,
      );
      const assistantRect = assistantEl?.getBoundingClientRect();
      const assistantSpansWidth =
        !!assistantRect && assistantRect.width > window.innerWidth * 0.6;
      const assistantH = assistantSpansWidth ? Math.round(assistantRect.height) : 0;
      // The badge itself takes space at the bottom of the document; without
      // reserving it, it sits on top of the last row of content (it covered
      // the "سياسة الخصوصية" link on /activate).
      const badgeH = fixedHeight(BADGE_SELECTOR);

      /**
       * The TOP sticky band — a screen's own header plus any sticky tab row
       * under it. Scroll targets have to clear it: `scrollIntoView` and anchor
       * links align an element to the top of the viewport, which is *behind*
       * a sticky header, so tapping "احجز زيارة" landed the booking form's
       * first time slots underneath the header and the section tabs, where
       * they could not be tapped at all.
       */
      let stickyTopH = 0;
      for (const el of Array.from(document.querySelectorAll("header, nav"))) {
        const cs = getComputedStyle(el);
        if (cs.position !== "sticky" && cs.position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.height <= 0) continue;
        // Anchored to the TOP of the viewport, not the bottom.
        if (r.top > 8) continue;
        stickyTopH += Math.round(r.height);
      }

      body.style.setProperty("--sk-sticky-top-h", `${stickyTopH}px`);
      body.style.setProperty("--sk-bottom-nav-h", `${navH}px`);
      body.style.setProperty("--sk-cta-h", `${ctaH}px`);
      body.style.setProperty("--sk-assistant-h", `${assistantH}px`);
      body.style.setProperty("--sk-badge-h", `${badgeH}px`);
      if (ctaH > 0) body.setAttribute("data-sk-cta-bar-present", "");
      else body.removeAttribute("data-sk-cta-bar-present");
    };

    measure();

    // The heights change when the CTA bar wraps, when a screen mounts or
    // unmounts one, and on rotation.
    const ro = new ResizeObserver(measure);
    const observed = new Set<Element>();
    const observeAll = () => {
      for (const el of [
        ...document.querySelectorAll(NAV_SELECTOR),
        ...document.querySelectorAll(CTA_SELECTOR),
        ...document.querySelectorAll(ASSISTANT_SELECTOR),
        ...document.querySelectorAll(BADGE_SELECTOR),
      ]) {
        if (!observed.has(el)) {
          observed.add(el);
          ro.observe(el);
        }
      }
    };
    observeAll();

    const mo = new MutationObserver(() => {
      observeAll();
      measure();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // A sticky header's own height can change as the page scrolls.
    window.addEventListener("scroll", measure, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("scroll", measure);
      body.style.removeProperty("--sk-sticky-top-h");
      body.style.removeProperty("--sk-bottom-nav-h");
      body.style.removeProperty("--sk-cta-h");
      body.style.removeProperty("--sk-assistant-h");
      body.style.removeProperty("--sk-badge-h");
      body.removeAttribute("data-sk-cta-bar-present");
    };
  }, []);

  return null;
}
