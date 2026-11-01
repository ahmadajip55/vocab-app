import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, levenshtein, normalizeText } from './text.js';
import { createSeededRng, shuffle } from './random.js';
import { detectDelimiter, parseDelimited } from './csv.js';
import { buildXlsx, columnLetter, crc32, createZip } from './xlsx.js';
import { createId } from './id.js';

test('cleanText collapses whitespace', () => {
  assert.equal(cleanText('  a \n  b\t c '), 'a b c');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(0), '0');
  assert.equal(cleanText(false), 'false');
});

test('normalizeText ignores case, accents and punctuation', () => {
  assert.equal(normalizeText('Café, au LAIT!'), 'cafe au lait');
  assert.equal(normalizeText("don't"), 'dont');
  assert.equal(normalizeText('  Hello   World '), 'hello world');
  assert.equal(normalizeText('a\u0301b'), 'ab');
  assert.equal(normalizeText(0), '0');
  assert.equal(normalizeText(false), 'false');
  assert.equal(normalizeText(undefined), '');
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('shuffle keeps items and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, createSeededRng(7));
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffle(input, createSeededRng(7)), out);
});

test('detectDelimiter picks comma, semicolon or tab', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('single'), ',');
  assert.equal(detectDelimiter('"a,b";c\n"d,e";f'), ';');
  assert.equal(detectDelimiter('a,b;c'), ',');
});

test('parseDelimited handles quotes, escaped quotes, CRLF and BOM', () => {
  const text = '﻿Kata,Arti\r\n"hello, world","say ""hi"""\r\nplain,text\r\n\r\n';
  assert.deepEqual(parseDelimited(text), [
    ['Kata', 'Arti'],
    ['hello, world', 'say "hi"'],
    ['plain', 'text'],
  ]);
});

test('parseDelimited keeps newlines inside quoted cells and drops blank rows', () => {
  assert.deepEqual(parseDelimited('a;"line1\nline2"\n;\nb;c'), [
    ['a', 'line1\nline2'],
    ['b', 'c'],
  ]);
});

test('parseDelimited reads pasted tab-separated text', () => {
  assert.deepEqual(parseDelimited('apple\tapel\nbook\tbuku'), [
    ['apple', 'apel'],
    ['book', 'buku'],
  ]);
  assert.deepEqual(parseDelimited('hi"there,now', ','), [['hi"there', 'now']]);
});

test('columnLetter', () => {
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(25), 'Z');
  assert.equal(columnLetter(26), 'AA');
});

test('crc32 matches the known check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  assert.equal(view.getUint32(endOffset, true), 0x06054b50);
  const count = view.getUint16(endOffset + 10, true);
  let pointer = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(pointer, true), 0x02014b50);
    const crc = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    const data = bytes.subarray(dataStart, dataStart + size);
    entries.push({ name, crc, data });
    pointer += 46 + nameLength;
  }
  return entries;
}

test('createZip writes a readable archive with correct CRCs', () => {
  const enc = new TextEncoder();
  const zip = createZip([
    { name: 'a.txt', data: enc.encode('hello') },
    { name: 'dir/b.txt', data: enc.encode('wörld') },
  ]);
  const entries = readZipEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.txt']);
  assert.equal(new TextDecoder().decode(entries[1].data), 'wörld');
  for (const entry of entries) assert.equal(crc32(entry.data), entry.crc);
});

test('buildXlsx contains the workbook parts and escapes cell text', () => {
  const bytes = buildXlsx([['Kata', 'Arti'], ['a & <b>', '=SUM(1,2)']], { sheetName: 'Kosakata' });
  const entries = readZipEntries(bytes);
  assert.deepEqual(entries.map((e) => e.name), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ]);
  const sheet = new TextDecoder().decode(entries.find((e) => e.name === 'xl/worksheets/sheet1.xml').data);
  assert.match(sheet, /a &amp; &lt;b&gt;/);
  assert.match(sheet, /t="inlineStr"[^>]*><is><t xml:space="preserve">=SUM\(1,2\)<\/t>/);
  assert.doesNotMatch(sheet, /<f>/);

  const safeBytes = buildXlsx([['', 'keep'], ['value', '']], {
    sheetName: 'bad/?:[]*name',
    columnWidths: [12, 30],
  });
  const safeEntries = readZipEntries(safeBytes);
  const safeSheet = new TextDecoder().decode(safeEntries.find((e) => e.name === 'xl/worksheets/sheet1.xml').data);
  assert.match(safeSheet, /<cols>/);
  assert.match(safeSheet, /<row r="2">/);
  assert.doesNotMatch(safeSheet, /bad\/\?:\[\]\*name/);

  const emptySheetBytes = buildXlsx([['\u0001value', null], [null, '\u0008text']], { sheetName: '' });
  const emptySheet = new TextDecoder().decode(readZipEntries(emptySheetBytes).find((e) => e.name === 'xl/workbook.xml').data);
  assert.match(emptySheet, /Sheet1/);
  assert.doesNotMatch(emptySheet, /<sheet name=""/);

  const zerosBytes = buildXlsx([[0, false], [false, 0]], { sheetName: 'Sheet 2' });
  const zeroSheet = new TextDecoder().decode(readZipEntries(zerosBytes).find((e) => e.name === 'xl/worksheets/sheet1.xml').data);
  assert.match(zeroSheet, /<c r="A1" t="inlineStr"/);
  assert.match(zeroSheet, /<t xml:space="preserve">0<\/t>/);
});

test('createId falls back when crypto is unavailable', () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  const id = createId();
  assert.match(id, /^[a-z0-9-]+$/i);
  Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
});
