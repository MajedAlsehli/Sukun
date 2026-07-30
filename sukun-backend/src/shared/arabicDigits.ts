const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

// RE3's unit-number search must match regardless of which digit script the
// user typed in (Arabic-Indic vs Latin) - normalize incoming search input to
// Latin digits before querying, since unit numbers are always stored as Latin
// digits (project.service.ts#generateUnitNumber).
export function normalizeToLatinDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
}
