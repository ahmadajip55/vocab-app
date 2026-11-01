import { test } from 'node:test';
import { kanjiSpelling } from '../../languages/japanese/kanji.js';
import assert from 'node:assert/strict';

import {
  extractMeaningFromResponse,
  getAiMeaningConfig,
  getLookupLanguages,
  lookupWordMeaning,
  isEchoTranslation,
  sanitizeAiMeaning,
  translateTerms,
} from './aiMeaning.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('lookup needs no API key and defaults to the public Google endpoint', () => {
  assert.equal(getAiMeaningConfig({}).baseUrl, 'https://translate.googleapis.com');
  assert.equal(getAiMeaningConfig({ baseUrl: 'https://example.test' }).baseUrl, 'https://example.test');
  assert.deepEqual(getLookupLanguages({ wordLanguage: 'Japanese', meaningLanguage: 'indonesian' }), {
    sourceLanguage: 'ja',
    targetLanguage: 'id',
  });
});

test('sanitizeAiMeaning cleans markdown and labels', () => {
  assert.equal(sanitizeAiMeaning('**Arti: pergi** [1]'), 'Pergi'); // meanings are kept in Title Case
  // Only an "Arti:" label is removed, never the start of a real word.
  assert.equal(sanitizeAiMeaning('Artikel'), 'Artikel');
  assert.equal(sanitizeAiMeaning('Artis'), 'Artis');
  assert.equal(sanitizeAiMeaning('arti - pergi'), 'Pergi');
});

test('extractMeaningFromResponse joins Google segments and reads MyMemory', () => {
  assert.equal(extractMeaningFromResponse([[['Jepang', '日本', null, null, 1]], null, 'ja']), 'Jepang');
  assert.equal(extractMeaningFromResponse([[['Saya ', 'a'], ['makan', 'b']]]), 'Saya Makan');
  assert.equal(extractMeaningFromResponse({ responseData: { translatedText: 'jepang' } }), 'Jepang');
  assert.equal(extractMeaningFromResponse({}), '');
});

test('lookupWordMeaning keeps kanji as typed and asks Google with the chosen languages', async () => {
  let requested;
  const meaning = await lookupWordMeaning('日本', {
    sourceLanguage: 'ja',
    targetLanguage: 'id',
    fetchImpl: async (url) => {
      requested = new URL(url);
      return json(['Jepang']);
    },
  });
  assert.equal(meaning, 'Jepang');
  assert.equal(requested.hostname, 'clients5.google.com');
  assert.deepEqual(requested.searchParams.getAll('q'), ['日本']);
  assert.equal(requested.searchParams.get('sl'), 'ja');
  assert.equal(requested.searchParams.get('tl'), 'id');
});

test('lookupWordMeaning falls back to MyMemory and reports failures', async () => {
  const meaning = await lookupWordMeaning('hello', {
    fetchImpl: async (url) => (String(url).includes('mymemory') ? json({ responseData: { translatedText: 'halo' } }) : json({}, 500)),
  });
  assert.equal(meaning, 'Halo');

  await assert.rejects(lookupWordMeaning(' '), /Isi kata/);
  await assert.rejects(lookupWordMeaning('a', { sourceLanguage: 'id', targetLanguage: 'id' }), /sama/);
  await assert.rejects(lookupWordMeaning('hello', { fetchImpl: async () => json({}, 500) }), /gagal/);
});

/**
 * Fake translation services. Google's dictionary endpoint answers every q on
 * its own; `dictionary` maps a word to its meaning (unknown words get "t:<word>",
 * words mapped to null are echoed back). `dictDown` makes that endpoint fail so
 * the line-based endpoint is used; `failAfter` makes every request fail after n.
 */
function fakeServices({ dictionary = {}, dictDown = false, failAfter = Infinity, candidates = {} } = {}) {
  const calls = [];
  const meaningOf = (word) => (word in dictionary ? (dictionary[word] ?? word) : `t:${word}`);
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (calls.length > failAfter) return json({}, 429);
    if (parsed.hostname === 'inputtools.google.com') {
      const list = candidates[parsed.searchParams.get('text')] ?? [];
      return json(['SUCCESS', [[parsed.searchParams.get('text'), list]]]);
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
  };
  return { fetchImpl, calls };
}

