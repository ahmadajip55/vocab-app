import { exactKanjiFallback } from './fallbackDictionary.js';
import { fetchGoogleCandidates } from './ime.js';

const HIRAGANA_ONLY_RE = /^[぀-ゟー]+$/;
const KANJI_RE = /[㐀-䶿一-鿿]/;

export function isHiraganaOnly(text) {
  return HIRAGANA_ONLY_RE.test(String(text ?? ''));
}

/**
 * Kanji spelling of a hiragana word, from Google Input Tools (offline: the
 * built-in dictionary, exact readings only). '' when there is none.
 *
 * mode 'top' (default) follows how the word is normally written: it only uses
 * the first candidate, and only when that is kanji, so する stays する
 * (not 擦る) while ねこ becomes 猫.
 * mode 'any' takes the first kanji candidate at all; it is meant for finding a
 * meaning, where any common spelling helps (ひだり -> 左).
 */
export async function kanjiSpelling(kana, { fetchImpl = globalThis.fetch, mode = 'top', signal } = {}) {
  if (!isHiraganaOnly(kana)) return '';
  let candidates = [];
  try {
    // This Input Tools code reads hiragana (romaji only comes back unchanged).
    candidates = await fetchGoogleCandidates(kana, { fetchImpl, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    candidates = [];
  }
  if (candidates.length === 0) return exactKanjiFallback(kana);
  if (mode === 'any') return candidates.find((candidate) => KANJI_RE.test(candidate)) ?? exactKanjiFallback(kana);
  return KANJI_RE.test(candidates[0]) ? candidates[0] : '';
}

/**
 * Kanji spellings for many words at once (mode 'top'), a few requests at a
 * time. Resolves to one entry per word: the kanji spelling, or '' to keep it.
 * onProgress(done, total) runs as words finish.
 */
export async function spellWithKanji(words, { fetchImpl, onProgress, concurrency = 4 } = {}) {
  const result = words.map(() => '');
  const todo = words.map((word, index) => ({ word, index })).filter(({ word }) => isHiraganaOnly(word));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < todo.length) {
      const { word, index } = todo[next++];
      result[index] = await kanjiSpelling(word, { fetchImpl });
      done += 1;
      onProgress?.(done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return result;
}
