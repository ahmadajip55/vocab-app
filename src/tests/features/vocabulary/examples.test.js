import { describe, expect, jest, test } from '@jest/globals';
import { findExamples, pickTatoebaExamples, primaryTerm } from '../../../features/vocabulary/examples.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const sentence = (text, lang, translation) => ({
  text,
  lang,
  translations: translation ? [[{ text: translation, lang: 'ind' }], []] : [[], []],
});

/** Fake Tatoeba: `translated` answers the search for translated sentences, `any` the search for all of them. */
function fakeTatoeba({ translated = [], any = [] } = {}) {
  return jest.fn(async (url) => json({ results: new URL(url).searchParams.has('to') ? translated : any }));
}

describe('primaryTerm', () => {
  test.each([
    ['reluctant, hesitant', 'reluctant'],
    ['飲む（のむ）', '飲む'],
  ])('uses the first word of %p', (term, expected) => {
    const result = primaryTerm(term);

    expect(result).toBe(expected);
  });
});

describe('pickTatoebaExamples', () => {
  test('prefers sentences that contain the word and have a translation', () => {
    const payload = {
      results: [
        sentence('Aku suka kopi.', 'ind'),
        sentence('毎日コーヒーを飲みます。', 'jpn'),
        sentence('私は日本に住んでいます。', 'jpn', 'Saya tinggal di Jepang.'),
        sentence('日本', 'jpn'),
      ],
    };

    const [best] = pickTatoebaExamples(payload, '日本', { from: 'jpn', to: 'ind' });

    expect(best).toEqual({ sentence: '私は日本に住んでいます。', translation: 'Saya tinggal di Jepang.' });
  });

  test.each([[{ results: [] }], [null]])('finds nothing in %j', (payload) => {
    const picked = pickTatoebaExamples(payload, 'x');

    expect(picked).toEqual([]);
  });

  test('matches Latin words as whole words only', () => {
    const payload = { results: [sentence('The catalog is large and very old.', 'eng'), sentence('The cat sleeps on the sofa.', 'eng')] };

    const [best] = pickTatoebaExamples(payload, 'cat', { from: 'eng' });

    expect(best.sentence).toBe('The cat sleeps on the sofa.');
  });

  describe('with many sentences', () => {
    const payload = {
      results: [
        sentence('Makanan ini enak sekali.', 'ind', 'This food is delicious.'),
        sentence('Saya makan nasi setiap hari.', 'ind', 'Saya makan nasi.'),
        sentence('Kami makan bersama di rumah.', 'ind'),
        sentence('Saya makan nasi setiap hari.', 'ind', 'dup'),
        sentence('Mereka sudah makan siang tadi.', 'ind', 'They had lunch.'),
        sentence('Dia makan apel merah di taman.', 'ind', 'She eats an apple.'),
      ],
    };

    test('returns three distinct sentences that use the word (not "makanan")', () => {
      const options = { from: 'ind', to: 'ind' };

      const picked = pickTatoebaExamples(payload, 'makan', options);

      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((item) => item.sentence)).size).toBe(3);
      expect(picked.every((item) => /\bmakan\b/i.test(item.sentence))).toBe(true);
    });

    test('puts translated sentences first', () => {
      const options = { from: 'ind', to: 'ind' };

      const picked = pickTatoebaExamples(payload, 'makan', options);

      expect(picked.slice(0, 2).every((item) => item.translation)).toBe(true);
    });

    test('respects the limit', () => {
      const options = { from: 'ind', limit: 1 };

      const picked = pickTatoebaExamples(payload, 'makan', options);

      expect(picked).toHaveLength(1);
    });
  });
});

describe('findExamples', () => {
  test('a Japanese word gets Japanese sentences, asked with the right Tatoeba codes', async () => {
    const fetchImpl = fakeTatoeba({ translated: [sentence('私は日本に住んでいます。', 'jpn', 'Saya tinggal di Jepang.')] });

    const [found] = await findExamples('日本', { sourceLanguage: 'ja', targetLanguage: 'id', limit: 1, fetchImpl });

    expect(found).toEqual({ sentence: '私は日本に住んでいます。', translation: 'Saya tinggal di Jepang.', source: 'tatoeba' });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect([url.searchParams.get('from'), url.searchParams.get('to'), url.searchParams.get('query')]).toEqual(['jpn', 'ind', '日本']);
  });

  test.each([
    ['en', 'eng'],
    ['id', 'ind'],
    ['es', 'spa'],
    ['de', 'deu'],
    ['fr', 'fra'],
    ['it', 'ita'],
    ['nl', 'nld'],
    ['pt', 'por'],
    ['pl', 'pol'],
  ])('%s searches Tatoeba in its own language (%s)', async (code, tatoeba) => {
    const fetchImpl = fakeTatoeba();

    await findExamples('palabra', { sourceLanguage: code, targetLanguage: 'ja', fetchImpl });

    const params = new URL(fetchImpl.mock.calls[0][0]).searchParams;
    expect([params.get('from'), params.get('to')]).toEqual([tatoeba, 'jpn']);
  });

  test('tops up with untranslated sentences, translated ones first', async () => {
    const fetchImpl = fakeTatoeba({
      translated: [sentence('I was reluctant to go.', 'eng', 'Saya enggan pergi.')],
      any: [sentence('I was reluctant to go.', 'eng'), sentence('She is reluctant to speak.', 'eng'), sentence('He seemed reluctant at first.', 'eng')],
    });

    const found = await findExamples('reluctant', { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(found[0]).toEqual({ sentence: 'I was reluctant to go.', translation: 'Saya enggan pergi.', source: 'tatoeba' });
    expect(found.slice(1).map((item) => item.sentence).sort()).toEqual(['He seemed reluctant at first.', 'She is reluctant to speak.']);
    expect(found.slice(1).every((item) => item.translation === '')).toBe(true);
  });

  test('stops searching once it has enough sentences', async () => {
    const fetchImpl = fakeTatoeba({
      translated: [sentence('I was reluctant to go.', 'eng', 'Saya enggan pergi.')],
      any: [sentence('She is reluctant to speak.', 'eng'), sentence('He seemed reluctant at first.', 'eng')],
    });

    await findExamples('reluctant', { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    const searches = fetchImpl.mock.calls.map(([url]) => new URL(url).searchParams.has('to'));
    expect(searches).toEqual([true, false]); // translated, then all; the dictionary is not asked
  });

  test('English falls back to the free dictionary when Tatoeba has nothing', async () => {
    const fetchImpl = async (url) =>
      String(url).includes('dictionaryapi')
        ? json([{ meanings: [{ definitions: [{ definition: 'x' }, { example: 'She persuaded him to stay.' }] }] }])
        : json({ results: [] });

    const found = await findExamples('persuade', { sourceLanguage: 'en', targetLanguage: 'id', fetchImpl });

    expect(found).toEqual([{ sentence: 'She persuaded him to stay.', translation: '', source: 'dictionary' }]);
  });

  test('finds nothing when no source has a sentence', async () => {
    const fetchImpl = fakeTatoeba();

    const found = await findExamples('猫', { sourceLanguage: 'ja', fetchImpl });

    expect(found).toEqual([]);
  });

  test('looks up nothing for a blank word', async () => {
    const fetchImpl = jest.fn();

    const found = await findExamples(' ', { fetchImpl });

    expect(found).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ['no connection', async () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', async () => json({}, 503)],
  ])('reports %s as a connection problem, not as "no example"', async (_, fetchImpl) => {
    const search = findExamples('猫', { sourceLanguage: 'ja', fetchImpl });

    await expect(search).rejects.toThrow(/koneksi/);
  });
});
