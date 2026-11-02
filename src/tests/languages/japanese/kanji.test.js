import { describe, expect, test } from '@jest/globals';
import { isHiraganaOnly, kanjiSpelling, spellWithKanji } from '../../../languages/japanese/kanji.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** Fake Google Input Tools: `table` maps the hiragana text to its candidate list. */
function inputTools(table = TABLE) {
  const asked = [];
  const fetchImpl = async (url) => {
    const text = new URL(url).searchParams.get('text');
    asked.push(text);
    return json(['SUCCESS', [[text, table[text] ?? [text]]]]);
  };
  return { fetchImpl, asked };
}

const TABLE = {
  みぎ: ['右', 'みぎ', 'ミギ'],
  ねこ: ['猫', 'ねこ'],
  する: ['する', '刷る', '擦る'],
  かわいい: ['かわいい', '可愛い'],
  ひだり: ['ひだり', '左'],
};

const offline = async () => json({}, 503);

describe('isHiraganaOnly', () => {
  test.each([
    ['みぎ', true],
    ['右', false],
    ['コーヒー', false],
  ])('isHiraganaOnly(%p) is %p', (text, expected) => {
    const result = isHiraganaOnly(text);

    expect(result).toBe(expected);
  });
});

describe('kanjiSpelling', () => {
  test('sends the hiragana itself and returns the kanji', async () => {
    const { fetchImpl, asked } = inputTools();

    const kanji = await kanjiSpelling('みぎ', { fetchImpl });

    expect(kanji).toBe('右');
    expect(asked).toEqual(['みぎ']);
  });

  test.each(['右', 'コーヒー'])('does not look up %p, which is not hiragana', async (term) => {
    const { fetchImpl, asked } = inputTools();

    const kanji = await kanjiSpelling(term, { fetchImpl });

    expect(kanji).toBe('');
    expect(asked).toEqual([]);
  });

  test.each([
    ['ねこ', '猫'],
    ['する', ''], // not 擦る
    ['かわいい', ''],
  ])('mode "top" follows how %p is normally written', async (kana, expected) => {
    const { fetchImpl } = inputTools();

    const kanji = await kanjiSpelling(kana, { fetchImpl });

    expect(kanji).toBe(expected);
  });

  test('mode "any" takes the first kanji candidate, for finding a meaning', async () => {
    const { fetchImpl } = inputTools();

    const any = await kanjiSpelling('ひだり', { fetchImpl, mode: 'any' });
    const top = await kanjiSpelling('ひだり', { fetchImpl });

    expect(any).toBe('左');
    expect(top).toBe('');
  });

  test('offline, an exact reading from the built-in dictionary is used', async () => {
    const kana = 'あした';

    const kanji = await kanjiSpelling(kana, { fetchImpl: offline });

    expect(kanji).toBe('明日');
  });

  test('offline, nothing is guessed from longer words', async () => {
    const kana = 'あ';

    const kanji = await kanjiSpelling(kana, { fetchImpl: offline });

    expect(kanji).toBe('');
  });
});

describe('spellWithKanji', () => {
  test('converts the hiragana words of a list and reports progress', async () => {
    const { fetchImpl, asked } = inputTools();
    const progress = [];
    const onProgress = (done, total) => progress.push([done, total]);

    const result = await spellWithKanji(['みぎ', '右', 'する', 'ねこ', 'コーヒー'], { fetchImpl, onProgress });

    expect(result).toEqual(['右', '', '', '猫', '']);
    expect([...asked].sort()).toEqual(['する', 'ねこ', 'みぎ'].sort());
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  test('returns an empty list for no words', async () => {
    const { fetchImpl } = inputTools();

    const result = await spellWithKanji([], { fetchImpl });

    expect(result).toEqual([]);
  });
});
