/**
 * My Home (H7): `MyHomeDto` -> the exact visual model `MyHomeScreen` renders.
 *
 *   MyHomeDto              (lib/backend/homeowners.ts)
 *     -> MyHomeViewModel   (this file)
 *     -> unchanged MyHomeScreen
 *
 * The frozen screen renders five blocks: the project cover card, the unit
 * facts, the warranty chip, "ما يحتاج انتباهك", and the activity timeline. This
 * adapter fills exactly those, and NOTHING MORE — the Backend has no field for
 * a fact, the view model says so and the screen shows its existing placeholder.
 *
 * Specifically NOT invented here:
 *   * a cover photo when `coverImage.url` is null (the screen's own
 *     `ImageSlotPlaceholder` already handles an absent `src`);
 *   * a warranty state when `warranty` is null;
 *   * an activity feed — the Backend exposes no activity endpoint for a
 *     homeowner, so the timeline is projected from the homeowner's own real
 *     canonical reports and is empty when they have none.
 */

import type { MyHomeDto } from "@/lib/backend/homeowners";
import type { ReportSummaryDto } from "@/lib/backend/reports";

/** The chip copy the frozen header renders. `active` reproduces the approved string. */
export type WarrantyChipState = "active" | "expired" | "absent";

export interface MyHomeWarrantyChipViewModel {
  state: WarrantyChipState;
  label: string;
  chipBg: string;
  chipColor: string;
  dot: string;
  daysRemaining: number | null;
  endDate: string | null;
}

export interface MyHomeAttentionItemViewModel {
  kind: "REPORT_AWAITING_APPROVAL" | "WARRANTY_ENDING";
  title: string;
  sub: string;
  /** Where the existing card navigates to. */
  target: "reports" | "warranty";
  /** Present for a report item, so the card can deep-link to that report. */
  reportId?: string;
}

export interface MyHomeActivityEventViewModel {
  when: string;
  text: string;
  ok: boolean;
}

export interface MyHomeViewModel {
  ownershipId: string;
  unit: {
    id: string;
    project: string;
    dev: string;
    number: string;
    city: string;
    floor: number;
    type: string;
    area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    parkingSpots: number | null;
  };
  building: { id: string; name: string; number: string };
  projectId: string;
  handoverDate: string;
  /** `null` = the Backend reported no cover media. Never a stand-in URL. */
  coverImageUrl: string | null;
  warranty: MyHomeWarrantyChipViewModel;
  reports: { available: boolean; openCount: number };
}

/**
 * Reproduces the approved chip verbatim for the active case. The other two
 * states exist only in real mode (a demo homeowner is always in warranty), so
 * they add copy without ever changing an approved rendering.
 */
export function toWarrantyChip(dto: MyHomeDto): MyHomeWarrantyChipViewModel {
  if (!dto.warranty) {
    return {
      state: "absent",
      label: "لا يوجد ضمان مسجّل",
      chipBg: "rgba(var(--t-on-dark-rgb), .1)",
      chipColor: "var(--t-on-dark-soft)",
      dot: "var(--t-tertiary)",
      daysRemaining: null,
      endDate: null,
    };
  }
  if (!dto.warranty.isActive) {
    return {
      state: "expired",
      label: "انتهى الضمان",
      chipBg: "var(--warn-bg)",
      chipColor: "var(--warn-strong)",
      dot: "var(--warn)",
      daysRemaining: null,
      endDate: dto.warranty.endDate,
    };
  }
  return {
    state: "active",
    // The approved string, byte-for-byte.
    label: "الضمان ساري",
    chipBg: "rgba(47,158,106,.18)",
    chipColor: "var(--ok-on-dark)",
    dot: "var(--ok)",
    daysRemaining: dto.warranty.daysRemaining,
    endDate: dto.warranty.endDate,
  };
}

