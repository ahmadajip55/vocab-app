import { describe, expect, it } from '@jest/globals';
import { completeJapanese, prepareImport, toSavedForm } from '../../../features/import/prepareImport.js';
import { createProgram } from '../../../features/vocabulary/programs.js';
import { createWord } from '../../../features/vocabulary/model.js';

const row = (row, term, meaning = '', extra = {}) => ({ row, term, meaning, ...extra });
const parsed = (...words) => ({ fatal: null, issues: [], words });

/** Online lookups that answer from small tables and record what they were asked. */
function lookups({ kanji = {}, readings = {}, meanings = {}, error = '' } = {}) {
  const asked = { spell: [], readingOf: [], translate: [] };
  return {
    asked,
    spell: async (terms) => {
      asked.spell.push(...terms);
      return terms.map((term) => kanji[term] ?? '');
    },
    readingOf: async (term) => {
      asked.readingOf.push(term);
      return readings[term] ?? '';
    },
    translate: async (terms, options) => {
      asked.translate.push({ terms, options });
      return { meanings: terms.map((term) => meanings[term] ?? ''), error };
    },
  };
}

describe('toSavedForm', () => {
  it('should write words and meanings in Title Case when the program is not Japanese', () => {
    const words = [row(1, 'deadLINE', 'tenggat waktu')];

    const result = toSavedForm(words, { wordLanguage: 'en' });

    expect(result.map((w) => [w.term, w.meaning])).toEqual([['Deadline', 'Tenggat Waktu']]);
  });

  it('should turn romaji into hiragana when the program is Japanese', () => {
    const words = [row(1, 'Migi', 'kanan')];

    const result = toSavedForm(words, { wordLanguage: 'ja' });

    expect(result[0].term).toBe('みぎ');
  });

  it.each([
    [false, []],
    [true, [2]],
  ])('should keep a row with only a reading when kanji is %p', (kanji, rows) => {
    const words = [row(2, '', 'water', { kana: 'みず' })];

    const result = toSavedForm(words, { wordLanguage: 'ja', kanji });

    expect(result.map((w) => w.row)).toEqual(rows);
  });
});

describe('completeJapanese', () => {
  it('should spell a hiragana word with kanji and keep the hiragana as its reading when kanji is found', async () => {
    const fake = lookups({ kanji: { みぎ: '右' } });

    const [word] = await completeJapanese([row(1, 'みぎ')], fake);

    expect([word.term, word.kana, word.romaji, word.reading]).toEqual(['右', 'みぎ', 'migi', 'みぎ']);
  });

  it('should take the reading from the romaji column when the row has one', async () => {
    const fake = lookups();

    const [word] = await completeJapanese([row(1, '日本', '', { romaji: 'nihon' })], { kanji: true, ...fake });

    expect([word.kana, word.romaji]).toEqual(['にほん', 'nihon']);
    expect(fake.asked.readingOf).toEqual([]);
  });

  it('should look up the reading of a kanji word when a kanji program row has none', async () => {
    const fake = lookups({ readings: { 先生: 'せんせい' } });

    const [word] = await completeJapanese([row(1, '先生')], { kanji: true, ...fake });

    expect([word.kana, word.romaji]).toEqual(['せんせい', 'sensei']);
  });

  it('should not look up readings when the program is not a kanji program', async () => {
    const fake = lookups({ readings: { 先生: 'せんせい' } });

    const [word] = await completeJapanese([row(1, '先生')], fake);

    expect(fake.asked.readingOf).toEqual([]);
    expect(word.reading).toBe('');
  });

  it('should report each step when progress is followed', async () => {
    const fake = lookups();
    const steps = [];

    await completeJapanese([row(1, '先生')], { kanji: true, onProgress: (text) => steps.push(text), ...fake });

    expect(steps).toEqual(['Looking up kanji…', 'Looking up readings: 0 of 1…']);
  });
});

describe('prepareImport', () => {
  const english = createProgram('English', 'en');

  it('should return the fatal error when the rows cannot be used', async () => {
    const read = { fatal: 'Maksimal 100 kata per impor.', words: [] };

    const result = await prepareImport(read, { program: english, existing: [], meaningLanguage: 'id' });

    expect(result).toEqual({ fatal: 'Maksimal 100 kata per impor.' });
  });

  it('should translate only blank meanings when some rows have one', async () => {
    const fake = lookups({ meanings: { Thrive: 'Berkembang' } });
    const read = parsed(row(1, 'thrive'), row(2, 'deadline', 'tenggat'));

    const result = await prepareImport(read, { program: english, existing: [], meaningLanguage: 'id', lookups: fake });

    expect(fake.asked.translate.map((call) => call.terms)).toEqual([['Thrive']]);
    expect(result.parsed.words.map((w) => [w.term, w.meaning, Boolean(w.translated)])).toEqual([
      ['Thrive', 'Berkembang', true],
      ['Deadline', 'Tenggat', false],
    ]);
    expect(result.translation).toEqual({ requested: 1, found: 1, error: '' });
  });

  it('should not translate words that are already in the program when they have a blank meaning', async () => {
    const fake = lookups();
    const existing = [createWord({ term: 'Thrive', meaning: 'Berkembang', wordLanguage: 'en', meaningLanguage: 'id' })];

    const result = await prepareImport(parsed(row(1, 'thrive')), { program: english, existing, meaningLanguage: 'id', lookups: fake });

    expect(fake.asked.translate).toEqual([]);
    expect(result.translation.requested).toBe(0);
  });

  it('should keep the translator error when some meanings are not found', async () => {
    const fake = lookups({ error: 'The translator is not reachable.' });

    const result = await prepareImport(parsed(row(1, 'thrive')), { program: english, existing: [], meaningLanguage: 'id', lookups: fake });

    expect(result.translation).toEqual({ requested: 1, found: 0, error: 'The translator is not reachable.' });
    expect(result.parsed.words[0].meaning).toBe('');
  });

  it('should translate from the program language into the meaning language when meanings are looked up', async () => {
    const fake = lookups();
    const japanese = createProgram('Japanese', 'ja');

    await prepareImport(parsed(row(1, 'mizu')), { program: japanese, existing: [], meaningLanguage: 'en', lookups: fake });

    expect(fake.asked.translate[0].options).toMatchObject({ sourceLanguage: 'ja', targetLanguage: 'en' });
  });

  it('should complete kanji, kana and meaning when a kanji program row has only a reading', async () => {
    const fake = lookups({ kanji: { みず: '水' }, meanings: { 水: 'Water' } });
    const program = createProgram('Kanji', 'ja', [], { script: 'kanji' });

    const result = await prepareImport(parsed(row(1, '', '', { kana: 'みず' })), { program, existing: [], meaningLanguage: 'en', lookups: fake });

    expect(result.parsed.words[0]).toMatchObject({ term: '水', kana: 'みず', romaji: 'mizu', meaning: 'Water' });
  });
});
