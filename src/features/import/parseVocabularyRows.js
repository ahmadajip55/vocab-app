import { parseDelimited } from '../../lib/csv.js';
import { cleanText } from '../../lib/text.js';
import { LIMITS } from '../vocabulary/model.js';
import { detectColumns, POSITIONAL_COLUMNS } from './columns.js';

/** Most words per import: a file, or the smaller limit for pasted text. */
export const IMPORT_LIMITS = { maxRows: 5000, maxPastedRows: 100 };

const FIELD_LABELS = { term: 'Kata', meaning: 'Arti' };

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cleanText(value);
}

/**
 * Turn raw table rows (from Excel, CSV or pasted text) into word candidates.
 *
 * - If the first row has recognised headers (Kata/Word, Arti/Meaning), those
 *   columns are matched by name, in any order.
 * - Otherwise the first column is the word and the second its meaning.
 *
 * Returns { words, issues, hasHeader, fatal }. Row numbers are spreadsheet row
 * numbers (header = row 1) so users can find problems in their file.
 * `maxRows` caps the number of words (the header row does not count).
 */
export function rowsToWords(rows, { maxRows = IMPORT_LIMITS.maxRows, source = 'File ini' } = {}) {
  const table = rows
    .map((cells, index) => ({ row: index + 1, cells: (cells ?? []).map(cellToString) }))
    .filter(({ cells }) => cells.some((cell) => cell !== ''));

  const fail = (message) => ({ words: [], issues: [], hasHeader: false, fatal: message });

  if (table.length === 0) return fail('File tidak berisi data.');

  const detected = detectColumns(table[0].cells);
  const hasHeader = Object.keys(detected).length > 0;
  let columns = POSITIONAL_COLUMNS;

  if (hasHeader) {
    if (detected.term === undefined) {
      return fail('Kolom wajib tidak ditemukan. Baris pertama harus memuat kolom "Kata".');
    }
    columns = detected;
  }

  const dataRows = hasHeader ? table.slice(1) : table;
  if (dataRows.length === 0) return fail('Hanya ada baris judul, belum ada kata.');
  if (dataRows.length > maxRows) {
    return fail(`Maksimal ${maxRows} kata per impor. ${source} berisi ${dataRows.length} kata.`);
  }

  const words = [];
  const issues = [];

  for (const { row, cells } of dataRows) {
    const read = (field) => (columns[field] === undefined ? '' : (cells[columns[field]] ?? ''));
    const entry = {
      row,
      term: read('term'),
      meaning: read('meaning'),
    };

    if (!entry.term) {
      issues.push({ row, reason: 'Kolom Kata kosong.' });
      continue;
    }
    const tooLong = ['term', 'meaning'].find((field) => entry[field].length > LIMITS[field]);
    if (tooLong) {
      issues.push({ row, reason: `Kolom ${FIELD_LABELS[tooLong]} terlalu panjang (maksimal ${LIMITS[tooLong]} karakter).` });
      continue;
    }
    words.push(entry);
  }

  return { words, issues, hasHeader, fatal: null };
}

/**
 * Pasted text: one word per line, the word and its meaning separated by a comma.
 * Only the first comma separates, so a meaning may contain commas
 * ("thrive, tumbuh subur, berkembang"). Quotes work as in CSV.
 */
export function parsePastedText(text) {
  return parseDelimited(text, ',').map((raw) => {
    const cells = raw.map((cell) => cell.trim());
    return cells.length > 2 ? [cells[0], cells.slice(1).filter(Boolean).join(', ')] : cells;
  });
}
