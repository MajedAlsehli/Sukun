/**
 * Warranty (H10): `WarrantyDto` -> the exact card/topic model
 * `WarrantyCenterScreen` renders.
 *
 *   WarrantyDto              (lib/backend/warranty.ts)
 *     -> WarrantyViewModel   (this file)
 *     -> unchanged WarrantyCenterScreen
 *
 * **Nothing here recomputes a warranty rule.** Every duration, period end,
 * remaining-day count and reason code arrives already evaluated by
 * `sakn-backend/src/warranty/warranty.rules.ts` against server time. This file
 * only:
 *
 *   1. joins each server category onto the screen's existing card by key;
 *   2. formats `durationMonths` into the screen's own Arabic period phrasing;
 *   3. picks which of the three EXISTING tones/статuses the card shows.
 *
 * The six card ids, their titles, descriptions, covered/not-covered example
 * lists and notes are the approved screen's own editorial copy and are left
 * exactly where they are. What the Backend owns is *state*, not *copy*.
 */

import type {
  WarrantyCategoryKey,
  WarrantyCategoryStateDto,
  WarrantyDto,
  WarrantyReasonCode,
} from "@/lib/backend/warranty";

/** The screen's six card ids, in its own rendered order, joined to the Backend keys. */
export const CARD_ID_TO_CATEGORY_KEY: Record<string, WarrantyCategoryKey> = {
  structure: "STRUCTURE",
  plumbing: "PLUMBING",
  electrical: "ELECTRICAL",
  doors: "DOORS_WINDOWS",
  paint: "PAINT_FINISHING",
  misuse: "MISUSE_EXCLUSION",
};

/** The three tones the approved screen already has. No fourth is introduced. */
export type WarrantyTone = "ok" | "warn" | "err";

export interface WarrantyCategoryViewModel {
  /** The screen's own card id. */
  id: string;
  key: WarrantyCategoryKey;
  tone: WarrantyTone;
  /** The approved period sentence, formatted from the server's `durationMonths`. */
  period: string;
  covered: boolean;
  excludedAlways: boolean;
  reasonCode: WarrantyReasonCode;
  daysRemaining: number | null;
  periodEndDate: string | null;
}

export interface WarrantyViewModel {
  unitId: string;
  isActive: boolean;
  /** The approved header chip copy. */
  statusLabel: string;
  /** "7 سنوات و4 أشهر" — formatted from the server's own `daysRemaining`. */
  remainingLabel: string;
  startDateLabel: string;
  endDateLabel: string;
  rulesVersion: string;
  categories: WarrantyCategoryViewModel[];
}

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** "12 مارس 2022" — the format the approved header already renders. */
export function formatWarrantyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The approved period phrasing, driven entirely by the server's number of
 * months. Because the Backend's durations were themselves derived from this
 * screen's reference `coverageDefs`, the same inputs produce the same strings
 * the fixtures show — but the SOURCE in real mode is the server, not a table
 * duplicated here.
 */
export function formatCoveragePeriod(durationMonths: number | null, excludedAlways: boolean): string {
  if (excludedAlways) return "غير مشمول";
  if (durationMonths == null) return "غير محدّدة";
  if (durationMonths % 12 === 0) {
    const years = durationMonths / 12;
    if (years === 1) return "سنة واحدة من تاريخ الاستلام";
    if (years === 2) return "سنتان من تاريخ الاستلام";
    return `${years} سنوات من تاريخ الاستلام`;
  }
  if (durationMonths === 1) return "شهر واحد من تاريخ الاستلام";
  if (durationMonths === 2) return "شهران من تاريخ الاستلام";
  return `${durationMonths} أشهر من تاريخ الاستلام`;
}

/** "7 سنوات و4 أشهر" from a server-computed day count. */
export function formatRemaining(daysRemaining: number | null): string {
  if (daysRemaining == null || daysRemaining <= 0) return "—";
  const years = Math.floor(daysRemaining / 365);
  const months = Math.floor((daysRemaining % 365) / 30);
  const yearPart =
    years === 0 ? "" : years === 1 ? "سنة واحدة" : years === 2 ? "سنتان" : `${years} سنوات`;
  const monthPart =
    months === 0 ? "" : months === 1 ? "شهر واحد" : months === 2 ? "شهران" : `${months} أشهر`;
  if (yearPart && monthPart) return `${yearPart} و${monthPart}`;
  if (yearPart) return yearPart;
  if (monthPart) return monthPart;
  return `${daysRemaining} يوماً`;
}

/**
 * Which of the screen's three existing tones a card shows.
 *
 * `staticTone` is the card's own editorial classification (a long coverage
 * reads "مشمول"; a deliberately short one reads "تغطية محددة"). It is kept
 * whenever the server says the category is still covered, because the Backend
 * has no opinion about that distinction. When the server says it is NOT covered
 * — excluded, expired or unconfigured — the honest state wins and the card
 * reads "غير مشمول".
 */
export function toneFor(state: WarrantyCategoryStateDto, staticTone: WarrantyTone): WarrantyTone {
  if (state.excludedAlways) return "err";
  if (!state.covered) return "err";
  return staticTone;
}

export function toWarrantyViewModel(
  dto: WarrantyDto,
  staticTones: Record<string, WarrantyTone>,
): WarrantyViewModel {
  const byKey = new Map<WarrantyCategoryKey, WarrantyCategoryStateDto>(
    dto.categories.map((c) => [c.key, c]),
  );

  const categories: WarrantyCategoryViewModel[] = Object.entries(CARD_ID_TO_CATEGORY_KEY)
    .map(([id, key]) => {
      const state = byKey.get(key);
      if (!state) return null;
      return {
        id,
        key,
        tone: toneFor(state, staticTones[id] ?? "ok"),
        period: formatCoveragePeriod(state.durationMonths, state.excludedAlways),
        covered: state.covered,
        excludedAlways: state.excludedAlways,
        reasonCode: state.reasonCode,
        daysRemaining: state.daysRemaining,
        periodEndDate: state.periodEndDate,
      } satisfies WarrantyCategoryViewModel;
    })
    .filter((c): c is WarrantyCategoryViewModel => c !== null);

  return {
    unitId: dto.unitId,
    isActive: dto.isActive,
    // The approved chip strings.
    statusLabel: dto.isActive ? "الضمان ساري" : "انتهى الضمان",
    remainingLabel: formatRemaining(dto.daysRemaining),
    startDateLabel: formatWarrantyDate(dto.startDate),
    endDateLabel: formatWarrantyDate(dto.endDate),
    rulesVersion: dto.rulesVersion,
    categories,
  };
}
