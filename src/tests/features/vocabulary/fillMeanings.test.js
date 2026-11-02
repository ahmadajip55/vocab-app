import { describe, expect, jest, test } from '@jest/globals';
import { createWord } from '../../../features/vocabulary/model.js';
import { fillMissingMeanings } from '../../../features/vocabulary/fillMeanings.js';

const word = (term, meaning = '') => createWord({ term, meaning, wordLanguage: 'en', meaningLanguage: 'id' });

/** Fake Google dictionary endpoint: "arti <word>" for every word except "Zzz", which it does not know. */
function fakeTranslator() {
  return jest.fn(async (url) => {
    const parsed = new URL(url);
    return { ok: true, json: async () => parsed.searchParams.getAll('q').map((q) => (q === 'Zzz' ? '' : `arti ${q}`)) };
  });
}

describe('fillMissingMeanings', () => {
  test('asks for every blank word in one request; only a word with no answer is retried alone', async () => {
    const fetchImpl = fakeTranslator();
    const words = [word('cat'), word('dog', 'anjing'), word('bird'), word('zzz')];

    await fillMissingMeanings(words, undefined, { fetchImpl });

    const urls = fetchImpl.mock.calls.map(([url]) => new URL(url));
    expect(urls[0].searchParams.getAll('q')).toEqual(['Cat', 'Bird', 'Zzz']);
    expect(urls.slice(1).every((url) => url.searchParams.get('q') === 'Zzz')).toBe(true);
  });

  test('fills the blanks and keeps the saved meanings', async () => {
    const fetchImpl = fakeTranslator();
    const words = [word('cat'), word('dog', 'anjing'), word('bird'), word('zzz')];

    const filled = await fillMissingMeanings(words, undefined, { fetchImpl });

    expect(filled.map((w) => w.meaning)).toEqual(['Arti Cat', 'Anjing', 'Arti Bird', '']);
  });

  test('reports every meaning found so the caller can save it', async () => {
    const fetchImpl = fakeTranslator();
    const onFound = jest.fn();
    const words = [word('cat'), word('dog', 'anjing'), word('bird'), word('zzz')];

    await fillMissingMeanings(words, onFound, { fetchImpl });

    expect(onFound.mock.calls).toEqual([
      [words[0].id, 'Arti Cat'],
      [words[2].id, 'Arti Bird'],
    ]);
  });

  test('requests nothing when every word already has a meaning', async () => {
    const fetchImpl = jest.fn();
    const words = [word('cat', 'kucing')];

    const result = await fillMissingMeanings(words, undefined, { fetchImpl });

    expect(result).toBe(words);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
