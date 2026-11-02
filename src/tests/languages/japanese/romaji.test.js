import { describe, expect, test } from '@jest/globals';
import {
  extendReadings,
  fetchRomaji,
  isKanaOnly,
  japaneseReading,
  kanaToRomaji,
  needsRomajiLookup,
  normalizeRomaji,
  romajiForWord,
} from '../../../languages/japanese/romaji.js';
import { createWord } from '../../../features/vocabulary/model.js';
import { parseJlptEntries } from '../../../features/vocabulary/sampleSource.js';
import { loadWords, saveWords, STORAGE_KEY } from '../../../features/vocabulary/storage.js';

describe('kana and romaji', () => {
  test.each([
    ['にほんご', true],
    ['日本語', false],
  ])('isKanaOnly(%p) is %p', (text, expected) => {
    const result = isKanaOnly(text);

    expect(result).toBe(expected);
  });

  test.each([
    ['にほんご', 'nihongo'],
    ['コーヒー', 'koohii'],
    ['日本', ''],
    ['', ''],
  ])('kanaToRomaji(%p) is %p (kanji cannot be read directly)', (text, expected) => {
    const romaji = kanaToRomaji(text);

    expect(romaji).toBe(expected);
  });

  test.each([
    ['Tōkyō', 'toukyou'],
    ['Maiasa', 'maiasa'],
    [' kōhī ', 'kouhii'],
    [undefined, ''],
  ])('Hepburn %p from Google is written like wanakana: %p', (input, expected) => {
    const romaji = normalizeRomaji(input);

    expect(romaji).toBe(expected);
  });
});

describe('romajiForWord and needsRomajiLookup', () => {
  test.each([
    [{ wordLanguage: 'ja', term: '毎朝', romaji: 'maiasa' }, 'maiasa'],
    [{ wordLanguage: 'ja', term: 'ねこ' }, 'neko'],
    [{ wordLanguage: 'ja', term: '毎朝' }, ''],
    [{ wordLanguage: 'en', term: 'cat', romaji: 'x' }, ''],
  ])('romajiForWord(%j) is %p', (word, expected) => {
    const romaji = romajiForWord(word);

    expect(romaji).toBe(expected);
  });

  test.each([
    [{ wordLanguage: 'ja', term: '毎朝' }, true],
    [{ wordLanguage: 'ja', term: 'ねこ' }, false],
    [{ wordLanguage: 'en', term: 'cat' }, false],
  ])('needsRomajiLookup(%j) is %p', (word, expected) => {
    const result = needsRomajiLookup(word);

    expect(result).toBe(expected);
  });
});

describe('extendReadings', () => {
  test('follows each candidate chosen in the input method', () => {
    const afterFirst = extendReadings({}, '', 'nihon', '日本');

    const readings = extendReadings(afterFirst, '日本', 'go', '日本語');

    expect(readings['日本語']).toBe('nihongo');
  });

  test('a kana prefix needs no saved reading', () => {
    const readings = {};

    const result = extendReadings(readings, 'お', 'cha', 'お茶');

    expect(result['お茶']).toBe('ocha');
  });

  test('a prefix with unknown kanji (edited by hand) leaves the readings unchanged', () => {
    const readings = {};

    const result = extendReadings(readings, '東', 'kyou', '東京');

    expect(result).toEqual({});
  });
});

describe('fetchRomaji', () => {
  test('asks Google for the romanization of one word', async () => {
    let asked;
    const fetchImpl = async (url) => {
      asked = new URL(url);
      return { ok: true, json: async () => [[[null, null, null, 'Tōkyō']]] };
    };

    const romaji = await fetchRomaji('東京', { fetchImpl });

    expect(romaji).toBe('toukyou');
    expect(asked.searchParams.get('sl')).toBe('ja');
    expect(asked.searchParams.get('dt')).toBe('rm');
    expect(asked.searchParams.get('q')).toBe('東京');
  });

  test('reports a failed request', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429 });

    const request = fetchRomaji('東京', { fetchImpl });

    await expect(request).rejects.toThrow(/HTTP 429/);
  });
});

describe('romaji on words', () => {
  test('JLPT samples carry their reading as romaji', () => {
    const data = {
      words: [
        { word: '毎朝', furigana: 'まいあさ', romaji: 'maiasa' },
        { word: 'センス', furigana: '', romaji: 'sensu' },
        { word: '同居', furigana: 'どうきょ', romaji: 'dōkyo' },
      ],
    };

    const entries = parseJlptEntries(data);

    expect(entries).toEqual([
      { term: '毎朝', romaji: 'maiasa' },
      { term: 'センス', romaji: 'sensu' },
      { term: '同居', romaji: 'doukyo' },
    ]);
  });

  test('is kept on Japanese words only', () => {
    const japanese = { term: '毎朝', wordLanguage: 'ja', romaji: 'Maiasa' };
    const english = { term: 'cat', wordLanguage: 'en', romaji: 'nope' };

    const words = [createWord(japanese), createWord(english)];

    expect(words.map((word) => word.romaji)).toEqual(['maiasa', '']);
  });

  test('is saved for Japanese words and survives a reload', () => {
    const data = {};
    const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
    const words = [createWord({ term: '毎朝', wordLanguage: 'ja', romaji: 'maiasa' }), createWord({ term: 'cat', wordLanguage: 'en' })];

    saveWords(words, storage);
    const reloaded = loadWords(storage);

    const raw = JSON.parse(data[STORAGE_KEY]).words;
    expect(raw[0].romaji).toBe('maiasa');
    expect('romaji' in raw[1]).toBe(false);
    expect(reloaded.map((word) => word.romaji)).toEqual(['maiasa', '']);
  });
});

describe('japaneseReading', () => {
  test.each([
    ['a kanji word with saved romaji', { term: '右', romaji: 'migi' }, { kana: 'みぎ', romaji: 'migi' }],
    ['a longer kanji word', { term: '東京', romaji: 'toukyou' }, { kana: 'とうきょう', romaji: 'toukyou' }],
    ['a katakana word (no second kana line)', { term: 'コーヒー' }, { kana: '', romaji: 'koohii' }],
    ['a hiragana word', { term: 'ねこ' }, { kana: '', romaji: 'neko' }],
    ['kanji with no known reading yet', { term: '毎朝' }, { kana: '', romaji: '' }],
    ['romaji that cannot turn back into kana', { term: '一人', romaji: 'ichi-ri' }, { kana: '', romaji: 'ichi-ri' }],
  ])('%s', (_, word, expected) => {
    const japaneseWord = { wordLanguage: 'ja', ...word };

    const reading = japaneseReading(japaneseWord);

    expect(reading).toEqual(expected);
  });

  test('is null for other languages', () => {
    const word = { wordLanguage: 'en', term: 'Cat' };

    const reading = japaneseReading(word);

    expect(reading).toBeNull();
  });
});
