import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRng } from '../../lib/random.js';
import {
  CEFR_RANKS,
  SAMPLE_MAX,
  cefrSlice,
  clearSampleCache,
  fetchSampleTerms,
  parseFrequencyList,
  parseJlptEntries,
} from './sampleSource.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    for (const [part, response] of Object.entries(routes)) {
      if (url.includes(part)) return typeof response === 'function' ? response() : response;
    }
    return { ok: false, status: 404 };
  };
  return { fetchImpl, calls };
}

/** A frequency file with `n` distinct words: w0, w1, ... written as letters only. */
function frequencyFile(n) {
  const letters = (i) => i.toString(26).split('').map((c) => String.fromCharCode(97 + parseInt(c, 26))).join('');
  return Array.from({ length: n }, (_, i) => `x${letters(i)} ${n - i}`).join('\n');
}

test('parseFrequencyList keeps real words in order and drops junk', () => {
  const text = 'you 100\ni 90\nthe 80\n123 70\nit\'s 60\nThe 50\ncafé 40\nwell-known 30\n- 20\n\nstraße 10';
  assert.deepEqual(parseFrequencyList(text), ['you', 'the', "it's", 'café', 'well-known', 'straße']);
  assert.deepEqual(parseFrequencyList(undefined), []);
});

test('CEFR levels map to frequency rank bands', () => {
  const words = Array.from({ length: 20000 }, (_, i) => `w${i}`);
  assert.deepEqual(cefrSlice(words, ['A1']), words.slice(0, 500));
  assert.deepEqual(cefrSlice(words, ['A2', 'C2']).length, 500 + 8000);
  assert.deepEqual(cefrSlice(words, ['N5']), []);
  assert.deepEqual(Object.keys(CEFR_RANKS), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
});

test('parseJlptEntries reads the written form and skips blank entries', () => {
  const entries = parseJlptEntries({ words: [{ word: '毎朝' }, { word: ' ' }, {}, { word: 'お茶' }] });
  assert.deepEqual(entries.map((entry) => entry.term), ['毎朝', 'お茶']);
  assert.deepEqual(parseJlptEntries(null), []);
});

test('Japanese programs download each chosen JLPT level', async () => {
  clearSampleCache();
  const { fetchImpl, calls } = fakeFetch({
    'level=5': ok({ words: [{ word: '毎朝' }, { word: '問題' }] }),
    'level=4': ok({ words: [{ word: '会議' }, { word: '問題' }] }),
  });
  const result = await fetchSampleTerms({
    wordLanguage: 'ja',
    levels: ['N5', 'N4'],
    count: 10,
    existingTerms: ['毎朝'],
    fetchImpl,
  });
  assert.deepEqual(result.terms.sort(), ['会議', '問題'].sort());
  assert.equal(result.available, 2);
  assert.deepEqual(result.levels, ['N5', 'N4']);
  assert.ok(calls.every((url) => url.startsWith('https://jlpt-vocab-api.vercel.app/api/words?level=')));
  assert.ok(calls.every((url) => url.includes('limit=1000'))); // a large pool, whatever the count
});

test('other languages use the frequency list of their own language and the chosen CEFR band', async () => {
  clearSampleCache();
  const { fetchImpl, calls } = fakeFetch({ '/de/de_50k.txt': ok(frequencyFile(3000)) });
  const all = parseFrequencyList(frequencyFile(3000));

  const result = await fetchSampleTerms({
    wordLanguage: 'de',
    levels: ['A2'],
    count: 25,
    fetchImpl,
    rng: createSeededRng(7),
  });
  assert.equal(result.terms.length, 25);
  const band = new Set(all.slice(500, 1000));
  assert.ok(result.terms.every((term) => band.has(term)));
  assert.equal(new Set(result.terms).size, 25);
  assert.match(calls[0], /FrequencyWords\/master\/content\/2018\/de\/de_50k\.txt$/);

  // The download is cached for the session.
  await fetchSampleTerms({ wordLanguage: 'de', levels: ['A1'], count: 5, fetchImpl });
  assert.equal(calls.length, 1);
});

test('count is capped at 100 and a program without levels starts at the beginner level', async () => {
  clearSampleCache();
  const { fetchImpl } = fakeFetch({ '/en/en_50k.txt': ok(frequencyFile(20000)) });
  const big = await fetchSampleTerms({ wordLanguage: 'en', levels: ['C2'], count: 5000, fetchImpl });
  assert.equal(SAMPLE_MAX, 100);
  assert.equal(big.terms.length, 100);

  const beginner = await fetchSampleTerms({ wordLanguage: 'en', levels: [], count: 3, fetchImpl });
  assert.deepEqual(beginner.levels, ['A1']);
});

test('download failures are reported and retried on the next attempt', async () => {
  clearSampleCache();
  let attempts = 0;
  const { fetchImpl } = fakeFetch({
    '/fr/fr_50k.txt': () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 503 } : ok('bonjour 10\nmerci 5');
    },
  });
  await assert.rejects(
    fetchSampleTerms({ wordLanguage: 'fr', levels: ['A1'], count: 2, fetchImpl }),
    /Could not download sample words.*HTTP 503/,
  );
  const retry = await fetchSampleTerms({ wordLanguage: 'fr', levels: ['A1'], count: 2, fetchImpl });
  assert.deepEqual(retry.terms.sort(), ['bonjour', 'merci']);
});
