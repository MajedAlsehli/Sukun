"use client";

/**
 * SHOWCASE CATALOGUE (user instruction, 2026-07-31 — presentation).
 *
 * WHAT THIS IS. The Backend's own catalogue currently holds ONE project, so
 * Discovery renders a browse screen with a single card. For the presentation
 * the marketplace has to look like a marketplace. This module supplies the
 * additional listings from the frontend's own fixtures and merges them into
 * the list Discovery renders.
 *
 * WHAT IT DELIBERATELY IS NOT.
 *   * It is NOT `DEMO_MODE`. That flag gates 48 files and swaps the whole
 *     session model for synthetic logins; it stays off. Authentication, the
 *     API client, the request/response contract and every other domain behave
 *     exactly as they do today.
 *   * It writes nothing and requests nothing. No endpoint is called for these
 *     projects, no database row is created, and the real `GET /api/discovery/*`
 *     responses are passed through untouched — the server's own projects are
 *     still first-class and still rendered from its data.
 *
 * HONESTY BOUNDARY. This is the one place in this codebase where fixture data
 * is shown outside Demo Mode, and it is a deliberate, scoped exception rather
 * than a drift: every showcase id is namespaced `showcase-*`, so a listing
 * that came from here can always be told apart from one the Backend returned,
 * and no showcase id is ever sent to an endpoint. Turning it off is one
 * environment variable and no code change — see `SHOWCASE_CATALOGUE`.
 *
 * Anything a showcase listing cannot honestly do, it does not pretend to do:
 * it exposes no `availableUnits`, so the booking form has nothing to select
 * and `POST /api/visits` is never reached with an id the Backend has never
 * heard of.
 */

import { PROJECTS, type Preferences } from "@/lib/demo/discoveryFixtures";
import { toDemoProjectViewModel, type DiscoveryProjectViewModel } from "@/lib/adapters/discovery";

/**
 * On by default so the presentation build needs no extra configuration.
 * Set `NEXT_PUBLIC_SHOWCASE_CATALOGUE=false` to serve only what the Backend
 * returns — which is what a production catalogue with real inventory should
 * eventually do.
 */
export const SHOWCASE_CATALOGUE = process.env.NEXT_PUBLIC_SHOWCASE_CATALOGUE !== "false";

/** The prefix that marks an id as frontend-supplied. */
export const SHOWCASE_ID_PREFIX = "showcase-";

export function isShowcaseId(id: string): boolean {
  return id.startsWith(SHOWCASE_ID_PREFIX);
}

/**
 * The fixture catalogue as view models, ranked against the resident's own
 * stored preferences by exactly the same `scoreOf` the Backend's projects are
 * ranked with — so a showcase card and a server card are ordered by one
 * implementation, not two that can disagree.
 */
export function showcaseProjects(prefs: Preferences): DiscoveryProjectViewModel[] {
  if (!SHOWCASE_CATALOGUE) return [];
  return PROJECTS.map((project) => {
    const vm = toDemoProjectViewModel(project, prefs);
    return { ...vm, id: `${SHOWCASE_ID_PREFIX}${project.id}` };
  });
}

/** One showcase listing by its namespaced id, or `null` if it is not ours. */
export function showcaseProjectById(
  id: string,
  prefs: Preferences,
): DiscoveryProjectViewModel | null {
  if (!SHOWCASE_CATALOGUE || !isShowcaseId(id)) return null;
  const numeric = Number(id.slice(SHOWCASE_ID_PREFIX.length));
  const source = PROJECTS.find((p) => p.id === numeric);
  if (!source) return null;
  return { ...toDemoProjectViewModel(source, prefs), id };
}
