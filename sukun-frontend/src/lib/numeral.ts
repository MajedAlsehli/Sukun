/**
 * Arabic-Indic digit normalizer + numeral policy helper.
 * 15_Frontend_Tasks.md §0.4/§0.6: KPIs/counters render in Latin numerals,
 * prose renders in Arabic-Indic numerals — this is the one place that
 * conversion happens, so no component hand-rolls it.
 */

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const LATIN_DIGITS = "0123456789";

/** Arabic-Indic digits anywhere in `value` → Latin digits, then parsed as a float. `toNum("١.٨ يوم") === 1.8`. */
export function toNum(value: string): number {
  const latinized = value.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
  return Number.parseFloat(latinized);
}

/** Latin digits in `value` → Arabic-Indic digits (for embedding a number inside Arabic prose). */
export function toArabicIndic(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_INDIC_DIGITS[LATIN_DIGITS.indexOf(digit)] ?? digit);
}

export type NumberStyle = "prose" | "counter";

/** `formatNumber(value, style)` — counters/KPIs stay Latin; prose renders Arabic-Indic. */
export function formatNumber(value: number, style: NumberStyle): string {
  const latin = value.toLocaleString("en-US");
  return style === "counter" ? latin : toArabicIndic(latin);
}
