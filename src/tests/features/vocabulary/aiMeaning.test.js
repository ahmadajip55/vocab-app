import { describe, expect, jest, test } from '@jest/globals';
import {
  extractMeaningFromResponse,
  getAiMeaningConfig,
  getLookupLanguages,
  isEchoTranslation,
  lookupWordMeaning,
  sanitizeAiMeaning,
  translateTerms,
} from '../../../features/vocabulary/aiMeaning.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

/**
 * Fake translation services. Google's dictionary endpoint answers every q on
 * its own; `dictionary` maps a word to its meaning (unknown words get "t:<word>",
 * words mapped to null are echoed back). `dictDown` makes that endpoint fail so
 * the line-based endpoint is used; `failAfter` makes every request fail after n.
 * `candidates` are Google Input Tools answers for hiragana words.
 */
function fakeServices({ dictionary = {}, dictDown = false, failAfter = Infinity, candidates = {} } = {}) {
  const meaningOf = (word) => (word in dictionary ? (dictionary[word] ?? word) : `t:${word}`);
  const fetchImpl = jest.fn(async (url) => {
    const parsed = new URL(url);
    if (fetchImpl.mock.calls.length > failAfter) return json({}, 429);
    if (parsed.hostname === 'inputtools.google.com') {
      const text = parsed.searchParams.get('text');
      return json(['SUCCESS', [[text, candidates[text] ?? []]]]);
    }
    if (parsed.hostname === 'api.mymemory.translated.net') {
      return json({ responseData: { translatedText: meaningOf(parsed.searchParams.get('q')) } });
    }
    if (parsed.hostname === 'clients5.google.com') {
      if (dictDown) return json({}, 503);
      return json(parsed.searchParams.getAll('q').map(meaningOf));
    }
    const lines = parsed.searchParams.get('q').split('\n');
    return json([[[lines.map(meaningOf).join('\n'), lines.join('\n')]]]);
  });
  const urls = () => fetchImpl.mock.calls.map(([url]) => new URL(url));
  return { fetchImpl, urls };
}

describe('configuration', () => {
  test('needs no API key and defaults to the public Google endpoint', () => {
    const overrides = {};

    const { baseUrl } = getAiMeaningConfig(overrides);

    expect(baseUrl).toBe('https://translate.googleapis.com');
  });

  test('the endpoint can be overridden', () => {
    const overrides = { baseUrl: 'https://example.test' };

    const { baseUrl } = getAiMeaningConfig(overrides);

    expect(baseUrl).toBe('https://example.test');
  });

  test('language names become codes', () => {
    const overrides = { wordLanguage: 'Japanese', meaningLanguage: 'indonesian' };

    const languages = getLookupLanguages(overrides);

    expect(languages).toEqual({ sourceLanguage: 'ja', targetLanguage: 'id' });
  });
});

describe('sanitizeAiMeaning', () => {
  test.each([
    ['**Arti: pergi** [1]', 'Pergi'], // markdown and label removed, Title Case
    ['arti - pergi', 'Pergi'],
    ['Artikel', 'Artikel'], // a real word starting with "Arti" is kept
    ['Artis', 'Artis'],
  ])('cleans %p into %p', (raw, expected) => {
    const meaning = sanitizeAiMeaning(raw);

    expect(meaning).toBe(expected);
  });
});

describe('extractMeaningFromResponse', () => {
  test.each([
    ['one Google segment', [[['Jepang', '日本', null, null, 1]], null, 'ja'], 'Jepang'],
    ['several Google segments', [[['Saya ', 'a'], ['makan', 'b']]], 'Saya Makan'],
    ['a MyMemory answer', { responseData: { translatedText: 'jepang' } }, 'Jepang'],
    ['an empty answer', {}, ''],
  ])('reads %s', (_, payload, expected) => {
    const meaning = extractMeaningFromResponse(payload);

    expect(meaning).toBe(expected);
  });
});

describe('isEchoTranslation', () => {
  test.each([
    ['みぎ', 'Migi', undefined, true],
    ['migi', 'migi', undefined, true],
    ['みぎ', '', undefined, true],
    ['みぎ', 'kanan', undefined, false],
    ['右', 'right', undefined, false],
    ['normal', 'Normal', 'de', false], // same spelling is a real meaning between Latin-script languages
    ['bank', '', 'de', true],
  ])('%p -> %p (from %p) is an echo: %p', (term, meaning, sourceLanguage, expected) => {
    const echo = isEchoTranslation(term, meaning, sourceLanguage);

    expect(echo).toBe(expected);
  });
});

describe('lookupWordMeaning', () => {
  test('keeps kanji as typed and asks Google with the chosen languages', async () => {
    const fetchImpl = jest.fn(async () => json(['Jepang']));

    const meaning = await lookupWordMeaning('日本', { sourceLanguage: 'ja', targetLanguage: 'id', fetchImpl });

    expect(meaning).toBe('Jepang');
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.hostname).toBe('clients5.google.com');
    expect(url.searchParams.getAll('q')).toEqual(['日本']);
    expect([url.searchParams.get('sl'), url.searchParams.get('tl')]).toEqual(['ja', 'id']);
  });

  test('falls back to MyMemory when Google fails', async () => {
    const fetchImpl = async (url) => (String(url).includes('mymemory') ? json({ responseData: { translatedText: 'halo' } }) : json({}, 500));

    const meaning = await lookupWordMeaning('hello', { fetchImpl });

    expect(meaning).toBe('Halo');
  });

  test.each([
    ['a blank word', ' ', {}, /Isi kata/],
    ['the same language twice', 'a', { sourceLanguage: 'id', targetLanguage: 'id' }, /sama/],
    ['every service failing', 'hello', { fetchImpl: async () => json({}, 500) }, /gagal/],
  ])('refuses %s', async (_, term, options, message) => {
    const lookup = lookupWordMeaning(term, options);

    await expect(lookup).rejects.toThrow(message);
  });
});

