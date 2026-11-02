import { describe, expect, it } from '@jest/globals';
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
  it.each([
    ['みぎ', true],
    ['右', false],
    ['コーヒー', false],
  ])('should judge %p as hiragana-only: %p when it is checked', (text, expected) => {
    const result = isHiraganaOnly(text);

    expect(result).toBe(expected);
  });
});

describe('kanjiSpelling', () => {
  it('should send the hiragana and return the kanji when a spelling is looked up', async () => {
    const { fetchImpl, asked } = inputTools();

    const kanji = await kanjiSpelling('みぎ', { fetchImpl });

    expect(kanji).toBe('右');
    expect(asked).toEqual(['みぎ']);
  });

  it.each(['右', 'コーヒー'])('should not look up %p when it is not hiragana', async (term) => {
    const { fetchImpl, asked } = inputTools();

    const kanji = await kanjiSpelling(term, { fetchImpl });

    expect(kanji).toBe('');
    expect(asked).toEqual([]);
  });

  it.each([
    ['ねこ', '猫'],
    ['する', ''], // not 擦る
    ['かわいい', ''],
  ])('should follow how %p is normally written when the mode is "top"', async (kana, expected) => {
    const { fetchImpl } = inputTools();

    const kanji = await kanjiSpelling(kana, { fetchImpl });

    expect(kanji).toBe(expected);
  });

  it('should take the first kanji candidate when the mode is "any"', async () => {
    const { fetchImpl } = inputTools();

    const any = await kanjiSpelling('ひだり', { fetchImpl, mode: 'any' });
    const top = await kanjiSpelling('ひだり', { fetchImpl });

    expect(any).toBe('左');
    expect(top).toBe('');
  });

  it('should use an exact reading from the built-in dictionary when offline', async () => {
    const kana = 'あした';

    const kanji = await kanjiSpelling(kana, { fetchImpl: offline });

    expect(kanji).toBe('明日');
  });

  it('should guess nothing from longer words when offline', async () => {
    const kana = 'あ';

    const kanji = await kanjiSpelling(kana, { fetchImpl: offline });

    expect(kanji).toBe('');
  });
});

describe('spellWithKanji', () => {
  it('should convert the hiragana words and report progress when a list is spelled', async () => {
    const { fetchImpl, asked } = inputTools();
    const progress = [];
    const onProgress = (done, total) => progress.push([done, total]);

    const result = await spellWithKanji(['みぎ', '右', 'する', 'ねこ', 'コーヒー'], { fetchImpl, onProgress });

    expect(result).toEqual(['右', '', '', '猫', '']);
    expect([...asked].sort()).toEqual(['する', 'ねこ', 'みぎ'].sort());
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it('should return an empty list when there are no words', async () => {
    const { fetchImpl } = inputTools();

    const result = await spellWithKanji([], { fetchImpl });

    expect(result).toEqual([]);
  });
});
