import { kanjiSpelling } from '../../languages/japanese/kanji.js';
import { kanaToRomaji } from '../../languages/japanese/romaji.js';
import { cleanText, normalizeText, toTitleCase } from '../../lib/text.js';
import { normalizeLanguageCode } from '../../languages/index.js';

/**
 * Meaning lookup with free services that need no account and no API key:
 *   1. Google's dictionary endpoint (clients5.google.com, client=dict-chrome-ex):
 *      many words per request, each translated on its own
 *   2. Google Translate public endpoint (translate.googleapis.com, client=gtx)
 *   3. MyMemory (api.mymemory.translated.net)
 * Japanese words written only in hiragana are often not recognised (ひだり ->
 * "Hidari"), so they are also tried in their most common kanji spelling (左).
 */

const DEFAULT_TRANSLATE_URL = 'https://translate.googleapis.com';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const DICT_TRANSLATE_URL = 'https://clients5.google.com/translate_a/t';

export function getLookupLanguages(overrides = {}) {
  return {
    sourceLanguage: normalizeLanguageCode(overrides.sourceLanguage ?? overrides.wordLanguage ?? overrides.fromLanguage, 'en'),
    targetLanguage: normalizeLanguageCode(overrides.targetLanguage ?? overrides.meaningLanguage ?? overrides.toLanguage, 'id'),
  };
}

export function getAiMeaningConfig(overrides = {}) {
  const env = import.meta.env ?? {};
  return { baseUrl: overrides.baseUrl ?? env.VITE_GOOGLE_TRANSLATE_BASE_URL ?? DEFAULT_TRANSLATE_URL };
}

export function sanitizeAiMeaning(value) {
  return toTitleCase(
    String(value ?? '')
      .trim()
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^\s*Arti\s*[-:]\s*/i, '') // an "Arti: ..." label, not words like "Artikel"
      .replace(/\s*\[\d+\]\s*/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim(),
  );
}

/** Google's gtx payload is [[ [translated, original, ...], ... ], ...]. */
export function extractMeaningFromResponse(payload) {
  const segments = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : null;
  if (segments) {
    const text = segments
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
      .join('');
    if (text.trim()) return sanitizeAiMeaning(text);
  }
  if (typeof payload?.translatedText === 'string') return sanitizeAiMeaning(payload.translatedText);
  if (typeof payload?.responseData?.translatedText === 'string') return sanitizeAiMeaning(payload.responseData.translatedText);
  return '';
}

async function googleMeaning(value, sourceLanguage, targetLanguage, baseUrl, fetchImpl) {
  const endpoint = new URL('/translate_a/single', `${baseUrl.replace(/\/$/, '')}/`);
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', sourceLanguage);
  endpoint.searchParams.set('tl', targetLanguage);
  endpoint.searchParams.append('dt', 't');
  endpoint.searchParams.set('q', value);

  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Google Translate gagal merespons permintaan arti.');
  return extractMeaningFromResponse(await response.json());
}

async function myMemoryMeaning(value, sourceLanguage, targetLanguage, fetchImpl) {
  const endpoint = new URL(MYMEMORY_URL);
  endpoint.searchParams.set('q', value);
  endpoint.searchParams.set('langpair', `${sourceLanguage}|${targetLanguage}`);

  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('MyMemory gagal merespons permintaan arti.');
  return extractMeaningFromResponse(await response.json());
}

/**
 * Many words in one request, each translated on its own (no shared context):
 * ?q=右&q=左 -> ["kanan", "kiri"]. Throws when the request fails or the answer
 * does not have one entry per word.
 */
async function dictMeanings(terms, sourceLanguage, targetLanguage, fetchImpl, clean = sanitizeAiMeaning) {
  const endpoint = new URL(DICT_TRANSLATE_URL);
  endpoint.searchParams.set('client', 'dict-chrome-ex');
  endpoint.searchParams.set('sl', sourceLanguage);
  endpoint.searchParams.set('tl', targetLanguage);
  for (const term of terms) endpoint.searchParams.append('q', term);
  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Google responded with HTTP ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length !== terms.length) throw new Error('Unexpected answer from Google.');
  // Each entry is the translation, or [translation, detectedLanguage] when the source is auto-detected.
  return payload.map((item) => clean(Array.isArray(item) ? item[0] : item));
}