test('translateTerms translates every word on its own, many per request', async () => {
  const terms = Array.from({ length: 250 }, (_, i) => `word${i}`);
  const progress = [];
  const { fetchImpl, calls } = fakeServices();
  const result = await translateTerms(terms, {
    sourceLanguage: 'en',
    targetLanguage: 'id',
    fetchImpl,
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.equal(result.error, '');
  assert.deepEqual(result.meanings, terms.map((t) => `T:${t}`));
  assert.equal(calls.length, 3); // 100 + 100 + 50
  assert.ok(calls.every((url) => url.hostname === 'clients5.google.com'));
  assert.deepEqual(calls[2].searchParams.getAll('q'), terms.slice(200));
  assert.equal(calls[0].searchParams.get('sl'), 'en');
  assert.equal(calls[0].searchParams.get('tl'), 'id');
  assert.deepEqual(progress, [[100, 250], [200, 250], [250, 250]]);
});

test('translateTerms falls back to the line-based endpoint when the dictionary endpoint fails', async () => {
  const { fetchImpl, calls } = fakeServices({ dictDown: true });
  const result = await translateTerms(['a1', 'b2', 'c3'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });
  assert.deepEqual(result.meanings, ['T:a1', 'T:b2', 'T:c3']);
  assert.equal(calls[1].hostname, 'translate.googleapis.com');
  assert.equal(calls[1].searchParams.get('q'), 'a1\nb2\nc3');
});

test('translateTerms keeps partial results and reports a failed request', async () => {
  const terms = Array.from({ length: 150 }, (_, i) => `w${i}`);
  const { fetchImpl } = fakeServices({ failAfter: 1 });
  const result = await translateTerms(terms, { sourceLanguage: 'en', targetLanguage: 'ja', fetchImpl });
  assert.equal(result.meanings.length, 150);
  assert.equal(result.meanings[0], 'T:w0');
  assert.ok(result.meanings.slice(100).every((meaning) => meaning === ''));
  assert.match(result.error, /HTTP 429/);

  const same = await translateTerms(['x'], { sourceLanguage: 'en', targetLanguage: 'en', fetchImpl });
  assert.deepEqual(same.meanings, ['']);
  assert.ok(same.error);
});

test('a translation that only repeats the word is not a meaning', () => {
  assert.equal(isEchoTranslation('みぎ', 'Migi'), true);
  assert.equal(isEchoTranslation('migi', 'migi'), true);
  // Same spelling is a real meaning between Latin-script languages (German "normal" -> English "normal").
  assert.equal(isEchoTranslation('normal', 'Normal', 'de'), false);
  assert.equal(isEchoTranslation('bank', '', 'de'), true);
  assert.equal(isEchoTranslation('みぎ', ''), true);
  assert.equal(isEchoTranslation('みぎ', 'kanan'), false);
  assert.equal(isEchoTranslation('右', 'right'), false);
});

test('hiragana words Google does not recognise are translated through their kanji spelling', async () => {
  const { fetchImpl, calls } = fakeServices({
    dictionary: { みぎ: 'kanan', ひだり: null, 左: 'kiri', はし: null, 橋: 'jembatan' },
    candidates: { ひだり: ['左', 'ひだり'], はし: ['橋', '箸', 'はし'] },
  });
  const result = await translateTerms(['みぎ', 'ひだり', 'はし'], { sourceLanguage: 'ja', targetLanguage: 'id', fetchImpl });
  assert.deepEqual(result.meanings, ['Kanan', 'Kiri', 'Jembatan']);
  // One batch for the words, two kanji lookups, one batch for the kanji.
  assert.deepEqual(calls.map((url) => url.hostname), [
    'clients5.google.com',
    'inputtools.google.com',
    'inputtools.google.com',
    'clients5.google.com',
  ]);
  assert.deepEqual(calls[3].searchParams.getAll('q'), ['左', '橋']);
});

test('the offline dictionary supplies the kanji when Input Tools cannot be reached', async () => {
  assert.equal(await kanjiSpelling('あした', { fetchImpl: async () => json({}, 503), mode: 'any' }), '明日');
  assert.equal(await kanjiSpelling('コーヒー', { fetchImpl: async () => json({}, 503) }), '');
});

test('a word still blank after the batches is tried on its own, ending with MyMemory', async () => {
  let dictCalls = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.mymemory.translated.net') return json({ responseData: { translatedText: 'halo' } });
    if (parsed.hostname === 'clients5.google.com') {
      dictCalls += 1;
      return json(parsed.searchParams.getAll('q').map((q) => (q === 'hello' ? '' : `t:${q}`)));
    }
    return json([[['', 'hello']]]); // gtx finds nothing either
  };
  const result = await translateTerms(['hello', 'cat'], { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });
  assert.deepEqual(result.meanings, ['Halo', 'T:cat']);
  assert.equal(dictCalls, 2); // the batch, then "hello" on its own
});

test('Latin-script words spelled the same in the meaning language keep that meaning', async () => {
  const { fetchImpl, calls } = fakeServices({ dictionary: { normal: 'normal', bank: 'bank', Strand: 'beach' } });
  const result = await translateTerms(['normal', 'bank', 'Strand'], { sourceLanguage: 'de', targetLanguage: 'en', fetchImpl });
  assert.deepEqual(result.meanings, ['Normal', 'Bank', 'Beach']);
  assert.equal(calls.length, 1); // nothing is retried
});
