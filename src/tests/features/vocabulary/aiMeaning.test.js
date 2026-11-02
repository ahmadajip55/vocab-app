import { describe, expect, jest, it } from '@jest/globals';
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
  it('should use the public Google endpoint without an API key when nothing is configured', () => {
    const overrides = {};

    const { baseUrl } = getAiMeaningConfig(overrides);

    expect(baseUrl).toBe('https://translate.googleapis.com');
  });

  it('should use the given endpoint when it is overridden', () => {
    const overrides = { baseUrl: 'https://example.test' };

    const { baseUrl } = getAiMeaningConfig(overrides);

    expect(baseUrl).toBe('https://example.test');
  });

  it('should turn language names into codes when languages are looked up', () => {
    const overrides = { wordLanguage: 'Japanese', meaningLanguage: 'indonesian' };

    const languages = getLookupLanguages(overrides);

    expect(languages).toEqual({ sourceLanguage: 'ja', targetLanguage: 'id' });
  });
});

describe('sanitizeAiMeaning', () => {
  it.each([
    ['**Arti: pergi** [1]', 'Pergi'], // markdown and label removed, Title Case
    ['arti - pergi', 'Pergi'],
    ['Artikel', 'Artikel'], // a real word starting with "Arti" is kept
    ['Artis', 'Artis'],
  ])('should clean %p into %p when a meaning is sanitized', (raw, expected) => {
    const meaning = sanitizeAiMeaning(raw);

    expect(meaning).toBe(expected);
  });
});

describe('extractMeaningFromResponse', () => {
  it.each([
    ['one Google segment', [[['Jepang', '日本', null, null, 1]], null, 'ja'], 'Jepang'],
    ['several Google segments', [[['Saya ', 'a'], ['makan', 'b']]], 'Saya Makan'],
    ['a MyMemory answer', { responseData: { translatedText: 'jepang' } }, 'Jepang'],
    ['an empty answer', {}, ''],
  ])('should read the meaning when the response is %s', (_, payload, expected) => {
    const meaning = extractMeaningFromResponse(payload);

    expect(meaning).toBe(expected);
  });
});

describe('isEchoTranslation', () => {
  it.each([
    ['みぎ', 'Migi', undefined, true],
    ['migi', 'migi', undefined, true],
    ['みぎ', '', undefined, true],
    ['みぎ', 'kanan', undefined, false],
    ['右', 'right', undefined, false],
    ['normal', 'Normal', 'de', false], // same spelling is a real meaning between Latin-script languages
    ['bank', '', 'de', true],
  ])('should report %p -> %p (from %p) as an echo: %p when the translation is checked', (term, meaning, sourceLanguage, expected) => {
    const echo = isEchoTranslation(term, meaning, sourceLanguage);

    expect(echo).toBe(expected);
  });
});

describe('lookupWordMeaning', () => {
  it('should keep kanji as typed and use the chosen languages when Google is asked', async () => {
    const fetchImpl = jest.fn(async () => json(['Jepang']));

    const meaning = await lookupWordMeaning('日本', { sourceLanguage: 'ja', targetLanguage: 'id', fetchImpl });
    const url = new URL(fetchImpl.mock.calls[0][0]);

    expect(meaning).toBe('Jepang');
    expect(url.hostname).toBe('clients5.google.com');
    expect(url.searchParams.getAll('q')).toEqual(['日本']);
    expect([url.searchParams.get('sl'), url.searchParams.get('tl')]).toEqual(['ja', 'id']);
  });

  it('should use MyMemory when Google fails', async () => {
    const fetchImpl = async (url) => (String(url).includes('mymemory') ? json({ responseData: { translatedText: 'halo' } }) : json({}, 500));

    const meaning = await lookupWordMeaning('hello', { fetchImpl });

    expect(meaning).toBe('Halo');
  });

  it.each([
    ['a blank word', ' ', {}, /Isi kata/],
    ['the same language twice', 'a', { sourceLanguage: 'id', targetLanguage: 'id' }, /sama/],
    ['every service failing', 'hello', { fetchImpl: async () => json({}, 500) }, /gagal/],
  ])('should refuse the lookup when the problem is %s', async (_, term, options, message) => {
    const lookup = lookupWordMeaning(term, options);

    await expect(lookup).rejects.toThrow(message);
  });
});

describe('translateTerms', () => {
  it('should translate every word on its own, 100 per request, when many words are translated', async () => {
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

  it('should report progress after each request when words are translated in batches', async () => {
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

  it('should use the line-based endpoint when the dictionary endpoint fails', async () => {
    const { fetchImpl, urls } = fakeServices({ dictDown: true });

    const result = await translateTerms(['a1', 'b2', 'c3'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(result.meanings).toEqual(['T:a1', 'T:b2', 'T:c3']);
    expect(urls()[1].hostname).toBe('translate.googleapis.com');
    expect(urls()[1].searchParams.get('q')).toBe('a1\nb2\nc3');
  });

  it('should keep the results it has and report the failure when a request fails', async () => {
    const terms = Array.from({ length: 150 }, (_, i) => `w${i}`);
    const { fetchImpl } = fakeServices({ failAfter: 1 });

    const result = await translateTerms(terms, { sourceLanguage: 'en', targetLanguage: 'ja', fetchImpl });

    expect(result.meanings).toHaveLength(150);
    expect(result.meanings[0]).toBe('T:w0');
    expect(result.meanings.slice(100).every((meaning) => meaning === '')).toBe(true);
    expect(result.error).toMatch(/HTTP 429/);
  });

  it('should refuse to translate when both languages are the same', async () => {
    const { fetchImpl } = fakeServices();

    const result = await translateTerms(['x'], { sourceLanguage: 'en', targetLanguage: 'en', fetchImpl });

    expect(result.meanings).toEqual(['']);
    expect(result.error).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should translate through the kanji spelling when Google does not recognise a hiragana word', async () => {
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

  it('should try the word alone, ending with MyMemory, when it is still blank after the batches', async () => {
    const fetchImpl = jest.fn(async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.mymemory.translated.net') return json({ responseData: { translatedText: 'halo' } });
      if (parsed.hostname === 'clients5.google.com') {
        return json(parsed.searchParams.getAll('q').map((q) => (q === 'hello' ? '' : `t:${q}`)));
      }
      return json([[['', 'hello']]]); // the line-based endpoint finds nothing either
    });

    const result = await translateTerms(['hello', 'cat'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });
    const dictionaryCalls = fetchImpl.mock.calls.filter(([url]) => new URL(url).hostname === 'clients5.google.com');

    expect(result.meanings).toEqual(['Halo', 'T:cat']);
    expect(dictionaryCalls).toHaveLength(2); // the batch, then "hello" on its own
  });

  it('should keep the meaning without retrying when a Latin-script meaning is spelled like the word', async () => {
    const { fetchImpl } = fakeServices({ dictionary: { normal: 'normal', bank: 'bank', Strand: 'beach' } });

    const result = await translateTerms(['normal', 'bank', 'Strand'], { sourceLanguage: 'de', targetLanguage: 'en', fetchImpl });

    expect(result.meanings).toEqual(['Normal', 'Bank', 'Beach']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