/**
 * True when a "translation" only repeats a Japanese word (みぎ -> "Migi",
 * "migi" -> "migi"): translators do that for words they do not recognise.
 * Other languages are written in Latin letters, where the same spelling is
 * often the real meaning (German "normal" -> English "normal"), so only an
 * empty answer counts there.
 */
export function isEchoTranslation(term, meaning, sourceLanguage = 'ja') {
  const translated = normalizeText(meaning);
  if (!translated) return true;
  if (sourceLanguage !== 'ja') return false;
  if (normalizeText(term) === translated) return true;
  const romaji = kanaToRomaji(term);
  return Boolean(romaji) && normalizeText(romaji) === translated;
}

export async function lookupWordMeaning(term, overrides = {}) {
  const value = cleanText(term);
  if (!value) throw new Error('Isi kata terlebih dahulu sebelum menerjemahkan.');

  const { sourceLanguage, targetLanguage } = getLookupLanguages(overrides);
  const { baseUrl } = getAiMeaningConfig(overrides);
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;

  if (sourceLanguage === targetLanguage) {
    throw new Error('Bahasa kata dan bahasa arti sama; pilih bahasa arti yang berbeda.');
  }

  let lastError = null;
  const tryAll = async (text) => {
    const attempts = [
      async () => (await dictMeanings([text], sourceLanguage, targetLanguage, fetchImpl))[0],
      () => googleMeaning(text, sourceLanguage, targetLanguage, baseUrl, fetchImpl),
      () => myMemoryMeaning(text, sourceLanguage, targetLanguage, fetchImpl),
    ];
    for (const attempt of attempts) {
      try {
        const meaning = await attempt();
        if (!isEchoTranslation(value, meaning, sourceLanguage) && !isEchoTranslation(text, meaning, sourceLanguage)) {
          return meaning;
        }
      } catch (error) {
        lastError = error;
      }
    }
    return '';
  };

  const meaning = await tryAll(value);
  if (meaning) return meaning;

  if (sourceLanguage === 'ja') {
    const kanji = await kanjiSpelling(value, { fetchImpl, mode: 'any' });
    if (kanji) {
      const viaKanji = await tryAll(kanji);
      if (viaKanji) return viaKanji;
    }
  }

  throw new Error(lastError?.message || 'Tidak ada arti yang ditemukan untuk kata ini.');
}

/** Longest `q` sent in one batch, measured URL-encoded, so the GET request stays well under URL limits. */
const BATCH_QUERY_LIMIT = 3000;
const BATCH_SIZE_LIMIT = 100;

