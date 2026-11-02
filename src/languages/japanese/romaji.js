import { toHiragana, toRomaji } from 'wanakana';

/**
 * Romaji for Japanese words, shown next to the word in the word list.
 *
 * Kana converts directly (wanakana). Kanji needs its reading, which comes from
 * where the word was made: the reading typed in the romaji input method, the
 * JLPT word list, or, as a last resort, Google Translate's romanization.
 * Everything is written in the same wapuro style as wanakana: とうきょう -> toukyou.
 */

const KANA_ONLY_RE = /^[぀-ヿー・\s]+$/;
const LATIN_ONLY_RE = /^[a-z\s'-]+$/;

export function isKanaOnly(text) {
  return KANA_ONLY_RE.test(String(text ?? '').trim());
}

/** Kana -> romaji, or '' when the text still contains kanji (or is empty). */
export function kanaToRomaji(text) {
  const value = String(text ?? '').trim();
  if (!isKanaOnly(value)) return '';
  const romaji = toRomaji(value).toLowerCase();
  return LATIN_ONLY_RE.test(romaji) ? romaji : '';
}

/** Hepburn "Tōkyō" (as Google writes it) -> wapuro "toukyou". */
export function normalizeRomaji(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/ā|â/g, 'aa')
    .replace(/ī|î/g, 'ii')
    .replace(/ū|û/g, 'uu')
    .replace(/ē|ê/g, 'ee')
    .replace(/ō|ô/g, 'ou')
    .replace(/[^a-z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The romaji to show for a word: the saved one, or one worked out from kana. */
export function romajiForWord(word) {
  if (word?.wordLanguage !== 'ja') return '';
  return word.romaji || kanaToRomaji(word.term);
}

/**
 * How to read a Japanese word, for flashcards and the quiz: { kana, romaji }.
 * `kana` is the hiragana reading of a word with kanji (右 -> みぎ) and '' for a
 * word already written in kana; `romaji` is '' until it is known.
 * Returns null for other languages.
 */
export function japaneseReading(word) {
  if (word?.wordLanguage !== 'ja') return null;
  const romaji = romajiForWord(word);
  let kana = '';
  // A hyphen is not part of this romaji style (it comes from Google, e.g. "ichi-ri"),
  // and wanakana would read it as a long-vowel mark, so no kana is guessed from it.
  if (romaji && !isKanaOnly(word.term) && !romaji.includes('-')) {
    const hiragana = toHiragana(romaji.replace(/\s+/g, ''));
    kana = isKanaOnly(hiragana) ? hiragana : '';
  }
  return { kana, romaji };
}

/** True when a Japanese word has kanji and no saved romaji yet, so it must be looked up. */
export function needsRomajiLookup(word) {
  return word?.wordLanguage === 'ja' && !romajiForWord(word);
}

/**
 * Track the reading while typing with the romaji input method. `readings` maps
 * text in the field -> its romaji. When the trailing romaji run of `before` is
 * replaced (by a chosen candidate or by kana on blur), the new text's reading
 * is the reading of the untouched prefix plus the romaji that was typed.
 */
export function extendReadings(readings, prefix, romajiTyped, nextText) {
  const prefixReading = prefix ? (readings[prefix] ?? kanaToRomaji(prefix)) : '';
  if (prefix && !prefixReading) return readings; // prefix was edited by hand: reading unknown
  return { ...readings, [nextText]: `${prefixReading}${romajiTyped.toLowerCase()}` };
}

const GOOGLE_ROMANIZE_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * Romanization from Google Translate for one word (`dt=rm`). It is only used
 * when no better reading exists; readings of kanji can occasionally be off.
 */
export async function fetchRomaji(term, { fetchImpl = globalThis.fetch, signal } = {}) {
  const endpoint = new URL(GOOGLE_ROMANIZE_URL);
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'ja');
  endpoint.searchParams.set('tl', 'en');
  endpoint.searchParams.append('dt', 'rm');
  endpoint.searchParams.set('q', String(term ?? '').trim());
  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`Google Translate responded with HTTP ${response.status}.`);
  const payload = await response.json();
  const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
  const raw = segments.map((segment) => (Array.isArray(segment) && typeof segment[3] === 'string' ? segment[3] : '')).join(' ');
  return normalizeRomaji(raw);
}
