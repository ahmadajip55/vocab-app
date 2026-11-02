import { describe, expect, test } from '@jest/globals';
import { cleanText, levenshtein, normalizeText, titleText, toTitleCase } from '../../lib/text.js';
import { createSeededRng, shuffle } from '../../lib/random.js';
import { detectDelimiter, parseDelimited } from '../../lib/csv.js';
import { buildXlsx, columnLetter, crc32, createZip } from '../../lib/xlsx.js';
import { createId } from '../../lib/id.js';

/** Reads the entries of a zip archive back: [{ name, crc, data }]. */
function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
  const count = view.getUint16(endOffset + 10, true);
  let pointer = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pointer, true)).toBe(0x02014b50);
    const crc = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.push({ name, crc, data: bytes.subarray(dataStart, dataStart + size) });
    pointer += 46 + nameLength;
  }
  return entries;
}

/** The text of one part of a built workbook. */
function readPart(bytes, name) {
  return new TextDecoder().decode(readZipEntries(bytes).find((entry) => entry.name === name).data);
}

describe('cleanText', () => {
  test.each([
    ['  a \n  b\t c ', 'a b c'],
    [null, ''],
    [0, '0'],
    [false, 'false'],
  ])('cleanText(%p) is %p', (input, expected) => {
    const result = cleanText(input);

    expect(result).toBe(expected);
  });
});

describe('normalizeText', () => {
  test.each([
    ['Café, au LAIT!', 'cafe au lait'],
    ["don't", 'dont'],
    ['  Hello   World ', 'hello world'],
    ['áb', 'ab'],
    [0, '0'],
    [false, 'false'],
    [undefined, ''],
  ])('ignores case, accents and punctuation: %p -> %p', (input, expected) => {
    const result = normalizeText(input);

    expect(result).toBe(expected);
  });
});

describe('Title Case', () => {
  test.each([
    ['terima kasih ', 'Terima Kasih '], // spaces are kept while typing
    ['tumbuh subur, berkembang', 'Tumbuh Subur, Berkembang'],
    ['l\'eau / "quoted"', 'L\'eau / "Quoted"'],
    ['みぎ', 'みぎ'],
  ])('toTitleCase(%p) is %p', (text, expected) => {
    const result = toTitleCase(text);

    expect(result).toBe(expected);
  });

  test('titleText also tidies the spaces', () => {
    const text = '  café  au   lait ';

    const result = titleText(text);

    expect(result).toBe('Café Au Lait');
  });
});

describe('levenshtein', () => {
  test.each([
    ['kitten', 'sitting', 3],
    ['abc', 'abc', 0],
    ['', 'abc', 3],
  ])('distance between %p and %p is %p', (a, b, expected) => {
    const distance = levenshtein(a, b);

    expect(distance).toBe(expected);
  });
});

