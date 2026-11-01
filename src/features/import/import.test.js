import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectColumns } from './columns.js';
import { IMPORT_LIMITS, parsePastedText, rowsToWords } from './parseVocabularyRows.js';
import { planImport } from './planImport.js';
import { parseDelimited } from '../../lib/csv.js';
import { buildTemplateXlsx, buildWordsXlsx } from './spreadsheetFiles.js';

test('detectColumns matches Indonesian and English headers in any order', () => {
  assert.deepEqual(detectColumns(['Arti', 'Kata', 'Kategori']), { term: 1, meaning: 0 });
  assert.deepEqual(detectColumns(['Word', 'Translation', 'Example Sentence']), { term: 0, meaning: 1 });
  assert.deepEqual(detectColumns(['Word', 'Meaning result']), { term: 0, meaning: 1 });
  assert.deepEqual(detectColumns(['apple', 'apel']), {});
});

test('rowsToWords reads a header row and reports spreadsheet row numbers', () => {
  const result = rowsToWords([
    ['Kata', 'Arti', 'Contoh', 'Kategori'],
    ['reluctant', 'enggan', 'She was reluctant.', 'Sehari-hari'],
    [null, null, null, null],
    ['deadline', 'tenggat', null, 'Kantor'],
  ]);
  assert.equal(result.hasHeader, true);
  assert.equal(result.fatal, null);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.words.map((w) => [w.row, w.term, w.meaning]), [
    [2, 'reluctant', 'enggan'],
    [4, 'deadline', 'tenggat'],
  ]);
});

test('rowsToWords works with reordered columns and ignores unknown columns', () => {
  const result = rowsToWords([
    ['No', 'Arti', 'Kata'],
    [1, 'apel', 'apple'],
  ]);
  assert.deepEqual(result.words.map((w) => [w.term, w.meaning]), [['apple', 'apel']]);
});

test('rowsToWords falls back to column order when there is no header', () => {
  const result = rowsToWords([
    ['apple', 'apel', 'An apple a day.', 'Buah'],
    ['book', 'buku'],
  ]);
  assert.equal(result.hasHeader, false);
  assert.deepEqual(result.words.map((w) => [w.term, w.meaning]), [
    ['apple', 'apel'],
    ['book', 'buku'],
  ]);
});

test('rowsToWords flags incomplete and oversized rows without stopping', () => {
  const result = rowsToWords([
    ['Kata', 'Arti'],
    ['only term', ''],
    ['', 'only meaning'],
    ['x'.repeat(200), 'too long'],
    ['good', 'bagus'],
  ]);
  assert.equal(result.words.length, 2);
  assert.deepEqual(result.issues.map((i) => i.row), [3, 4]);
  assert.match(result.issues[0].reason, /Kata kosong/);
  assert.match(result.issues[1].reason, /terlalu panjang/);
});


test('rowsToWords gives clear fatal errors', () => {
  assert.match(rowsToWords([]).fatal, /tidak berisi data/);
  assert.match(rowsToWords([['Arti', 'Contoh'], ['a', 'b']]).fatal, /kolom "Kata"/);
  assert.match(rowsToWords([['Kata', 'Arti']]).fatal, /Hanya ada baris judul/);
  const huge = [['Kata', 'Arti'], ...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => [`w${i}`, 'm'])];
  assert.match(rowsToWords(huge).fatal, /Maksimal/);
});

test('rowsToWords converts numbers and dates to text', () => {
  const result = rowsToWords([['Kata'], [2024, new Date('2024-05-06T00:00:00Z')]]);
  assert.deepEqual([result.words[0].term, result.words[0].meaning], ['2024', '']);
});

test('pasted spreadsheet text goes through the same pipeline', () => {
  const rows = parseDelimited('Kata\tArti\napple\tapel\nbook\tbuku');
  const result = rowsToWords(rows);
  assert.deepEqual(result.words.map((w) => w.term), ['apple', 'book']);
});

