import { describe, expect, it } from '@jest/globals';
import { detectColumns } from '../../../features/import/columns.js';
import { IMPORT_LIMITS, parsePastedText, rowsToWords } from '../../../features/import/parseVocabularyRows.js';
import { planImport } from '../../../features/import/planImport.js';
import { parseDelimited } from '../../../lib/csv.js';
import { buildTemplateXlsx, buildWordsXlsx } from '../../../features/import/spreadsheetFiles.js';

const pairs = (words) => words.map((word) => [word.term, word.meaning]);
const lines = (count) => Array.from({ length: count }, (_, i) => `word${i}, arti${i}`).join('\n');
const PASTE_LIMITS = { maxRows: IMPORT_LIMITS.maxPastedRows, source: 'Teks ini' };

describe('detectColumns', () => {
  it.each([
    [['Arti', 'Kata', 'Kategori'], { term: 1, meaning: 0 }],
    [['Word', 'Translation', 'Example Sentence'], { term: 0, meaning: 1 }],
    [['Word', 'Meaning result'], { term: 0, meaning: 1 }],
    [['apple', 'apel'], {}],
  ])('should match the columns when the headers are %j', (header, expected) => {
    const columns = detectColumns(header);

    expect(columns).toEqual(expected);
  });
});

describe('rowsToWords', () => {
  it('should report spreadsheet row numbers when the file has a header row', () => {
    const rows = [
      ['Kata', 'Arti', 'Contoh', 'Kategori'],
      ['reluctant', 'enggan', 'She was reluctant.', 'Sehari-hari'],
      [null, null, null, null],
      ['deadline', 'tenggat', null, 'Kantor'],
    ];

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(true);
    expect(result.fatal).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.words.map((w) => [w.row, w.term, w.meaning])).toEqual([
      [2, 'reluctant', 'enggan'],
      [4, 'deadline', 'tenggat'],
    ]);
  });

  it('should ignore unknown columns when the columns are reordered', () => {
    const rows = [
      ['No', 'Arti', 'Kata'],
      [1, 'apel', 'apple'],
    ];

    const result = rowsToWords(rows);

    expect(pairs(result.words)).toEqual([['apple', 'apel']]);
  });

  it('should read column A as the word and column B as the meaning when there is no header', () => {
    const rows = [
      ['apple', 'apel', 'An apple a day.', 'Buah'],
      ['book', 'buku'],
    ];

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(false);
    expect(pairs(result.words)).toEqual([
      ['apple', 'apel'],
      ['book', 'buku'],
    ]);
  });

  it('should flag the row and keep going when a row is incomplete or too long', () => {
    const rows = [
      ['Kata', 'Arti'],
      ['only term', ''],
      ['', 'only meaning'],
      ['x'.repeat(200), 'too long'],
      ['good', 'bagus'],
    ];

    const result = rowsToWords(rows);

    expect(result.words).toHaveLength(2);
    expect(result.issues.map((issue) => issue.row)).toEqual([3, 4]);
    expect(result.issues[0].reason).toMatch(/Kata kosong/);
    expect(result.issues[1].reason).toMatch(/terlalu panjang/);
  });

  it('should flag the row when the meaning is too long', () => {
    const rows = [['Word', 'Meaning'], ['cat', 'kucing'], ['dog', 'x'.repeat(401)]];

    const result = rowsToWords(rows);

    expect(result.issues[0].reason).toMatch(/Arti terlalu panjang/);
  });

  it.each([
    ['an empty file', [], /tidak berisi data/],
    ['a header without a word column', [['Arti', 'Contoh'], ['a', 'b']], /kolom "Kata"/],
    ['only a header row', [['Kata', 'Arti']], /Hanya ada baris judul/],
    [
      'more rows than allowed',
      [['Kata', 'Arti'], ...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => [`w${i}`, 'm'])],
      /Maksimal/,
    ],
  ])('should give a clear fatal error when the file is %s', (_, rows, message) => {
    const result = rowsToWords(rows);

    expect(result.fatal).toMatch(message);
  });

  it('should convert the cells to text when they hold numbers or dates', () => {
    const rows = [['Kata'], [2024, new Date('2024-05-06T00:00:00Z')]];

    const [word] = rowsToWords(rows).words;

    expect([word.term, word.meaning]).toEqual(['2024', '']);
  });

  it('should read the rows when the text is tab-separated', () => {
    const rows = parseDelimited('Kata\tArti\napple\tapel\nbook\tbuku');

    const result = rowsToWords(rows);

    expect(result.words.map((word) => word.term)).toEqual(['apple', 'book']);
  });
});

