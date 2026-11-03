import { toHiragana, toKatakana } from 'wanakana';
import { exactKanjiFallback, lookupKanjiFallback, readingsOfWritten } from './fallbackDictionary.js';
import { fetchGoogleCandidates } from './ime.js';
import { fetchRomaji, isKanaOnly } from './romaji.js';

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

const MAX_SUGGESTIONS = 8;
const unique = (list) => [...new Set(list.filter(Boolean))];

/**
 * Kanji spellings to suggest for a kana reading (べんきょう -> 勉強, 便橋, ...):
 * Google Input Tools first, then the built-in dictionary. Katakana is read as
 * hiragana. Never rejects because of the network.
 */
export async function kanjiCandidates(kana, { fetchImpl = globalThis.fetch, signal } = {}) {
  const hiragana = toHiragana(String(kana ?? '').trim());
  if (!isHiraganaOnly(hiragana)) return [];
  let online = [];
  try {
    online = await fetchGoogleCandidates(hiragana, { fetchImpl, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
  }
  const withKanji = [...online, ...lookupKanjiFallback(hiragana)].filter((candidate) => KANJI_RE.test(candidate));
  return unique(withKanji).slice(0, MAX_SUGGESTIONS);
}

/**
 * Kana readings to suggest for a written word (勉強 -> べんきょう, ベンキョウ):
 * the built-in dictionary, then Google's romanization, each in hiragana and katakana.
 * A word written in kana suggests itself in both scripts. Never rejects because of the network.
 */
export async function readingCandidates(written, { fetchImpl = globalThis.fetch, signal } = {}) {
  const text = String(written ?? '').trim();
  if (!text) return [];
  // ー stays a long-vowel mark (コーヒー -> こーひー), so the katakana comes back unchanged.
  const readings = isKanaOnly(text) ? [toHiragana(text, { convertLongVowelMark: false })] : readingsOfWritten(text);
  if (!isKanaOnly(text)) {
    try {
      const hiragana = toHiragana((await fetchRomaji(text, { fetchImpl, signal })).replace(/\s+/g, ''));
      if (isHiraganaOnly(hiragana)) readings.push(hiragana);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }
  return unique(readings.flatMap((reading) => [reading, toKatakana(reading)])).slice(0, MAX_SUGGESTIONS);
}