test('planImport skips words that exist or repeat in the file', () => {
  const parsed = rowsToWords([
    ['Kata', 'Arti'],
    ['Apple', 'apel'],
    ['book', 'buku'],
    ['BOOK', 'kitab'],
    ['pen', 'pena'],
  ]).words;
  const plan = planImport(parsed, [{ term: 'apple' }]);
  assert.deepEqual(plan.toAdd.map((w) => w.term), ['book', 'pen']);
  assert.deepEqual(plan.duplicates.map((w) => [w.term, w.reason]), [
    ['Apple', 'Sudah ada di daftar kata'],
    ['BOOK', 'Muncul lebih dari sekali di file'],
  ]);
});

test('template and export workbooks are non-empty zip files', () => {
  for (const bytes of [buildTemplateXlsx(), buildWordsXlsx([{ term: 'a', meaning: 'b', example: '' }])]) {
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.ok(bytes.length > 500);
  }
});

test('planImport only treats a word as existing when its meaning language matches', () => {
  const parsed = rowsToWords([['Word'], ['apple'], ['book']]).words;
  const existing = [
    { term: 'apple', meaningLanguage: 'en' },
    { term: 'book', meaningLanguage: 'id' },
  ];
  assert.deepEqual(planImport(parsed, existing).toAdd.map((w) => w.term), ['apple']);
  assert.deepEqual(planImport(parsed, existing, 'en').toAdd.map((w) => w.term), ['book']);
});

test('pasted text is "word, meaning" per line; later commas stay in the meaning', () => {
  const rows = parsePastedText('persuade, membujuk\nthrive, tumbuh subur, berkembang\n"well, then", baiklah\n\nalone\n');
  assert.deepEqual(rows, [
    ['persuade', 'membujuk'],
    ['thrive', 'tumbuh subur, berkembang'],
    ['well, then', 'baiklah'],
    ['alone'],
  ]);
  const result = rowsToWords(rows);
  assert.equal(result.hasHeader, false);
  assert.deepEqual(result.words.map((w) => [w.term, w.meaning]), [
    ['persuade', 'membujuk'],
    ['thrive', 'tumbuh subur, berkembang'],
    ['well, then', 'baiklah'],
    ['alone', ''],
  ]);
  // A header line is recognised too.
  assert.equal(rowsToWords(parsePastedText('Word, Meaning\ncat, kucing')).hasHeader, true);
});

test('every planned word gets the chosen meaning language, and too-long meanings are flagged', () => {
  const parsed = rowsToWords([['Word', 'Meaning'], ['cat', 'kucing'], ['dog', 'x'.repeat(401)]]);
  assert.match(parsed.issues[0].reason, /Arti terlalu panjang/);
  const plan = planImport(parsed.words, [], 'ja');
  assert.deepEqual(plan.toAdd.map((w) => [w.term, w.meaning, w.meaningLanguage]), [['cat', 'kucing', 'ja']]);
});

test('a word turned into kanji counts as existing when its reading is already in the list', () => {
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
  assert.deepEqual(plan.toAdd.map((w) => w.term), ['左']);
  assert.deepEqual(plan.duplicates.map((w) => [w.term, w.reason]), [
    ['右', 'Sudah ada di daftar kata'],
    ['猫', 'Sudah ada di daftar kata'],
    ['ひだり', 'Muncul lebih dari sekali di file'],
  ]);
});

test('pasted text is limited to 100 words; the header line does not count, files keep their own limit', () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => `word${i}, arti${i}`).join('\n');
  const pasteLimits = { maxRows: IMPORT_LIMITS.maxPastedRows, source: 'Teks ini' };
  assert.equal(IMPORT_LIMITS.maxPastedRows, 100);

  assert.equal(rowsToWords(parsePastedText(lines(100)), pasteLimits).words.length, 100);
  assert.equal(rowsToWords(parsePastedText(`Word, Meaning\n${lines(100)}`), pasteLimits).words.length, 100);
  assert.equal(
    rowsToWords(parsePastedText(lines(101)), pasteLimits).fatal,
    'Maksimal 100 kata per impor. Teks ini berisi 101 kata.',
  );
  // A file of the same size is fine.
  assert.equal(rowsToWords(parsePastedText(lines(101))).fatal, null);
});