describe('shuffle', () => {
  test('keeps every item and does not change the input', () => {
    const input = [1, 2, 3, 4, 5, 6];

    const result = shuffle(input, createSeededRng(7));

    expect([...result].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('gives the same order for the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6];

    const first = shuffle(input, createSeededRng(7));
    const second = shuffle(input, createSeededRng(7));

    expect(second).toEqual(first);
  });
});

describe('detectDelimiter', () => {
  test.each([
    ['a,b,c\n1,2,3', ','],
    ['a;b;c\n1;2;3', ';'],
    ['a\tb\tc\n1\t2\t3', '\t'],
    ['single', ','],
    ['"a,b";c\n"d,e";f', ';'],
    ['a,b;c', ','],
  ])('picks the delimiter of %p', (text, expected) => {
    const delimiter = detectDelimiter(text);

    expect(delimiter).toBe(expected);
  });
});

describe('parseDelimited', () => {
  test('handles quotes, escaped quotes, CRLF and a byte order mark', () => {
    const text = '﻿Kata,Arti\r\n"hello, world","say ""hi"""\r\nplain,text\r\n\r\n';

    const rows = parseDelimited(text);

    expect(rows).toEqual([
      ['Kata', 'Arti'],
      ['hello, world', 'say "hi"'],
      ['plain', 'text'],
    ]);
  });

  test('keeps newlines inside quoted cells and drops blank rows', () => {
    const text = 'a;"line1\nline2"\n;\nb;c';

    const rows = parseDelimited(text);

    expect(rows).toEqual([
      ['a', 'line1\nline2'],
      ['b', 'c'],
    ]);
  });

  test('reads pasted tab-separated text', () => {
    const text = 'apple\tapel\nbook\tbuku';

    const rows = parseDelimited(text);

    expect(rows).toEqual([
      ['apple', 'apel'],
      ['book', 'buku'],
    ]);
  });

  test('treats a quote inside a cell as a normal character', () => {
    const text = 'hi"there,now';

    const rows = parseDelimited(text, ',');

    expect(rows).toEqual([['hi"there', 'now']]);
  });
});

describe('xlsx helpers', () => {
  test.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
  ])('column %p is %p', (index, expected) => {
    const letter = columnLetter(index);

    expect(letter).toBe(expected);
  });

  test('crc32 matches the known check value', () => {
    const bytes = new TextEncoder().encode('123456789');

    const checksum = crc32(bytes);

    expect(checksum).toBe(0xcbf43926);
  });

  test('createZip writes a readable archive with correct CRCs', () => {
    const encoder = new TextEncoder();
    const files = [
      { name: 'a.txt', data: encoder.encode('hello') },
      { name: 'dir/b.txt', data: encoder.encode('wörld') },
    ];

    const entries = readZipEntries(createZip(files));

    expect(entries.map((entry) => entry.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(new TextDecoder().decode(entries[1].data)).toBe('wörld');
    for (const entry of entries) expect(crc32(entry.data)).toBe(entry.crc);
  });
});

describe('buildXlsx', () => {
  test('contains every workbook part', () => {
    const rows = [['Kata', 'Arti']];

    const entries = readZipEntries(buildXlsx(rows, { sheetName: 'Kosakata' }));

    expect(entries.map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  test('escapes cell text and never writes formulas', () => {
    const rows = [['Kata', 'Arti'], ['a & <b>', '=SUM(1,2)']];

    const sheet = readPart(buildXlsx(rows, { sheetName: 'Kosakata' }), 'xl/worksheets/sheet1.xml');

    expect(sheet).toMatch(/a &amp; &lt;b&gt;/);
    expect(sheet).toMatch(/t="inlineStr"[^>]*><is><t xml:space="preserve">=SUM\(1,2\)<\/t>/);
    expect(sheet).not.toMatch(/<f>/);
  });

  test('writes column widths and skips empty cells', () => {
    const rows = [['', 'keep'], ['value', '']];

    const sheet = readPart(buildXlsx(rows, { sheetName: 'bad/?:[]*name', columnWidths: [12, 30] }), 'xl/worksheets/sheet1.xml');

    expect(sheet).toMatch(/<cols>/);
    expect(sheet).toMatch(/<row r="2">/);
  });

  test('removes characters Excel does not allow in a sheet name', () => {
    const rows = [['a']];

    const workbook = readPart(buildXlsx(rows, { sheetName: 'bad/?:[]*name' }), 'xl/workbook.xml');

    expect(workbook).not.toMatch(/bad\/\?:\[\]\*name/);
  });

  test('falls back to "Sheet1" for an empty sheet name', () => {
    const rows = [['\u0001value', null], [null, '\u0008text']];

    const workbook = readPart(buildXlsx(rows, { sheetName: '' }), 'xl/workbook.xml');

    expect(workbook).toMatch(/Sheet1/);
    expect(workbook).not.toMatch(/<sheet name=""/);
  });

  test('keeps 0 and false as text', () => {
    const rows = [[0, false], [false, 0]];

    const sheet = readPart(buildXlsx(rows, { sheetName: 'Sheet 2' }), 'xl/worksheets/sheet1.xml');

    expect(sheet).toMatch(/<c r="A1" t="inlineStr"/);
    expect(sheet).toMatch(/<t xml:space="preserve">0<\/t>/);
  });
});

describe('createId', () => {
  test('falls back when crypto is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });

    try {
      const id = createId();

      expect(id).toMatch(/^[a-z0-9-]+$/i);
    } finally {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
