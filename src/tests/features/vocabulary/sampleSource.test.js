import { beforeEach, describe, expect, jest, it } from '@jest/globals';
import { createSeededRng } from '../../../lib/random.js';
import {
  CEFR_RANKS,
  SAMPLE_MAX,
  cefrSlice,
  clearSampleCache,
  fetchSampleTerms,
  parseFrequencyList,
  parseJlptEntries,
} from '../../../features/vocabulary/sampleSource.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });

/** Fake fetch: the first route whose key appears in the URL answers; anything else is a 404. */
function fakeFetch(routes) {
  return jest.fn(async (url) => {
    for (const [part, response] of Object.entries(routes)) {
      if (url.includes(part)) return typeof response === 'function' ? response() : response;
    }
    return { ok: false, status: 404 };
  });
}

/** A frequency file with `n` distinct words, written with letters only. */
function frequencyFile(n) {
  const letters = (i) => i.toString(26).split('').map((c) => String.fromCharCode(97 + parseInt(c, 26))).join('');
  return Array.from({ length: n }, (_, i) => `x${letters(i)} ${n - i}`).join('\n');
}

beforeEach(() => {
  clearSampleCache();
});

describe('parseFrequencyList', () => {
  it('should keep real words in frequency order when the list has junk', () => {
    const text = "you 100\ni 90\nthe 80\n123 70\nit's 60\nThe 50\ncafé 40\nwell-known 30\n- 20\n\nstraße 10";

    const words = parseFrequencyList(text);

    expect(words).toEqual(['you', 'the', "it's", 'café', 'well-known', 'straße']);
  });

  it('should return an empty list when there is no text', () => {
    const text = undefined;

    const words = parseFrequencyList(text);

    expect(words).toEqual([]);
  });
});

describe('CEFR levels', () => {
  const words = Array.from({ length: 20000 }, (_, i) => `w${i}`);

  it('should be A1 to C2 when the levels are listed', () => {
    const ranks = CEFR_RANKS;

    const levels = Object.keys(ranks);

    expect(levels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('should be the 500 most frequent words when the level is A1', () => {
    const levels = ['A1'];

    const slice = cefrSlice(words, levels);

    expect(slice).toEqual(words.slice(0, 500));
  });

  it('should combine the ranges when several levels are chosen', () => {
    const levels = ['A2', 'C2'];

    const slice = cefrSlice(words, levels);

    expect(slice).toHaveLength(500 + 8000);
  });

  it('should give no range when the level is a JLPT level', () => {
    const levels = ['N5'];

    const slice = cefrSlice(words, levels);

    expect(slice).toEqual([]);
  });
});

describe('parseJlptEntries', () => {
  it('should read the written form and skip blanks when entries are parsed', () => {
    const data = { words: [{ word: '毎朝' }, { word: ' ' }, {}, { word: 'お茶' }] };

    const entries = parseJlptEntries(data);

    expect(entries.map((entry) => entry.term)).toEqual(['毎朝', 'お茶']);
  });

  it('should return an empty list when there is no data', () => {
    const data = null;

    const entries = parseJlptEntries(data);

    expect(entries).toEqual([]);
  });
});

describe('fetchSampleTerms', () => {
  describe('for a Japanese program', () => {
    const jlpt = () =>
      fakeFetch({
        'level=5': ok({ words: [{ word: '毎朝' }, { word: '問題' }] }),
        'level=4': ok({ words: [{ word: '会議' }, { word: '問題' }] }),
      });

    it('should pick from every chosen JLPT level and skip existing words when the program is Japanese', async () => {
      const fetchImpl = jlpt();

      const result = await fetchSampleTerms({ wordLanguage: 'ja', levels: ['N5', 'N4'], count: 10, existingTerms: ['毎朝'], fetchImpl });

      expect([...result.terms].sort()).toEqual(['会議', '問題'].sort());
      expect(result.available).toBe(2);
      expect(result.levels).toEqual(['N5', 'N4']);
    });

    it('should download a large pool from the JLPT list when any count is asked for', async () => {
      const fetchImpl = jlpt();

      await fetchSampleTerms({ wordLanguage: 'ja', levels: ['N5', 'N4'], count: 10, fetchImpl });
      const urls = fetchImpl.mock.calls.map(([url]) => url);

      expect(urls.every((url) => url.startsWith('https://jlpt-vocab-api.vercel.app/api/words?level='))).toBe(true);
      expect(urls.every((url) => url.includes('limit=1000'))).toBe(true);
    });
  });

  describe('for other languages', () => {
    it('should use the frequency list and CEFR band of the program when it is not Japanese', async () => {
      const fetchImpl = fakeFetch({ '/de/de_50k.txt': ok(frequencyFile(3000)) });
      const band = new Set(parseFrequencyList(frequencyFile(3000)).slice(500, 1000));

      const result = await fetchSampleTerms({ wordLanguage: 'de', levels: ['A2'], count: 25, fetchImpl, rng: createSeededRng(7) });

      expect(result.terms).toHaveLength(25);
      expect(new Set(result.terms).size).toBe(25);
      expect(result.terms.every((term) => band.has(term))).toBe(true);
      expect(fetchImpl.mock.calls[0][0]).toMatch(/FrequencyWords\/master\/content\/2018\/de\/de_50k\.txt$/);
    });

    it('should download the list once when samples are asked for again', async () => {
      const fetchImpl = fakeFetch({ '/de/de_50k.txt': ok(frequencyFile(3000)) });
      await fetchSampleTerms({ wordLanguage: 'de', levels: ['A2'], count: 25, fetchImpl });

      await fetchSampleTerms({ wordLanguage: 'de', levels: ['A1'], count: 5, fetchImpl });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('should cap the count at 100 when more are asked for', async () => {
      const fetchImpl = fakeFetch({ '/en/en_50k.txt': ok(frequencyFile(20000)) });

      const result = await fetchSampleTerms({ wordLanguage: 'en', levels: ['C2'], count: 5000, fetchImpl });

      expect(SAMPLE_MAX).toBe(100);
      expect(result.terms).toHaveLength(100);
    });

    it('should start at the beginner level when the program has no levels', async () => {
      const fetchImpl = fakeFetch({ '/en/en_50k.txt': ok(frequencyFile(20000)) });

      const result = await fetchSampleTerms({ wordLanguage: 'en', levels: [], count: 3, fetchImpl });

      expect(result.levels).toEqual(['A1']);
    });
  });

  describe('when the download fails', () => {
    /** The French list fails once with HTTP 503, then works. */
    function failingOnce() {
      let attempts = 0;
      return fakeFetch({
        '/fr/fr_50k.txt': () => {
          attempts += 1;
          return attempts === 1 ? { ok: false, status: 503 } : ok('bonjour 10\nmerci 5');
        },
      });
    }
    const request = { wordLanguage: 'fr', levels: ['A1'], count: 2 };

    it('should report the failure when the download fails', async () => {
      const fetchImpl = failingOnce();

      const attempt = fetchSampleTerms({ ...request, fetchImpl });

      await expect(attempt).rejects.toThrow(/Could not download sample words.*HTTP 503/);
    });

    it('should try again when the next attempt follows a failure', async () => {
      const fetchImpl = failingOnce();
      await fetchSampleTerms({ ...request, fetchImpl }).catch(() => {});

      const retry = await fetchSampleTerms({ ...request, fetchImpl });

      expect([...retry.terms].sort()).toEqual(['bonjour', 'merci']);
    });
  });
});