describe('parsePastedText', () => {
  it('should keep later commas in the meaning when a line is "word, meaning"', () => {
    const text = 'persuade, membujuk\nthrive, tumbuh subur, berkembang\n"well, then", baiklah\n\nalone\n';

    const rows = parsePastedText(text);

    expect(rows).toEqual([
      ['persuade', 'membujuk'],
      ['thrive', 'tumbuh subur, berkembang'],
      ['well, then', 'baiklah'],
      ['alone'],
    ]);
  });

  it('should turn every line into a word when some lines have no meaning', () => {
    const rows = parsePastedText('persuade, membujuk\nthrive, tumbuh subur, berkembang\nalone');

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(false);
    expect(pairs(result.words)).toEqual([
      ['persuade', 'membujuk'],
      ['thrive', 'tumbuh subur, berkembang'],
      ['alone', ''],
    ]);
  });

  it('should skip the header when the first line is a header', () => {
    const rows = parsePastedText('Word, Meaning\ncat, kucing');

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(true);
  });
});

describe('pasted text limit', () => {
  it('should be 100 words when text is pasted', () => {
    const limits = IMPORT_LIMITS;

    const max = limits.maxPastedRows;

    expect(max).toBe(100);
  });

  it.each([
    ['100 words', lines(100)],
    ['100 words under a header line', `Word, Meaning\n${lines(100)}`],
  ])('should accept the text when it has %s', (_, text) => {
    const rows = parsePastedText(text);

    const result = rowsToWords(rows, PASTE_LIMITS);

    expect(result.words).toHaveLength(100);
  });

  it('should refuse the text when it has 101 words', () => {
    const rows = parsePastedText(lines(101));

    const result = rowsToWords(rows, PASTE_LIMITS);

    expect(result.fatal).toBe('Maksimal 100 kata per impor. Teks ini berisi 101 kata.');
  });

  it('should not apply when a file has the same number of rows', () => {
    const rows = parsePastedText(lines(101));

    const result = rowsToWords(rows);

    expect(result.fatal).toBeNull();
  });
});

describe('planImport', () => {
  it('should skip a word when it exists or repeats in the file', () => {
    const parsed = rowsToWords([
      ['Kata', 'Arti'],
      ['Apple', 'apel'],
      ['book', 'buku'],
      ['BOOK', 'kitab'],
      ['pen', 'pena'],
    ]).words;

    const plan = planImport(parsed, [{ term: 'apple' }]);

    expect(plan.toAdd.map((word) => word.term)).toEqual(['book', 'pen']);
    expect(plan.duplicates.map((word) => [word.term, word.reason])).toEqual([
      ['Apple', 'Sudah ada di daftar kata'],
      ['BOOK', 'Muncul lebih dari sekali di file'],
    ]);
  });

  it('should import mada (まだ) when mata (また) already exists', () => {
    const parsed = rowsToWords([['Word', 'Meaning'], ['まだ', 'belum']]).words;

    const plan = planImport(parsed, [{ term: 'また' }]);

    expect(plan.toAdd.map((word) => word.term)).toEqual(['まだ']);
    expect(plan.duplicates).toEqual([]);
  });

  it.each([
    [undefined, ['apple']], // default meaning language: Indonesian
    ['en', ['book']],
  ])('should only find an existing word when its meaning language matches %p', (meaningLanguage, expected) => {
    const parsed = rowsToWords([['Word'], ['apple'], ['book']]).words;
    const existing = [
      { term: 'apple', meaningLanguage: 'en' },
      { term: 'book', meaningLanguage: 'id' },
    ];

    const plan = planImport(parsed, existing, meaningLanguage);

    expect(plan.toAdd.map((word) => word.term)).toEqual(expected);
  });

  it('should give every planned word the chosen meaning language when the plan is made', () => {
    const parsed = rowsToWords([['Word', 'Meaning'], ['cat', 'kucing']]).words;

    const plan = planImport(parsed, [], 'ja');

    expect(plan.toAdd.map((word) => [word.term, word.meaning, word.meaningLanguage])).toEqual([['cat', 'kucing', 'ja']]);
  });

  it('should find an existing word when its kanji or its reading is in the list', () => {
    const words = [
      { row: 2, term: '右', reading: 'みぎ', meaning: '' },
      { row: 3, term: '猫', reading: 'ねこ', meaning: '' },
      { row: 4, term: '左', reading: 'ひだり', meaning: '' },
      { row: 5, term: 'ひだり', meaning: '' },
    ];
    const existing = [
      { term: 'みぎ', meaningLanguage: 'id' },
      { term: '猫', meaningLanguage: 'id' },
    ];

    const plan = planImport(words, existing, 'id');

    expect(plan.toAdd.map((word) => word.term)).toEqual(['左']);
    expect(plan.duplicates.map((word) => [word.term, word.reason])).toEqual([
      ['右', 'Sudah ada di daftar kata'],
      ['猫', 'Sudah ada di daftar kata'],
      ['ひだり', 'Muncul lebih dari sekali di file'],
    ]);
  });
});