describe('translateTerms', () => {
  test('translates every word on its own, 100 words per request', async () => {
    const terms = Array.from({ length: 250 }, (_, i) => `word${i}`);
    const { fetchImpl, urls } = fakeServices();

    const result = await translateTerms(terms, { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(result.error).toBe('');
    expect(result.meanings).toEqual(terms.map((term) => `T:${term}`));
    expect(urls()).toHaveLength(3); // 100 + 100 + 50
    expect(urls().every((url) => url.hostname === 'clients5.google.com')).toBe(true);
    expect(urls()[2].searchParams.getAll('q')).toEqual(terms.slice(200));
    expect([urls()[0].searchParams.get('sl'), urls()[0].searchParams.get('tl')]).toEqual(['en', 'id']);
  });

  test('reports progress after each request', async () => {
    const terms = Array.from({ length: 250 }, (_, i) => `word${i}`);
    const { fetchImpl } = fakeServices();
    const onProgress = jest.fn();

    await translateTerms(terms, { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl, onProgress });

    expect(onProgress.mock.calls).toEqual([
      [100, 250],
      [200, 250],
      [250, 250],
    ]);
  });

  test('falls back to the line-based endpoint when the dictionary endpoint fails', async () => {
    const { fetchImpl, urls } = fakeServices({ dictDown: true });

    const result = await translateTerms(['a1', 'b2', 'c3'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(result.meanings).toEqual(['T:a1', 'T:b2', 'T:c3']);
    expect(urls()[1].hostname).toBe('translate.googleapis.com');
    expect(urls()[1].searchParams.get('q')).toBe('a1\nb2\nc3');
  });

  test('keeps the results it has and reports a failed request', async () => {
    const terms = Array.from({ length: 150 }, (_, i) => `w${i}`);
    const { fetchImpl } = fakeServices({ failAfter: 1 });

    const result = await translateTerms(terms, { sourceLanguage: 'en', targetLanguage: 'ja', fetchImpl });

    expect(result.meanings).toHaveLength(150);
    expect(result.meanings[0]).toBe('T:w0');
    expect(result.meanings.slice(100).every((meaning) => meaning === '')).toBe(true);
    expect(result.error).toMatch(/HTTP 429/);
  });

  test('refuses to translate into the same language', async () => {
    const { fetchImpl } = fakeServices();

    const result = await translateTerms(['x'], { sourceLanguage: 'en', targetLanguage: 'en', fetchImpl });

    expect(result.meanings).toEqual(['']);
    expect(result.error).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('translates hiragana words Google does not recognise through their kanji spelling', async () => {
    const { fetchImpl, urls } = fakeServices({
      dictionary: { みぎ: 'kanan', ひだり: null, 左: 'kiri', はし: null, 橋: 'jembatan' },
      candidates: { ひだり: ['左', 'ひだり'], はし: ['橋', '箸', 'はし'] },
    });

    const result = await translateTerms(['みぎ', 'ひだり', 'はし'], { sourceLanguage: 'ja', targetLanguage: 'id', fetchImpl });

    expect(result.meanings).toEqual(['Kanan', 'Kiri', 'Jembatan']);
    // One batch for the words, two kanji lookups, one batch for the kanji.
    expect(urls().map((url) => url.hostname)).toEqual([
      'clients5.google.com',
      'inputtools.google.com',
      'inputtools.google.com',
      'clients5.google.com',
    ]);
    expect(urls()[3].searchParams.getAll('q')).toEqual(['左', '橋']);
  });

  test('tries a word still blank after the batches on its own, ending with MyMemory', async () => {
    const fetchImpl = jest.fn(async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.mymemory.translated.net') return json({ responseData: { translatedText: 'halo' } });
      if (parsed.hostname === 'clients5.google.com') {
        return json(parsed.searchParams.getAll('q').map((q) => (q === 'hello' ? '' : `t:${q}`)));
      }
      return json([[['', 'hello']]]); // the line-based endpoint finds nothing either
    });

    const result = await translateTerms(['hello', 'cat'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(result.meanings).toEqual(['Halo', 'T:cat']);
    const dictionaryCalls = fetchImpl.mock.calls.filter(([url]) => new URL(url).hostname === 'clients5.google.com');
    expect(dictionaryCalls).toHaveLength(2); // the batch, then "hello" on its own
  });

  test('keeps a Latin-script meaning spelled like the word, without retrying', async () => {
    const { fetchImpl } = fakeServices({ dictionary: { normal: 'normal', bank: 'bank', Strand: 'beach' } });

    const result = await translateTerms(['normal', 'bank', 'Strand'], { sourceLanguage: 'de', targetLanguage: 'en', fetchImpl });

    expect(result.meanings).toEqual(['Normal', 'Bank', 'Beach']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
