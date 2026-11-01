import { kanaToRomaji, normalizeRomaji } from '../../languages/japanese/romaji.js';
import { shuffle } from '../../lib/random.js';
import { cleanText } from '../../lib/text.js';
import { termKey } from './model.js';
import { levelOptionsFor } from './programs.js';

/** Most sample words loaded at once. */
export const SAMPLE_MAX = 100;

/** Words downloaded per JLPT level (the API's maximum), so samples are picked from a large pool. */
const JLPT_POOL_SIZE = 1000;

/** JLPT vocabulary per level (N5-N1); free and keyless, allows browser requests. */
const JLPT_URL = 'https://jlpt-vocab-api.vercel.app/api/words';

/** 50k most frequent words per language, from subtitles (hermitdave/FrequencyWords). */
const frequencyUrl = (language) =>
  `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${language}/${language}_50k.txt`;

/**
 * There is no free CEFR word list for every language, so CEFR levels are
 * approximated by frequency rank: [from, to) in the cleaned list.
 */
export const CEFR_RANKS = {
  A1: [0, 500],
  A2: [500, 1000],
  B1: [1000, 2000],
  B2: [2000, 4000],
  C1: [4000, 8000],
  C2: [8000, 16000],
};

const WORD_PATTERN = /^\p{L}[\p{L}\p{M}'’-]*\p{L}$/u;

/** "word count" lines -> clean words in frequency order, without digits, symbols or one-letter entries. */
export function parseFrequencyList(text) {
  const words = [];
  const seen = new Set();
  for (const line of String(text ?? '').split('\n')) {
    const word = cleanText(line.split(' ')[0]).trim();
    if (!WORD_PATTERN.test(word)) continue;
    const key = termKey(word);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

export function cefrSlice(words, levels) {
  return levels.flatMap((level) => {
    const range = CEFR_RANKS[level];
    return range ? words.slice(range[0], range[1]) : [];
  });
}

/** JLPT API response -> [{ term, romaji }]: the word as written (kanji when there is one) and its reading. */
export function parseJlptEntries(data) {
  if (!Array.isArray(data?.words)) return [];
  return data.words
    .map((item) => {
      const term = cleanText(item?.word ?? '').trim();
      const reading = cleanText(item?.furigana ?? '').trim() || term;
      return { term, romaji: kanaToRomaji(reading) || normalizeRomaji(item?.romaji) };
    })
    .filter((entry) => entry.term);
}

// Downloads are reused for the rest of the session; a failed one is retried next time.
const cache = new Map();

function cachedFetch(url, read, fetchImpl) {
  if (!cache.has(url)) {
    const request = fetchImpl(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return read(response);
    });
    request.catch(() => cache.delete(url));
    cache.set(url, request);
  }
  return cache.get(url);
}

export function clearSampleCache() {
  cache.clear();
}

/** Resolves to [{ term, romaji }]; romaji is only known for JLPT words. */
async function downloadPool(wordLanguage, levels, fetchImpl) {
  if (wordLanguage === 'ja') {
    const lists = await Promise.all(
      levels.map((level) =>
        cachedFetch(`${JLPT_URL}?level=${level.slice(1)}&limit=${JLPT_POOL_SIZE}`, (response) => response.json(), fetchImpl).then(
          parseJlptEntries,
        ),
      ),
    );
    return lists.flat();
  }
  const words = await cachedFetch(frequencyUrl(wordLanguage), async (response) => parseFrequencyList(await response.text()), fetchImpl);
  return cefrSlice(words, levels).map((term) => ({ term, romaji: '' }));
}

/**
 * Pick `count` random words for the program's language and levels, skipping
 * terms already in `existingTerms`. Resolves to { terms, romaji, available, levels },
 * where romaji[i] is the reading of terms[i] ('' when unknown).
 * A program without levels uses the first (beginner) level.
 */
export async function fetchSampleTerms({
  wordLanguage,
  levels,
  count,
  existingTerms = [],
  fetchImpl = globalThis.fetch,
  rng = Math.random,
}) {
  const options = levelOptionsFor(wordLanguage);
  const chosen = levels?.length ? levels.filter((level) => options.includes(level)) : [];
  const usedLevels = chosen.length ? chosen : [options[0]];
  const wanted = Math.max(1, Math.min(SAMPLE_MAX, Math.floor(Number(count)) || 1));

  let pool;
  try {
    pool = await downloadPool(wordLanguage, usedLevels, fetchImpl);
  } catch (error) {
    throw new Error(`Could not download sample words. Check your internet connection and try again. (${error.message})`);
  }

  const seen = new Set(existingTerms.map(termKey));
  const fresh = [];
  for (const entry of pool) {
    const key = termKey(entry.term);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(entry);
  }
  const picked = shuffle(fresh, rng).slice(0, wanted);
  return {
    terms: picked.map((entry) => entry.term),
    romaji: picked.map((entry) => entry.romaji),
    available: fresh.length,
    levels: usedLevels,
  };
}
