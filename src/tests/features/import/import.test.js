import { describe, expect, test } from '@jest/globals';
import { detectColumns } from '../../../features/import/columns.js';
import { IMPORT_LIMITS, parsePastedText, rowsToWords } from '../../../features/import/parseVocabularyRows.js';
import { planImport } from '../../../features/import/planImport.js';
import { parseDelimited } from '../../../lib/csv.js';
import { buildTemplateXlsx, buildWordsXlsx } from '../../../features/import/spreadsheetFiles.js';

const pairs = (words) => words.map((word) => [word.term, word.meaning]);
const lines = (count) => Array.from({ length: count }, (_, i) => `word${i}, arti${i}`).join('\n');
const PASTE_LIMITS = { maxRows: IMPORT_LIMITS.maxPastedRows, source: 'Teks ini' };

describe('detectColumns', () => {
  test.each([
    [['Arti', 'Kata', 'Kategori'], { term: 1, meaning: 0 }],
    [['Word', 'Translation', 'Example Sentence'], { term: 0, meaning: 1 }],
    [['Word', 'Meaning result'], { term: 0, meaning: 1 }],
    [['apple', 'apel'], {}],
  ])('matches Indonesian and English headers in any order: %j', (header, expected) => {
    const columns = detectColumns(header);

    expect(columns).toEqual(expected);
  });
});

describe('rowsToWords', () => {
  test('reads a header row and reports spreadsheet row numbers', () => {
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

  test('works with reordered columns and ignores unknown ones', () => {
    const rows = [
      ['No', 'Arti', 'Kata'],
      [1, 'apel', 'apple'],
    ];

    const result = rowsToWords(rows);

    expect(pairs(result.words)).toEqual([['apple', 'apel']]);
  });

  test('without a header, column A is the word and column B its meaning', () => {
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

  test('flags incomplete and oversized rows without stopping', () => {
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

  test('flags a meaning that is too long', () => {
    const rows = [['Word', 'Meaning'], ['cat', 'kucing'], ['dog', 'x'.repeat(401)]];

    const result = rowsToWords(rows);

    expect(result.issues[0].reason).toMatch(/Arti terlalu panjang/);
  });

  test.each([
    ['an empty file', [], /tidak berisi data/],
    ['a header without a word column', [['Arti', 'Contoh'], ['a', 'b']], /kolom "Kata"/],
    ['only a header row', [['Kata', 'Arti']], /Hanya ada baris judul/],
    [
      'more rows than allowed',
      [['Kata', 'Arti'], ...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => [`w${i}`, 'm'])],
      /Maksimal/,
    ],
  ])('gives a clear fatal error for %s', (_, rows, message) => {
    const result = rowsToWords(rows);

    expect(result.fatal).toMatch(message);
  });

  test('converts numbers and dates to text', () => {
    const rows = [['Kata'], [2024, new Date('2024-05-06T00:00:00Z')]];

    const [word] = rowsToWords(rows).words;

    expect([word.term, word.meaning]).toEqual(['2024', '']);
  });

  test('reads tab-separated text copied from a spreadsheet', () => {
    const rows = parseDelimited('Kata\tArti\napple\tapel\nbook\tbuku');

    const result = rowsToWords(rows);

    expect(result.words.map((word) => word.term)).toEqual(['apple', 'book']);
  });
});

describe('parsePastedText', () => {
  test('reads "word, meaning" per line; later commas stay in the meaning', () => {
    const text = 'persuade, membujuk\nthrive, tumbuh subur, berkembang\n"well, then", baiklah\n\nalone\n';

    const rows = parsePastedText(text);

    expect(rows).toEqual([
      ['persuade', 'membujuk'],
      ['thrive', 'tumbuh subur, berkembang'],
      ['well, then', 'baiklah'],
      ['alone'],
    ]);
  });

  test('pasted rows become words, a line without a meaning included', () => {
    const rows = parsePastedText('persuade, membujuk\nthrive, tumbuh subur, berkembang\nalone');

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(false);
    expect(pairs(result.words)).toEqual([
      ['persuade', 'membujuk'],
      ['thrive', 'tumbuh subur, berkembang'],
      ['alone', ''],
    ]);
  });

  test('recognises a header line', () => {
    const rows = parsePastedText('Word, Meaning\ncat, kucing');

    const result = rowsToWords(rows);

    expect(result.hasHeader).toBe(true);
  });
});

describe('pasted text limit', () => {
  test('is 100 words', () => {
    const limits = IMPORT_LIMITS;

    const max = limits.maxPastedRows;

    expect(max).toBe(100);
  });

  test.each([
    ['100 words', lines(100)],
    ['100 words under a header line', `Word, Meaning\n${lines(100)}`],
  ])('accepts %s', (_, text) => {
    const rows = parsePastedText(text);

    const result = rowsToWords(rows, PASTE_LIMITS);

    expect(result.words).toHaveLength(100);
  });

  test('refuses 101 words', () => {
    const rows = parsePastedText(lines(101));

    const result = rowsToWords(rows, PASTE_LIMITS);

    expect(result.fatal).toBe('Maksimal 100 kata per impor. Teks ini berisi 101 kata.');
  });

  test('does not apply to a file of the same size', () => {
    const rows = parsePastedText(lines(101));

    const result = rowsToWords(rows);

    expect(result.fatal).toBeNull();
  });
});

describe('planImport', () => {
  test('skips words that exist or repeat in the file', () => {
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

  test.each([
    [undefined, ['apple']], // default meaning language: Indonesian
    ['en', ['book']],
  ])('with meaning language %p, a word only exists when its meaning language matches', (meaningLanguage, expected) => {
    const parsed = rowsToWords([['Word'], ['apple'], ['book']]).words;
    const existing = [
      { term: 'apple', meaningLanguage: 'en' },
      { term: 'book', meaningLanguage: 'id' },
    ];

    const plan = planImport(parsed, existing, meaningLanguage);

    expect(plan.toAdd.map((word) => word.term)).toEqual(expected);
  });

  test('gives every planned word the chosen meaning language', () => {
    const parsed = rowsToWords([['Word', 'Meaning'], ['cat', 'kucing']]).words;

    const plan = planImport(parsed, [], 'ja');

    expect(plan.toAdd.map((word) => [word.term, word.meaning, word.meaningLanguage])).toEqual([['cat', 'kucing', 'ja']]);
  });

  test('a word turned into kanji exists when its kanji or its reading is in the list', () => {
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

describe('spreadsheet files', () => {
  test.each([
    ['the template', () => buildTemplateXlsx()],
    ['an export', () => buildWordsXlsx([{ term: 'a', meaning: 'b' }])],
  ])('%s is a non-empty zip file', (_, build) => {
    const bytes = build();

    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
    expect(bytes.length).toBeGreaterThan(500);
  });
});
