"use client";

/**
 * H5's data layer — the real visit lifecycle.
 *
 *   lib/backend/visits.ts -> lib/adapters/visits.ts -> THIS -> frozen screen
 *
 * Demo Mode keeps the approved local behaviour verbatim: the booking is read
 * from the `sakn_discovery_activity` localStorage record, the event log is
 * in-memory, and NO Backend call is made. Real mode loads the real visit, and
 * every action (`checkIn`/`checkOut`/`cancel`/`reschedule`/note/issue/feedback)
 * is a real request whose response replaces the local view model — the screen
 * never predicts a status the server did not return.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import {
  backendVisits,
  type CreateVisitFeedbackRequest,
  type CreateVisitIssueRequest,
  type CreateVisitNoteRequest,
  type RescheduleVisitRequest,
  type VisitDetailDto,
} from "@/lib/backend/visits";
import {
  toVisitListItemViewModel,
  toVisitViewModel,
  type VisitListItemViewModel,
  type VisitViewModel,
} from "@/lib/adapters/visits";
import { useAsyncResource, type AsyncStatus } from "./useAsyncResource";

export interface VisitResult {
  status: AsyncStatus;
  visit: VisitViewModel | null;
  errorMessage: string | null;
  /** The Backend hides a foreign visit's existence with a 404 rather than a 403. */
  notFound: boolean;
  reload: () => void;
  /** In-flight lifecycle action, so a control can disable itself honestly. */
  acting: boolean;
  actionError: string | null;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  cancel: () => Promise<void>;
  reschedule: (body: RescheduleVisitRequest) => Promise<void>;
  addNote: (body: CreateVisitNoteRequest) => Promise<void>;
  addIssue: (body: CreateVisitIssueRequest) => Promise<void>;
  submitFeedback: (body: CreateVisitFeedbackRequest) => Promise<void>;
}

function is404(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { httpStatus?: number }).httpStatus === 404
  );
}

export function useVisit(visitId: string): VisitResult {
  const resource = useAsyncResource<VisitDetailDto>(
    (signal) => backendVisits.getById(visitId, { signal }),
    [visitId],
    { enabled: !DEMO_MODE && !!visitId },
  );

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Every lifecycle action follows the same shape: run the real request, then
   * RE-READ the visit so notes/issues/feedback and the new status all come from
   * the server in one consistent snapshot. The mutation endpoints return the
   * base `VisitDto` (or a child row), not the joined detail the screen renders,
   * so refetching is the honest way to update — not patching a guess into place.
   */
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (DEMO_MODE) return;
      setActing(true);
      setActionError(null);
      try {
        await action();
        resource.reload();
      } catch (err) {
        setActionError(arabicMessageFor(err));
      } finally {
        setActing(false);
      }
    },
    [resource],
  );

  return {
    status: DEMO_MODE ? "idle" : resource.status,
    visit: resource.data ? toVisitViewModel(resource.data) : null,
    errorMessage: resource.errorMessage,
    notFound: resource.status === "error" && is404(resource.error),
    reload: resource.reload,
    acting,
    actionError,
    checkIn: () => run(() => backendVisits.checkIn(visitId)),
    checkOut: () => run(() => backendVisits.checkOut(visitId)),
    cancel: () => run(() => backendVisits.cancel(visitId)),
    reschedule: (body) => run(() => backendVisits.reschedule(visitId, body)),
    addNote: (body) => run(() => backendVisits.addNote(visitId, body)),
    addIssue: (body) => run(() => backendVisits.addIssue(visitId, body)),
    submitFeedback: (body) => run(() => backendVisits.submitFeedback(visitId, body)),
  };
}

export interface VisitListResult {
  status: AsyncStatus;
  visits: VisitListItemViewModel[];
  errorMessage: string | null;
  reload: () => void;
}

/** `GET /api/visits` — the caller's own visits only; H3's "زياراتي" tab. */
export function useVisits(): VisitListResult {
  const resource = useAsyncResource(
    (signal) => backendVisits.list({ signal }),
    [],
    { enabled: !DEMO_MODE },
  );

  return {
    status: DEMO_MODE ? "idle" : resource.status,
    visits: (resource.data ?? []).map(toVisitListItemViewModel),
    errorMessage: resource.errorMessage,
    reload: resource.reload,
  };
}

export interface BookVisitResult {
  booking: boolean;
  bookingError: string | null;
  /** Resolves to the real visit id on success, `null` on failure. */
  book: (input: { projectId: string; unitId: string; date: string; time: string }) => Promise<string | null>;
}

/** `POST /api/visits` — H4's booking panel. Demo Mode never reaches this. */
export function useBookVisit(): BookVisitResult {
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const book = useCallback(
    async (input: { projectId: string; unitId: string; date: string; time: string }) => {
      if (DEMO_MODE) return null;
      setBooking(true);
      setBookingError(null);
      try {
        const visit = await backendVisits.create(input);
        return visit.id;
      } catch (err) {
        setBookingError(arabicMessageFor(err));
        return null;
      } finally {
        setBooking(false);
      }
    },
    [],
  );

  return { booking, bookingError, book };
}
