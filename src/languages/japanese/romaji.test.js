import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extendReadings,
  fetchRomaji,
  isKanaOnly,
  japaneseReading,
  kanaToRomaji,
  needsRomajiLookup,
  normalizeRomaji,
  romajiForWord,
} from './romaji.js';
import { createWord } from '../../features/vocabulary/model.js';
import { parseJlptEntries } from '../../features/vocabulary/sampleSource.js';
import { loadWords, saveWords, STORAGE_KEY } from '../../features/vocabulary/storage.js';

test('kana becomes romaji directly; kanji does not', () => {
  assert.equal(isKanaOnly('にほんご'), true);
  assert.equal(isKanaOnly('日本語'), false);
  assert.equal(kanaToRomaji('にほんご'), 'nihongo');
  assert.equal(kanaToRomaji('コーヒー'), 'koohii');
  assert.equal(kanaToRomaji('日本'), '');
  assert.equal(kanaToRomaji(''), '');
});

test('Hepburn from Google is written in the same style as wanakana', () => {
  assert.equal(normalizeRomaji('Tōkyō'), 'toukyou');
  assert.equal(normalizeRomaji('Maiasa'), 'maiasa');
  assert.equal(normalizeRomaji(' kōhī '), 'kouhii');
  assert.equal(normalizeRomaji(undefined), '');
});

test('romajiForWord prefers the saved reading and only applies to Japanese', () => {
  assert.equal(romajiForWord({ wordLanguage: 'ja', term: '毎朝', romaji: 'maiasa' }), 'maiasa');
  assert.equal(romajiForWord({ wordLanguage: 'ja', term: 'ねこ' }), 'neko');
  assert.equal(romajiForWord({ wordLanguage: 'ja', term: '毎朝' }), '');
  assert.equal(romajiForWord({ wordLanguage: 'en', term: 'cat', romaji: 'x' }), '');
  assert.equal(needsRomajiLookup({ wordLanguage: 'ja', term: '毎朝' }), true);
  assert.equal(needsRomajiLookup({ wordLanguage: 'ja', term: 'ねこ' }), false);
  assert.equal(needsRomajiLookup({ wordLanguage: 'en', term: 'cat' }), false);
});

test('the reading typed in the input method follows each chosen candidate', () => {
  let readings = {};
  readings = extendReadings(readings, '', 'nihon', '日本');
  readings = extendReadings(readings, '日本', 'go', '日本語');
  assert.equal(readings['日本語'], 'nihongo');
  // A kana prefix needs no saved reading.
  assert.equal(extendReadings({}, 'お', 'cha', 'お茶')['お茶'], 'ocha');
  // A prefix with unknown kanji (edited by hand) leaves the readings unchanged.
  assert.deepEqual(extendReadings({}, '東', 'kyou', '東京'), {});
});

test('fetchRomaji asks Google for a romanization of one word', async () => {
  let asked;
  const fetchImpl = async (url) => {
    asked = new URL(url);
    return { ok: true, json: async () => [[[null, null, null, 'Tōkyō']]] };
  };
  assert.equal(await fetchRomaji('東京', { fetchImpl }), 'toukyou');
  assert.equal(asked.searchParams.get('sl'), 'ja');
  assert.equal(asked.searchParams.get('dt'), 'rm');
  assert.equal(asked.searchParams.get('q'), '東京');
  await assert.rejects(fetchRomaji('東京', { fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
});

test('JLPT samples carry their reading as romaji', () => {
  const entries = parseJlptEntries({
    words: [
      { word: '毎朝', furigana: 'まいあさ', romaji: 'maiasa' },
      { word: 'センス', furigana: '', romaji: 'sensu' },
      { word: '同居', furigana: 'どうきょ', romaji: 'dōkyo' },
    ],
  });
  assert.deepEqual(entries, [
    { term: '毎朝', romaji: 'maiasa' },
    { term: 'センス', romaji: 'sensu' },
    { term: '同居', romaji: 'doukyo' },
  ]);
});

test('romaji is kept on Japanese words only and survives a reload', () => {
  const ja = createWord({ term: '毎朝', wordLanguage: 'ja', romaji: 'Maiasa' });
  const en = createWord({ term: 'cat', wordLanguage: 'en', romaji: 'nope' });
  assert.equal(ja.romaji, 'maiasa');
  assert.equal(en.romaji, '');

  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
  saveWords([ja, en], storage);
  const raw = JSON.parse(data[STORAGE_KEY]).words;
  assert.equal(raw[0].romaji, 'maiasa');
  assert.equal('romaji' in raw[1], false);
  assert.deepEqual(loadWords(storage).map((w) => w.romaji), ['maiasa', '']);
});

test('japaneseReading gives the kana reading of kanji words and romaji for every Japanese word', () => {
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: '右', romaji: 'migi' }), { kana: 'みぎ', romaji: 'migi' });
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: '東京', romaji: 'toukyou' }), { kana: 'とうきょう', romaji: 'toukyou' });
  // Already in kana: no second kana line, romaji only.
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: 'コーヒー' }), { kana: '', romaji: 'koohii' });
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: 'ねこ' }), { kana: '', romaji: 'neko' });
  // Kanji with no known reading yet (looked up online by the card).
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: '毎朝' }), { kana: '', romaji: '' });
  // Romaji that does not turn back into kana is still shown, without kana.
  assert.deepEqual(japaneseReading({ wordLanguage: 'ja', term: '一人', romaji: 'ichi-ri' }), { kana: '', romaji: 'ichi-ri' });
  assert.equal(japaneseReading({ wordLanguage: 'en', term: 'Cat' }), null);
});
