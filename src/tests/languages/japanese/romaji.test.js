import { describe, expect, it } from '@jest/globals';
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
import { decodeStored, loadWords, saveWords, STORAGE_KEY } from '../../../features/vocabulary/storage.js';

describe('kana and romaji', () => {
  it.each([
    ['にほんご', true],
    ['日本語', false],
  ])('should judge %p as kana-only: %p when it is checked', (text, expected) => {
    const result = isKanaOnly(text);

    expect(result).toBe(expected);
  });

  it.each([
    ['にほんご', 'nihongo'],
    ['コーヒー', 'koohii'],
    ['日本', ''],
    ['', ''],
  ])('should read %p as %p when kanaToRomaji runs (kanji cannot be read directly)', (text, expected) => {
    const romaji = kanaToRomaji(text);

    expect(romaji).toBe(expected);
  });

  it.each([
    ['Tōkyō', 'toukyou'],
    ['Maiasa', 'maiasa'],
    [' kōhī ', 'kouhii'],
    [undefined, ''],
  ])('should write %p as %p when Hepburn romaji comes from Google', (input, expected) => {
    const romaji = normalizeRomaji(input);

    expect(romaji).toBe(expected);
  });
});

describe('romajiForWord and needsRomajiLookup', () => {
  it.each([
    [{ wordLanguage: 'ja', term: '毎朝', romaji: 'maiasa' }, 'maiasa'],
    [{ wordLanguage: 'ja', term: 'ねこ' }, 'neko'],
    [{ wordLanguage: 'ja', term: '毎朝' }, ''],
    [{ wordLanguage: 'en', term: 'cat', romaji: 'x' }, ''],
  ])('should give %j the romaji %p when romajiForWord runs', (word, expected) => {
    const romaji = romajiForWord(word);

    expect(romaji).toBe(expected);
  });

  it.each([
    [{ wordLanguage: 'ja', term: '毎朝' }, true],
    [{ wordLanguage: 'ja', term: 'ねこ' }, false],
    [{ wordLanguage: 'en', term: 'cat' }, false],
  ])('should answer %j with %p when needsRomajiLookup runs', (word, expected) => {
    const result = needsRomajiLookup(word);

    expect(result).toBe(expected);
  });
});

describe('extendReadings', () => {
  it('should follow each chosen candidate when the input method is used', () => {
    const afterFirst = extendReadings({}, '', 'nihon', '日本');

    const readings = extendReadings(afterFirst, '日本', 'go', '日本語');

    expect(readings['日本語']).toBe('nihongo');
  });

  it('should need no saved reading when the prefix is kana', () => {
    const readings = {};

    const result = extendReadings(readings, 'お', 'cha', 'お茶');

    expect(result['お茶']).toBe('ocha');
  });

  it('should leave the readings unchanged when the prefix has unknown kanji', () => {
    const readings = {};

    const result = extendReadings(readings, '東', 'kyou', '東京');

    expect(result).toEqual({});
  });
});

describe('fetchRomaji', () => {
  it('should ask Google for the romanization when one word is looked up', async () => {
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

  it('should report the failure when the request fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429 });

    const request = fetchRomaji('東京', { fetchImpl });

    await expect(request).rejects.toThrow(/HTTP 429/);
  });
});

describe('romaji on words', () => {
  it('should carry the reading as romaji when JLPT samples are loaded', () => {
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

  it('should keep romaji only when the word is Japanese', () => {
    const japanese = { term: '毎朝', wordLanguage: 'ja', romaji: 'Maiasa' };
    const english = { term: 'cat', wordLanguage: 'en', romaji: 'nope' };

    const words = [createWord(japanese), createWord(english)];

    expect(words.map((word) => word.romaji)).toEqual(['maiasa', '']);
  });

  it('should keep the romaji when Japanese words are saved and reloaded', () => {
    const data = {};
    const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
    const words = [createWord({ term: '毎朝', wordLanguage: 'ja', romaji: 'maiasa' }), createWord({ term: 'cat', wordLanguage: 'en' })];

    saveWords(words, storage);
    const reloaded = loadWords(storage);
    const raw = JSON.parse(decodeStored(data[STORAGE_KEY])).words;

    expect(raw[0].romaji).toBe('maiasa');
    expect('romaji' in raw[1]).toBe(false);
    expect(reloaded.map((word) => word.romaji)).toEqual(['maiasa', '']);
  });
});

describe('japaneseReading', () => {
  it.each([
    ['a kanji word with saved romaji', { term: '右', romaji: 'migi' }, { kana: 'みぎ', romaji: 'migi' }],
    ['a longer kanji word', { term: '東京', romaji: 'toukyou' }, { kana: 'とうきょう', romaji: 'toukyou' }],
    ['a katakana word (no second kana line)', { term: 'コーヒー' }, { kana: '', romaji: 'koohii' }],
    ['a hiragana word', { term: 'ねこ' }, { kana: '', romaji: 'neko' }],
    ['kanji with no known reading yet', { term: '毎朝' }, { kana: '', romaji: '' }],
    ['romaji that cannot turn back into kana', { term: '一人', romaji: 'ichi-ri' }, { kana: '', romaji: 'ichi-ri' }],
  ])('should return the expected reading when the word is %s', (_, word, expected) => {
    const japaneseWord = { wordLanguage: 'ja', ...word };

    const reading = japaneseReading(japaneseWord);

    expect(reading).toEqual(expected);
  });

  it('should be null when the word is not Japanese', () => {
    const word = { wordLanguage: 'en', term: 'Cat' };

    const reading = japaneseReading(word);

    expect(reading).toBeNull();
  });
});
