import { toHiragana, toKana, toKatakana } from 'wanakana';
import { lookupKanjiFallback } from './fallbackDictionary.js';

/**
 * Romaji input method for Japanese ("IME" behaviour in a plain text input).
 *
 * The text field holds whatever the user typed. The trailing run of Latin
 * letters is the "composition": it is shown as live kana and offered as a list
 * of candidates (kanji, hiragana, katakana) that replaces the run when chosen.
 *
 * Candidates come from Google Input Tools (free, no API key). If it cannot be
 * reached, a small offline dictionary plus kana conversion keeps it working.
 */

export const GOOGLE_INPUT_TOOLS_URL = 'https://inputtools.google.com/request';
export const MAX_CANDIDATES = 9;

const COMPOSITION_RE = /[A-Za-z][A-Za-z'-]*$/;
const ALL_KANA_RE = /^[぀-ヿー]+$/;

/** The trailing romaji run being typed, or null. */
export function getComposition(text) {
  const match = COMPOSITION_RE.exec(String(text ?? ''));
  return match ? { start: match.index, romaji: match[0] } : null;
}

/** Live preview while typing: trailing "n" stays "n" until the next letter. */
export function previewKana(romaji) {
  return toKana(String(romaji ?? '').toLowerCase(), { IMEMode: true });
}

/** Final hiragana for a romaji run, or '' if some letters cannot be converted. */
export function toKanaIfComplete(romaji) {
  const hiragana = toHiragana(String(romaji ?? '').toLowerCase());
  return ALL_KANA_RE.test(hiragana) ? hiragana : '';
}

/** Replace the composition at the end of `text` with the chosen candidate. */
export function applyCandidate(text, composition, candidate) {
  return String(text).slice(0, composition.start) + candidate;
}

/** Convert every romaji run that is fully convertible (used on blur and save). */
export function commitRomaji(text) {
  return String(text ?? '').replace(/[A-Za-z][A-Za-z'-]*/g, (run) => toKanaIfComplete(run) || run);
}

export function parseGoogleCandidates(payload) {
  if (!Array.isArray(payload) || payload[0] !== 'SUCCESS') return [];
  const list = payload[1]?.[0]?.[1];
  return Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item) : [];
}

export async function fetchGoogleCandidates(romaji, { fetchImpl = globalThis.fetch, signal } = {}) {
  const url = new URL(GOOGLE_INPUT_TOOLS_URL);
  url.search = new URLSearchParams({
    text: romaji,
    itc: 'ja-t-ja-hira-i0-und',
    num: '10',
    cp: '0',
    cs: '1',
    ie: 'utf-8',
    oe: 'utf-8',
    app: 'demopage',
  }).toString();

  const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Google Input Tools ${response.status}`);
  return parseGoogleCandidates(await response.json());
}

/** Merge online results with offline ones into one ordered, de-duplicated list. */
export function buildCandidates(romaji, remote = []) {
  const lower = String(romaji ?? '').toLowerCase();
  const hiragana = toKanaIfComplete(lower);
  const list = [...remote];

  if (hiragana) {
    list.push(...lookupKanjiFallback(hiragana), hiragana, toKatakana(lower));
  }

  return [...new Set(list.filter(Boolean))].slice(0, MAX_CANDIDATES);
}

/**
 * Candidate source with a small cache. `fetchImpl` can be replaced in tests.
 * `get` resolves to { candidates, source } and never rejects because of the network.
 */
export function createCandidateService({ fetchImpl } = {}) {
  const cache = new Map();

  return {
    local: (romaji) => buildCandidates(romaji, []),
    async get(romaji, signal) {
      const key = romaji.toLowerCase();
      if (cache.has(key)) return { candidates: buildCandidates(key, cache.get(key)), source: 'google' };
      try {
        const remote = await fetchGoogleCandidates(key, { fetchImpl, signal });
        if (remote.length) {
          cache.set(key, remote);
          return { candidates: buildCandidates(key, remote), source: 'google' };
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
      }
      return { candidates: buildCandidates(key, []), source: 'local' };
    },
  };
}
