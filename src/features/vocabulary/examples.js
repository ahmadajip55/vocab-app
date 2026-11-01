import { cleanText } from '../../lib/text.js';
import { getLanguage, normalizeLanguageCode } from '../../languages/index.js';

/**
 * Example sentences written in the *word* language, for flashcards.
 *
 * Source 1: Tatoeba (free, no key) - real sentences by native speakers, with a
 *           translation into the meaning language when one exists.
 * Source 2: dictionaryapi.dev (free, no key) - English only.
 */

export const TATOEBA_URL = 'https://tatoeba.org/en/api_v0/search';
export const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

const MIN_LENGTH = 8;
const MAX_LENGTH = 90;
const IDEAL_LENGTH = 40;

/** "reluctant, hesitant" -> "reluctant"; "take (off)" -> "take". */
export function primaryTerm(term) {
  return cleanText(term).split(/[,;、；/（(]/)[0].trim();
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isCjk = (value) => /[぀-ヿ㐀-䶿一-鿿]/.test(value);

function containsTerm(sentence, term) {
  if (isCjk(term)) return sentence.includes(term);
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}($|[^\\p{L}])`, 'iu').test(sentence);
}

function flattenTranslations(translations) {
  return (Array.isArray(translations) ? translations.flat(2) : []).filter((item) => item && typeof item.text === 'string');
}

/**
 * The best sentences from a Tatoeba response, best first: ones that contain the
 * word (not just a longer word like "makanan" for "makan"), have a translation
 * and a comfortable length. Pure, so it is easy to test.
 */
export function pickTatoebaExamples(payload, term, { from, to, limit = 3 } = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const scored = [];
  const seen = new Set();

  for (const item of results) {
    const sentence = cleanText(item?.text);
    if (!sentence || seen.has(sentence) || (from && item.lang && item.lang !== from)) continue;
    if (sentence.length < MIN_LENGTH && !isCjk(sentence)) continue;
    if (sentence.length > MAX_LENGTH) continue;
    seen.add(sentence);

    const translation = flattenTranslations(item.translations).find((t) => !to || t.lang === to)?.text ?? '';
    const hasTerm = containsTerm(sentence, term);
    let score = 0;
    if (hasTerm) score += 10;
    if (translation) score += 3;
    score -= Math.abs(sentence.length - IDEAL_LENGTH) / 100;
    scored.push({ score, hasTerm, sentence, translation: cleanText(translation) });
  }

  scored.sort((a, b) => b.score - a.score);
  // Sentences that really use the word come first; others only when there are none.
  const withTerm = scored.filter((item) => item.hasTerm);
  return (withTerm.length ? withTerm : scored)
    .slice(0, limit)
    .map(({ sentence, translation }) => ({ sentence, translation }));
}

/** Tatoeba search; with `onlyTranslated`, only sentences that have a translation into the meaning language. */
async function searchTatoeba(term, language, meaningLanguage, { fetchImpl, signal }, { limit, onlyTranslated }) {
  const to = meaningLanguage.tatoeba;
  const url = new URL(TATOEBA_URL);
  const params = { from: language.tatoeba, query: term, orphans: 'no', unapproved: 'no' };
  if (onlyTranslated) params.to = to;
  url.search = new URLSearchParams(params).toString();

  const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Tatoeba ${response.status}`);
  return pickTatoebaExamples(await response.json(), term, { from: language.tatoeba, to, limit }).map((item) => ({
    ...item,
    source: 'tatoeba',
  }));
}

async function englishDictionaryExamples(term, { fetchImpl, signal }, limit) {
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(term)) return [];
  const response = await fetchImpl(`${DICTIONARY_API_URL}${encodeURIComponent(term.toLowerCase())}`, { signal });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`dictionaryapi.dev ${response.status}`);

  const found = [];
  const entries = await response.json();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const meaning of entry.meanings ?? []) {
      for (const definition of meaning.definitions ?? []) {
        const sentence = cleanText(definition.example);
        if (sentence && !found.some((item) => item.sentence === sentence)) {
          found.push({ sentence, translation: '', source: 'dictionary' });
          if (found.length >= limit) return found;
        }
      }
    }
  }
  return found;
}

/**
 * Up to `limit` (3) example sentences for `term`, written in `sourceLanguage`,
 * best first: [{ sentence, translation, source }]. `translation` is in
 * `targetLanguage` when Tatoeba has one, otherwise ''. Sentences with a human
 * translation are searched first; more are added without one when that is not
 * enough (English also tries dictionaryapi.dev). Resolves to [] when nothing is
 * found; rejects only when every source failed to answer.
 */
export async function findExamples(term, options = {}) {
  const value = primaryTerm(term);
  const limit = options.limit ?? 3;
  if (!value) return [];

  const language = getLanguage(normalizeLanguageCode(options.sourceLanguage, 'en'));
  const meaningLanguage = getLanguage(normalizeLanguageCode(options.targetLanguage, 'id'));
  const request = { fetchImpl: options.fetchImpl ?? globalThis.fetch, signal: options.signal };

  const sources = [
    () => searchTatoeba(value, language, meaningLanguage, request, { limit, onlyTranslated: true }),
    () => searchTatoeba(value, language, meaningLanguage, request, { limit, onlyTranslated: false }),
  ];
  if (language.code === 'en') sources.push(() => englishDictionaryExamples(value, request, limit));

  const found = [];
  let failures = 0;
  for (const source of sources) {
    if (found.length >= limit) break;
    try {
      for (const item of await source()) {
        if (found.length < limit && !found.some((existing) => existing.sentence === item.sentence)) found.push(item);
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      failures += 1;
    }
  }
  if (found.length === 0 && failures === sources.length) {
    throw new Error('Contoh kalimat tidak bisa dimuat (periksa koneksi internet).');
  }
  return found;
}
