"use client";

/**
 * H7 (My Home) and H10 (Warranty) data layer.
 *
 *   lib/backend/{homeowners,warranty}.ts
 *     -> lib/adapters/{homeowner,warranty}.ts
 *     -> THIS
 *     -> frozen MyHomeScreen / WarrantyCenterScreen
 *
 * Warranty is a DEPENDENT load: `GET /api/warranty` requires a `unitId`, and the
 * only legitimate source of that id is the caller's own active ownership from
 * `GET /api/homeowners/me`. `useAsyncResource`'s `enabled` flag keeps the second
 * request from firing at all until the first has supplied one — no placeholder
 * id, no guess, no request that is certain to 404.
 */

import { DEMO_MODE } from "@/lib/demo/config";
import { backendHomeowners, type MyHomeDto } from "@/lib/backend/homeowners";
import { backendWarranty } from "@/lib/backend/warranty";
import { backendReports } from "@/lib/backend/reports";
import {
  toActivityEvents,
  toAttentionItems,
  toMyHomeViewModel,
  type MyHomeActivityEventViewModel,
  type MyHomeAttentionItemViewModel,
  type MyHomeViewModel,
} from "@/lib/adapters/homeowner";
import { toWarrantyViewModel, type WarrantyTone, type WarrantyViewModel } from "@/lib/adapters/warranty";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

/** How many recent reports the My Home activity strip projects. */
export const MY_HOME_ACTIVITY_LIMIT = 4;

export interface MyHomeResult {
  status: AsyncStatus;
  home: MyHomeViewModel | null;
  attention: MyHomeAttentionItemViewModel[];
  activity: MyHomeActivityEventViewModel[];
  errorMessage: string | null;
  /** A promoted homeowner with no ACTIVE ownership row — a real, renderable state. */
  noActiveOwnership: boolean;
  reload: () => void;
}

function is404(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { httpStatus?: number }).httpStatus === 404;
}

export function useMyHome(): MyHomeResult {
  const home = useAsyncResource<MyHomeDto>(
    (signal) => backendHomeowners.getMyHome({ signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  /**
   * The homeowner's own recent reports. They feed BOTH the "ما يحتاج انتباهك"
   * cards and the activity strip — the Backend exposes no separate activity
   * feed, and inventing one would be inventing facts.
   */
  const reports = useAsyncResource(
    (signal) =>
      backendReports.list({ pageSize: MY_HOME_ACTIVITY_LIMIT, page: 1 }, { signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  if (DEMO_MODE) {
    return {
      status: "idle",
      home: null,
      attention: [],
      activity: [],
      errorMessage: null,
      noActiveOwnership: false,
      reload: () => {},
    };
  }

  const viewModel = home.data ? toMyHomeViewModel(home.data) : null;
  const reportItems = reports.data?.items ?? [];

  return {
    status: home.status,
    home: viewModel,
    attention: viewModel ? toAttentionItems(viewModel, reportItems) : [],
    activity: toActivityEvents(reportItems),
    errorMessage: home.errorMessage,
    noActiveOwnership: home.status === "error" && is404(home.error),
    reload: () => {
      home.reload();
      reports.reload();
    },
  };
}

export interface WarrantyResult {
  status: AsyncStatus;
  warranty: WarrantyViewModel | null;
  errorMessage: string | null;
  reload: () => void;
}

/**
 * `GET /api/warranty?unitId=`.
 *
 * `staticTones` is the frozen screen's own editorial classification of each
 * card (long coverage reads "مشمول", a deliberately short one reads "تغطية
 * محددة"). The SERVER decides whether a category is still covered; that
 * classification only survives while it is.
 */
export function useWarranty(
  unitId: string | null,
  staticTones: Record<string, WarrantyTone>,
): WarrantyResult {
  const resource = useAsyncResource(
    (signal) => backendWarranty.getByUnit(unitId as string, { signal }),
    [unitId],
    { enabled: !DEMO_MODE && !!unitId },
  );

  if (DEMO_MODE) {
    return { status: "idle", warranty: null, errorMessage: null, reload: () => {} };
  }

  return {
    status: resource.status,
    warranty: resource.data ? toWarrantyViewModel(resource.data, staticTones) : null,
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}
