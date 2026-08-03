"use client";

/**
 * H3/H4's data layer.
 *
 *   lib/backend/discovery.ts -> lib/adapters/discovery.ts -> THIS -> frozen screen
 *
 * Demo Mode and real mode differ ONLY in the source:
 *
 *   DEMO_MODE=true   the fixtures module (`lib/demo/discoveryFixtures.ts`) is
 *                    read synchronously, exactly as before Task 2. No Backend
 *                    call is made, no `AbortController` is created, and the
 *                    localStorage favourites/bookings records keep their
 *                    original numeric keys.
 *   DEMO_MODE=false  the real `/api/discovery/*` endpoints, with no fixture
 *                    fallback on any path — a network error, a 401/403, an
 *                    empty page and an unavailable recommendation each surface
 *                    as themselves.
 *
 * The two modes hand the screen the SAME `DiscoveryProjectViewModel[]`, so the
 * component has no branch of its own and cannot tell demo data from real data.
 */

import { useCallback, useMemo, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import {
  PROJECTS,
  loadActivity,
  ranked,
  toggleFav as toggleFavStore,
  type DiscoveryActivity,
  type Preferences,
} from "@/lib/demo/discoveryFixtures";
import { backendDiscovery, type ListDiscoveryProjectsQuery } from "@/lib/backend/discovery";
import {
  isShowcaseId,
  showcaseProjectById,
  showcaseProjects,
} from "@/lib/demo/showcaseCatalogue";
import {
  toDemoProjectViewModel,
  toProjectDetailViewModel,
  toProjectViewModel,
  toRecommendationViewModel,
  withPreferenceMatch,
  type DiscoveryProjectDetailViewModel,
  type DiscoveryProjectViewModel,
  type RecommendationViewModel,
} from "@/lib/adapters/discovery";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

/** The page size H3's search view requests. The Backend caps `pageSize` at 100. */
export const DISCOVERY_PAGE_SIZE = 24;

export interface DiscoveryListResult {
  status: AsyncStatus;
  projects: DiscoveryProjectViewModel[];
  total: number;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * Demo Mode's ranked fixture list, with the localStorage favourites folded into
 * `isSaved` so the same field drives both modes' heart icon.
 */
function demoProjects(prefs: Preferences, activity: DiscoveryActivity): DiscoveryProjectViewModel[] {
  const favByNumericId = activity.fav;
  return ranked(prefs).map((r) => {
    const source = PROJECTS.find((p) => p.id === r.id) ?? PROJECTS[0];
    return { ...toDemoProjectViewModel(source, prefs), isSaved: !!favByNumericId[source.id] };
  });
}

export function useDiscoveryProjects(
  prefs: Preferences,
  activity: DiscoveryActivity,
  query: ListDiscoveryProjectsQuery = {},
): DiscoveryListResult {
  const queryKey = JSON.stringify(query);

  const resource = useAsyncResource(
    async (signal) => {
      const page = await backendDiscovery.listProjects(
        { pageSize: DISCOVERY_PAGE_SIZE, ...query },
        { signal },
      );
      return page;
    },
    [queryKey],
    { enabled: !DEMO_MODE },
  );

  const demo = useMemo(
    () => (DEMO_MODE ? demoProjects(prefs, activity) : []),
    [prefs, activity],
  );

  if (DEMO_MODE) {
    return { status: "ready", projects: demo, total: demo.length, errorMessage: null, reload: () => {} };
  }

  const serverProjects = (resource.data?.items ?? []).map((dto) => toProjectViewModel(dto, prefs));

  /**
   * The Backend's own projects, plus the presentation catalogue
   * (`lib/demo/showcaseCatalogue.ts`). The server's items are never replaced,
   * reordered ahead of their rank, or filtered — they are ranked together with
   * the showcase listings by the same `scoreOf`, so one ordering rule applies
   * to both. With the showcase off this is exactly the previous expression.
   */
  /**
   * Only merged once the request has actually SUCCEEDED. A network failure, a
   * 401/403 or a still-loading page keeps its own honest state: padding a
   * broken catalogue with eleven listings that always render would hide a real
   * outage behind a page that looks perfectly healthy, and nobody would find
   * out until a visitor clicked something that needed the server.
   */
  const supplementary = resource.status === "ready" ? showcaseProjects(prefs) : [];
  const projects = [...serverProjects, ...supplementary].sort((a, b) => b.match - a.match);

  return {
    status: resource.status,
    projects,
    // The count the screen prints has to match the list it renders.
    total: (resource.data?.total ?? 0) + supplementary.length,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}

export interface DiscoveryDetailResult {
  status: AsyncStatus;
  project: DiscoveryProjectDetailViewModel | null;
  errorMessage: string | null;
  /** `true` when the Backend answered 404 — the project is not discoverable. */
  notFound: boolean;
  reload: () => void;
}

export function useDiscoveryProject(
  projectId: string,
  prefs: Preferences,
): DiscoveryDetailResult {
  /**
   * A showcase id belongs to no server record, so the request is not made at
   * all — asking the Backend for `showcase-7` would be a guaranteed 404 and a
   * "project unavailable" screen in the middle of the presentation.
   */
  const showcase = useMemo(
    () => showcaseProjectById(projectId, prefs),
    [projectId, prefs],
  );

  const resource = useAsyncResource(
    (signal) => backendDiscovery.getProject(projectId, { signal }),
    [projectId],
    { enabled: !DEMO_MODE && !!projectId && !isShowcaseId(projectId) },
  );

  const demo = useMemo(() => {
    if (!DEMO_MODE) return null;
    const numeric = Number(projectId);
    const source = PROJECTS.find((p) => p.id === numeric) ?? PROJECTS[0];
    const base = toDemoProjectViewModel(source, prefs);
    return {
      ...base,
      availableUnits: [],
      visitSlots: [],
    } satisfies DiscoveryProjectDetailViewModel;
  }, [projectId, prefs]);

  if (DEMO_MODE) {
    return { status: "ready", project: demo, errorMessage: null, notFound: false, reload: () => {} };
  }

  if (showcase) {
    return {
      status: "ready",
      // No `availableUnits` and no `visitSlots`: a showcase listing has no
      // real inventory, so the booking form offers nothing to select rather
      // than offering a slot that cannot be booked.
      project: { ...showcase, availableUnits: [], visitSlots: [] },
      errorMessage: null,
      notFound: false,
      reload: () => {},
    };
  }

  const notFound =
    resource.status === "error" &&
    typeof resource.error === "object" &&
    resource.error !== null &&
    (resource.error as { httpStatus?: number }).httpStatus === 404;

  return {
    status: resource.status,
    project: resource.data ? toProjectDetailViewModel(resource.data, prefs) : null,
    errorMessage: resource.errorMessage,
    notFound,
    reload: resource.reload,
  };
}

export interface RecommendationResult {
  status: AsyncStatus;
  recommendation: RecommendationViewModel | null;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * `GET /discovery/recommendations`.
 *
 * `available: false` is a 200, not an error, and reaches the screen as an
 * explicit `unavailable` state with the Backend's own reason code. It is never
 * collapsed into an empty list (which would read as "no matches") and never
 * replaced by a locally-picked project presented as an AI recommendation.
 *
 * In Demo Mode the recommendation is the top locally-ranked fixture, which is
 * exactly what the approved screen already showed.
 */
export function useDiscoveryRecommendation(
  prefs: Preferences,
  activity: DiscoveryActivity,
): RecommendationResult {
  const resource = useAsyncResource(
    (signal) => backendDiscovery.getRecommendations({ signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  const demo = useMemo<RecommendationViewModel | null>(() => {
    if (!DEMO_MODE) return null;
    const list = demoProjects(prefs, activity);
    if (list.length === 0) return { state: "unavailable", reasonCode: "NO_DISCOVERABLE_PROJECTS", items: [] };
    return {
      state: "available",
      reasonCode: null,
      items: [{ project: list[0], reason: list[0].reasons[0] ?? "" }],
    };
  }, [prefs, activity]);

  if (DEMO_MODE) {
    return { status: "ready", recommendation: demo, errorMessage: null, reload: () => {} };
  }

  return {
    status: resource.status,
    recommendation: resource.data ? toRecommendationViewModel(resource.data, prefs) : null,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}

export interface SaveToggleResult {
  /**
   * Whether THIS project is saved right now: the local override if this session
   * has toggled it, otherwise the server's own `isSaved` (or, in Demo Mode, the
   * localStorage favourites record).
   */
  isSaved: (project: DiscoveryProjectViewModel) => boolean;
  /** Ids with an in-flight save/unsave, so a control can disable itself. */
  pendingIds: ReadonlySet<string>;
  toggle: (project: DiscoveryProjectViewModel) => Promise<void>;
  errorMessage: string | null;
}

/**
 * Save / unsave.
 *
 * Real mode issues the real `POST`/`DELETE` and then applies the SERVER's
 * returned `saved` flag. The optimistic value is rolled back on failure rather
 * than left showing a state the Backend never accepted.
 *
 * Demo Mode writes the existing localStorage record through the fixtures
 * module's own `toggleFav`, keyed by the original NUMERIC id, so the stored
 * shape is byte-identical to before Task 2. Converting at this one boundary is
 * why `lib/demo/discoveryFixtures.ts` needed no change at all.
 *
 * Overrides are held as a map rather than a seeded set, so a freshly-loaded
 * page shows the server's truth immediately and a click shows the user's
 * intent — with no seeding race between the two.
 */
export function useSavedProjects(
  activity: DiscoveryActivity,
  onDemoActivityChange: (next: DiscoveryActivity) => void,
): SaveToggleResult {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setOverride = useCallback((id: string, value: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const isSaved = useCallback(
    (project: DiscoveryProjectViewModel) => {
      if (DEMO_MODE) return !!activity.fav[Number(project.id)];
      const override = overrides.get(project.id);
      return override === undefined ? project.isSaved : override;
    },
    [activity.fav, overrides],
  );

  const toggle = useCallback(
    async (project: DiscoveryProjectViewModel) => {
      if (DEMO_MODE) {
        onDemoActivityChange(toggleFavStore(Number(project.id)));
        return;
      }
      /**
       * A showcase listing has no server record to save against, so the heart
       * is a local override only. Without this the POST 404s and the heart
       * rolls back under the user's finger with an error message.
       */
      if (isShowcaseId(project.id)) {
        setOverride(project.id, !(overrides.get(project.id) ?? project.isSaved));
        return;
      }
      const id = project.id;
      const currentlySaved = overrides.get(id) ?? project.isSaved;

      setErrorMessage(null);
      setPending((prev) => new Set(prev).add(id));
      setOverride(id, !currentlySaved);

      try {
        const result = currentlySaved
          ? await backendDiscovery.unsaveProject(id)
          : await backendDiscovery.saveProject(id);
        // The server's own answer wins over the optimistic guess.
        setOverride(id, result.saved);
      } catch (err) {
        // Roll back to the pre-click truth. Never leave the heart showing a
        // state the Backend refused.
        setOverride(id, currentlySaved);
        setErrorMessage(arabicMessageFor(err));
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onDemoActivityChange, overrides, setOverride],
  );

  return { isSaved, pendingIds: pending, toggle, errorMessage };
}

export { withPreferenceMatch };