describe('kanji programs', () => {
  it('should read kanji, kana and meaning in that order when there is no header', () => {
    const rows = [['勉強', 'べんきょう', 'study'], ['先生', '', 'teacher']];

    const { words, hasHeader } = rowsToWords(rows, { kanji: true });

    expect(hasHeader).toBe(false);
    expect(words.map(({ term, kana, meaning }) => [term, kana, meaning])).toEqual([
      ['勉強', 'べんきょう', 'study'],
      ['先生', '', 'teacher'],
    ]);
  });

  it('should match the Kanji, Hiragana and Romaji columns when they have headers', () => {
    const rows = [['Meaning', 'Romaji', 'Hiragana', 'Kanji'], ['water', 'mizu', 'みず', '水']];

    const { words } = rowsToWords(rows, { kanji: true });

    expect(words[0]).toMatchObject({ term: '水', kana: 'みず', romaji: 'mizu', meaning: 'water' });
  });

  it('should keep a row with only a reading when the kanji is missing', () => {
    const rows = [['Kanji', 'Kana', 'Meaning'], ['', 'みず', 'water'], ['', '', 'nothing']];

    const { words, issues } = rowsToWords(rows, { kanji: true });

    expect(words.map((word) => [word.term, word.kana])).toEqual([['', 'みず']]);
    expect(issues).toEqual([{ row: 3, reason: 'Kolom Kanji dan Kana kosong.' }]);
  });

  it('should ask for a Kanji or Kana column when the header has neither', () => {
    const rows = [['Meaning', 'Notes'], ['a', 'b']];

    const { fatal } = rowsToWords(rows, { kanji: true });

    expect(fatal).toMatch(/"Kanji" atau "Kana"/);
  });

  it.each([
    ['日本, にほん, Japan, the country', ['日本', 'にほん', 'Japan, the country']],
    ['日本, , Japan', ['日本', '', 'Japan']],
    ['日本, にほん', ['日本', 'にほん', '']],
    ['日本, Japan', ['日本', '', 'Japan']],
    [', みず, water', ['', 'みず', 'water']],
    ['日本', ['日本', '', '']],
  ])('should read %p as %j when kanji text is pasted', (text, expected) => {
    const [row] = parsePastedText(text, { kanji: true });

    expect(row).toEqual(expected);
  });

  it('should keep the word-and-meaning format when the program is not a kanji program', () => {
    const text = 'thrive, tumbuh subur, berkembang';

    const [row] = parsePastedText(text);

    expect(row).toEqual(['thrive', 'tumbuh subur, berkembang']);
  });
});

describe('spreadsheet files', () => {
  it.each([
    ['the template', () => buildTemplateXlsx()],
    ['an export', () => buildWordsXlsx([{ term: 'a', meaning: 'b' }])],
    ['the kanji template', () => buildTemplateXlsx({ kanji: true })],
    ['a kanji export', () => buildWordsXlsx([{ term: '水', kana: 'みず', romaji: 'mizu', meaning: 'water' }], { kanji: true })],
  ])('should write a non-empty zip file when building %s', (_, build) => {
    const bytes = build();

    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
    expect(bytes.length).toBeGreaterThan(500);
  });
});
