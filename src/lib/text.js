/** Collapse runs of whitespace and trim. Used when storing user text. */
export function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower case, used before romaji turns into kana (upper-case romaji would become katakana). */
export function lowerText(value) {
  return cleanText(value).toLowerCase();
}

// A word starts at the beginning, or after a space, hyphen, slash, bracket or opening quote.
// Not after an apostrophe, so "it's" becomes "It's" (not "It'S").
const WORD_START_RE = /(^|[\s\-/([{"“‘«])(\p{L})/gu;

/**
 * Title Case while typing: every word starts with a capital, the rest is lower
 * case ("terima kasih" -> "Terima Kasih"). Spaces are left alone and the
 * length does not change, so the caret can stay where it is. Kana and kanji are unaffected.
 */
export function toTitleCase(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(WORD_START_RE, (_, before, letter) => before + letter.toUpperCase());
}

/** Words and meanings are kept in Title Case ("tumbuh subur" -> "Tumbuh Subur"). */
export function titleText(value) {
  return toTitleCase(cleanText(value));
}

/**
 * Normalise text for comparison: lowercase, strip accents and punctuation,
 * collapse spaces. "Café, au lait!" and "cafe au lait" compare equal.
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edit distance between two strings (insert, delete, substitute = 1). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
