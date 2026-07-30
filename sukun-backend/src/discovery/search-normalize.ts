// Task 6 (decisions.md G15): a small, bounded normalization - digits and the
// most common Arabic letter variants - not a full-text search index or a
// claim of complete Arabic NLP normalization. Used to build a second OR
// clause alongside the raw query, not to rewrite stored data.

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

const ARABIC_LETTER_VARIANTS: Record<string, string> = {
  أ: 'ا', إ: 'ا', آ: 'ا',
  ى: 'ي',
  ة: 'ه',
};

export function normalizeArabicSearch(input: string): string {
  return input
    .split('')
    .map((ch) => ARABIC_INDIC_DIGITS[ch] ?? ARABIC_LETTER_VARIANTS[ch] ?? ch)
    .join('');
}
