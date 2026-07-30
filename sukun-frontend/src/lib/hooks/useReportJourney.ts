"use client";

/**
 * H8's submit step — `POST /api/reports`.
 *
 * The analysis half of the journey already goes through `lib/ai/client.ts`
 * (which is `liveAi` outside Demo Mode), so this hook owns only the final
 * creation call and the two facts it has to reconcile:
 *
 *  1. **The report must carry the SAME media keys the analysis ran over.** The
 *     Backend enforces it (`ANALYSIS_MEDIA_MISMATCH`) and it is what makes an
 *     `analysisId` trustworthy. `lib/ai/live.ts` remembers the keys per
 *     analysis id; they are read back here rather than being threaded through
 *     the frozen `DefectAnalysis` shape.
 *  2. **A manually-entered report is a real, first-class path.** When the
 *     analysis was unavailable or the resident corrected the category, the
 *     report is created WITHOUT an `analysisId`, and the Backend applies its
 *     own documented `MANUAL_DEFAULT` priority. Nothing pretends an AI
 *     contributed when it did not.
 *
 * `location` deserves a note: the canonical report model has no location field
 * (H8's own editor offers one; `createReportSchema` does not). Rather than drop
 * what the resident typed, it is appended to the report's own free-text note
 * under the screen's existing label. That is the resident's text going into a
 * free-text field — not a fabricated wire format.
 */

import { useCallback, useState } from "react";
import { DEMO_MODE } from "@/lib/demo/config";
import { arabicMessageFor } from "@/lib/backend/errors";
import { backendReports, type ReportCategoryDto } from "@/lib/backend/reports";
import { CATEGORY_VALUES } from "@/lib/adapters/reports";
import { forgetStagedKeys, stagedKeysFor } from "@/lib/ai/live";

export interface SubmitReportInput {
  /** The analysis this report cites, or `null` for the manual-entry path. */
  analysisId: string | null;
  /** The Arabic category the resident confirmed or corrected. */
  categoryLabel: string;
  /** The problem description shown on the review step. */
  summary: string;
  /** The resident's optional free-text note. */
  note: string;
  /** H8's optional in-unit location. Folded into the note; see the file header. */
  location: string;
  /** `false` when the resident changed the AI's category — recorded for the audit trail. */
  categoryConfirmedByUser: boolean;
}

export interface SubmitReportResult {
  submitting: boolean;
  errorMessage: string | null;
  /** The real `reportNumber` the Backend assigned, e.g. "#2432". */
  reportNumber: string | null;
  reportId: string | null;
  submit: (input: SubmitReportInput) => Promise<boolean>;
}

/** The screen's own label, so the appended line reads like the rest of the report. */
export const LOCATION_NOTE_LABEL = "الموقع";

export function composeNote(note: string, location: string): string | undefined {
  const parts: string[] = [];
  if (note.trim()) parts.push(note.trim());
  if (location.trim()) parts.push(`${LOCATION_NOTE_LABEL}: ${location.trim()}`);
  const combined = parts.join("\n");
  // `createReportSchema` caps the note at 1000 characters.
  return combined ? combined.slice(0, 1000) : undefined;
}

export function useSubmitReport(): SubmitReportResult {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportNumber, setReportNumber] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const submit = useCallback(async (input: SubmitReportInput): Promise<boolean> => {
    // Demo Mode keeps the approved local behaviour: no request, no real report.
    if (DEMO_MODE) return true;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const mediaKeys = input.analysisId ? stagedKeysFor(input.analysisId) : undefined;
      if (!mediaKeys || mediaKeys.length === 0) {
        // Without staged keys there is nothing to attach, and the Backend
        // requires at least one photo. Saying so is better than sending a
        // request that is certain to 400.
        setErrorMessage("تعذّر إرفاق الصور. أعد رفع الصورة ثم حاول مرة أخرى.");
        return false;
      }

      const category = (CATEGORY_VALUES[input.categoryLabel] ?? "OTHER") as ReportCategoryDto;
      const created = await backendReports.create({
        mediaKeys,
        category,
        problemText: input.summary.trim().slice(0, 400),
        note: composeNote(input.note, input.location),
        analysisId: input.analysisId ?? undefined,
        categoryConfirmedByUser: input.categoryConfirmedByUser,
      });

      if (input.analysisId) forgetStagedKeys(input.analysisId);
      setReportId(created.id);
      setReportNumber(`#${created.reportNumber}`);
      return true;
    } catch (err) {
      setErrorMessage(arabicMessageFor(err));
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, errorMessage, reportNumber, reportId, submit };
}