export function toMyHomeViewModel(dto: MyHomeDto): MyHomeViewModel {
  return {
    ownershipId: dto.ownershipId,
    unit: {
      id: dto.unit.id,
      project: dto.project.name,
      dev: dto.project.developerName,
      number: dto.unit.number,
      city: dto.project.city,
      floor: dto.unit.floor,
      type: dto.unit.type,
      area: dto.unit.area,
      bedrooms: dto.unit.bedrooms,
      bathrooms: dto.unit.bathrooms,
      parkingSpots: dto.unit.parkingSpots,
    },
    building: dto.building,
    projectId: dto.project.id,
    handoverDate: dto.handoverDate,
    coverImageUrl: dto.coverImage.url,
    warranty: toWarrantyChip(dto),
    reports: {
      available: dto.reportsSummary.available,
      openCount: dto.reportsSummary.openCount,
    },
  };
}

/** Below this many days the frozen "الضمان ينتهي خلال 30 يوماً" card appears. */
export const WARRANTY_ENDING_SOON_DAYS = 30;

/**
 * The two attention cards, derived from real state only. An empty array is a
 * legitimate result — the section simply renders no rows and its counter reads
 * `0`, which is the existing visual language, not an error.
 */
export function toAttentionItems(
  home: MyHomeViewModel,
  reports: ReportSummaryDto[],
): MyHomeAttentionItemViewModel[] {
  const items: MyHomeAttentionItemViewModel[] = [];

  const awaiting = reports.filter((r) => r.statusGroup === "AWAITING_APPROVAL");
  if (awaiting.length > 0) {
    const first = awaiting[0];
    items.push({
      kind: "REPORT_AWAITING_APPROVAL",
      title:
        awaiting.length === 1
          ? "يوجد بلاغ بانتظار ردك"
          : `يوجد ${awaiting.length} بلاغات بانتظار ردك`,
      sub: `بلاغ #${first.reportNumber} — ${first.problemText}`,
      target: "reports",
      reportId: first.id,
    });
  }

  const days = home.warranty.daysRemaining;
  if (home.warranty.state === "active" && days != null && days <= WARRANTY_ENDING_SOON_DAYS) {
    items.push({
      kind: "WARRANTY_ENDING",
      title: `الضمان ينتهي خلال ${days} يوماً`,
      sub: "ننصح بمراجعة بنود التغطية قبل الانتهاء",
      target: "warranty",
    });
  }

  return items;
}

/** Arabic relative-time copy in the same register the approved timeline uses. */
export function relativeArabicDay(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "اليوم";
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  // Arabic has a dual form: two days is "يومين", not "٢ أيام". The report
  // adapter's own `dateLabel` already reads this way; both must agree.
  if (days === 2) return "قبل يومين";
  if (days < 7) return `قبل ${days} أيام`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "قبل أسبوع";
  if (weeks === 2) return "قبل أسبوعين";
  if (weeks < 5) return `قبل ${weeks} أسابيع`;
  const months = Math.floor(days / 30);
  if (months === 1) return "قبل شهر";
  if (months === 2) return "قبل شهرين";
  return `قبل ${months} أشهر`;
}

/**
 * Projects the homeowner's own real reports into the timeline rows the frozen
 * card renders. Each row states a fact the Backend actually reported — the
 * report's status and its own problem text — and nothing else.
 */
export function toActivityEvents(
  reports: ReportSummaryDto[],
  now: Date = new Date(),
): MyHomeActivityEventViewModel[] {
  return reports.map((r) => ({
    when: relativeArabicDay(r.closedAt ?? r.updatedAt ?? r.createdAt, now),
    text: activityTextFor(r),
    ok: r.statusGroup === "CLOSED",
  }));
}

function activityTextFor(r: ReportSummaryDto): string {
  switch (r.statusGroup) {
    case "CLOSED":
      return `تم إغلاق البلاغ #${r.reportNumber} — ${r.problemText}`;
    case "AWAITING_APPROVAL":
      return `البلاغ #${r.reportNumber} بانتظار اعتمادك — ${r.problemText}`;
    case "IN_PROGRESS":
      return `جارٍ إصلاح البلاغ #${r.reportNumber} — ${r.problemText}`;
    default:
      return `تم استلام البلاغ #${r.reportNumber} — ${r.problemText}`;
  }
}