function splitIntoBatches(terms) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const term of terms) {
    const size = encodeURIComponent(term).length + 3; // + encoded newline
    if (current.length && (current.length >= BATCH_SIZE_LIMIT || length + size > BATCH_QUERY_LIMIT)) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(term);
    length += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** One request for many terms: one term per line in, one meaning per line out. Throws when the request fails. */
async function lineBatch(terms, sourceLanguage, targetLanguage, baseUrl, fetchImpl) {
  if (terms.length === 1) return [await googleMeaning(terms[0], sourceLanguage, targetLanguage, baseUrl, fetchImpl)];
  const endpoint = new URL('/translate_a/single', `${baseUrl.replace(/\/$/, '')}/`);
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', sourceLanguage);
  endpoint.searchParams.set('tl', targetLanguage);
  endpoint.searchParams.append('dt', 't');
  endpoint.searchParams.set('q', terms.join('\n'));
  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Google Translate responded with HTTP ${response.status}.`);
  const payload = await response.json();
  const lines = (Array.isArray(payload?.[0]) ? payload[0] : [])
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
    .split('\n');
  if (lines.length === terms.length) return lines.map(sanitizeAiMeaning);

  // The lines did not line up with the terms: halve the batch and try again.
  const middle = Math.ceil(terms.length / 2);
  return [
    ...(await lineBatch(terms.slice(0, middle), sourceLanguage, targetLanguage, baseUrl, fetchImpl)),
    ...(await lineBatch(terms.slice(middle), sourceLanguage, targetLanguage, baseUrl, fetchImpl)),
  ];
}

/**
 * Meanings for one batch: each word on its own through the dictionary endpoint,
 * or, if that endpoint fails, the line-based one. Echoes come back as ''.
 * Throws only when both fail.
 */
async function translateBatch(terms, sourceLanguage, targetLanguage, baseUrl, fetchImpl) {
  let meanings;
  try {
    meanings = await dictMeanings(terms, sourceLanguage, targetLanguage, fetchImpl);
  } catch {
    meanings = await lineBatch(terms, sourceLanguage, targetLanguage, baseUrl, fetchImpl);
  }
  return meanings.map((meaning, index) => (isEchoTranslation(terms[index], meaning, sourceLanguage) ? '' : meaning));
}

/** Words left blank by the batches are retried one by one, up to this many per call. */
const RETRY_LIMIT = 100;

/**
 * Translate many terms with few requests. Resolves to { meanings, error }:
 * one meaning per term ('' where none was found). When a request fails the
 * rest is left blank and `error` says why, so a partial result is still usable.
 * onProgress(done, total) runs after each batch.
 */
export async function translateTerms(terms, overrides = {}) {
  const { sourceLanguage, targetLanguage } = getLookupLanguages(overrides);
  const { baseUrl } = getAiMeaningConfig(overrides);
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;
  const cleaned = terms.map((term) => cleanText(term).replace(/\n/g, ' ').trim());
  if (sourceLanguage === targetLanguage) {
    return { meanings: cleaned.map(() => ''), error: 'The word language and meaning language are the same.' };
  }

  const meanings = [];
  for (const batch of splitIntoBatches(cleaned)) {
    try {
      meanings.push(...(await translateBatch(batch, sourceLanguage, targetLanguage, baseUrl, fetchImpl)));
    } catch (error) {
      return { meanings: [...meanings, ...cleaned.slice(meanings.length).map(() => '')], error: error.message || 'Translation failed.' };
    }
    overrides.onProgress?.(meanings.length, cleaned.length);
  }

  await fillBlanks(cleaned, meanings, { sourceLanguage, targetLanguage, baseUrl, fetchImpl });
  return { meanings, error: '' };
}

/**
 * Second pass for words the batches could not translate, so every word gets
 * its own meaning where one exists: hiragana words through their kanji
 * spelling (ひだり -> 左 -> "kiri"), then the rest one by one through every service.
 */
async function fillBlanks(terms, meanings, { sourceLanguage, targetLanguage, baseUrl, fetchImpl }) {
  let blank = terms.map((_, index) => index).filter((index) => !meanings[index]);
  if (blank.length === 0) return;

  if (sourceLanguage === 'ja') {
    const viaKanji = [];
    for (const index of blank.slice(0, RETRY_LIMIT)) {
      const kanji = await kanjiSpelling(terms[index], { fetchImpl, mode: 'any' });
      if (kanji) viaKanji.push({ index, kanji });
    }
    for (const batch of splitIntoBatches(viaKanji.map((item) => item.kanji))) {
      const items = viaKanji.splice(0, batch.length);
      try {
        const found = await dictMeanings(batch, sourceLanguage, targetLanguage, fetchImpl);
        items.forEach(({ index, kanji }, i) => {
          if (!isEchoTranslation(kanji, found[i]) && !isEchoTranslation(terms[index], found[i])) meanings[index] = found[i];
        });
      } catch {
        // left for the one-by-one pass
      }
    }
    blank = blank.filter((index) => !meanings[index]);
  }

  for (const index of blank.slice(0, RETRY_LIMIT)) {
    try {
      meanings[index] = await lookupWordMeaning(terms[index], { sourceLanguage, targetLanguage, baseUrl, fetchImpl });
    } catch {
      meanings[index] = '';
    }
  }
}

/**
 * Translate whole sentences (example sentences), each on its own, in one
 * request. Unlike meanings they keep their own capitalisation. Resolves to one
 * translation per sentence, '' where none could be made.
 */
export async function translateSentences(sentences, overrides = {}) {
  const { sourceLanguage, targetLanguage } = getLookupLanguages(overrides);
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;
  if (sentences.length === 0 || sourceLanguage === targetLanguage) return sentences.map(() => '');
  try {
    return await dictMeanings(sentences, sourceLanguage, targetLanguage, fetchImpl, (text) => cleanText(text));
  } catch {
    return sentences.map(() => '');
  }
}
