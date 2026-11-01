import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHiraganaOnly, kanjiSpelling, spellWithKanji } from './kanji.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** Fake Google Input Tools: `table` maps the hiragana text to its candidate list. */
function inputTools(table) {
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

test('only hiragana words are looked up, and the hiragana itself is sent', async () => {
  assert.equal(isHiraganaOnly('みぎ'), true);
  assert.equal(isHiraganaOnly('右'), false);
  assert.equal(isHiraganaOnly('コーヒー'), false);
  const { fetchImpl, asked } = inputTools(TABLE);
  assert.equal(await kanjiSpelling('右', { fetchImpl }), '');
  assert.equal(await kanjiSpelling('コーヒー', { fetchImpl }), '');
  assert.equal(await kanjiSpelling('みぎ', { fetchImpl }), '右');
  assert.deepEqual(asked, ['みぎ']);
});

test('mode "top" keeps words that are normally written in kana', async () => {
  const { fetchImpl } = inputTools(TABLE);
  assert.equal(await kanjiSpelling('ねこ', { fetchImpl }), '猫');
  assert.equal(await kanjiSpelling('する', { fetchImpl }), ''); // not 擦る
  assert.equal(await kanjiSpelling('かわいい', { fetchImpl }), '');
});

test('mode "any" takes the first kanji candidate, for finding a meaning', async () => {
  const { fetchImpl } = inputTools(TABLE);
  assert.equal(await kanjiSpelling('ひだり', { fetchImpl, mode: 'any' }), '左');
  assert.equal(await kanjiSpelling('ひだり', { fetchImpl }), '');
});

test('offline, only exact readings from the built-in dictionary are used', async () => {
  const fetchImpl = async () => json({}, 503);
  assert.equal(await kanjiSpelling('あした', { fetchImpl }), '明日');
  assert.equal(await kanjiSpelling('あ', { fetchImpl }), ''); // no guessing from longer words
});

test('spellWithKanji converts a list and reports progress', async () => {
  const { fetchImpl, asked } = inputTools(TABLE);
  const progress = [];
  const result = await spellWithKanji(['みぎ', '右', 'する', 'ねこ', 'コーヒー'], {
    fetchImpl,
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.deepEqual(result, ['右', '', '', '猫', '']);
  assert.deepEqual(asked.sort(), ['する', 'ねこ', 'みぎ'].sort());
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.deepEqual(await spellWithKanji([], { fetchImpl }), []);
});
