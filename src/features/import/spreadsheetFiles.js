import { buildXlsx } from '../../lib/xlsx.js';

export const HEADER_ROW = ['Word', 'Meaning'];

const TEMPLATE_EXAMPLES = [
  ['reluctant', 'enggan, berat hati'],
  ['deadline', 'tenggat waktu'],
  ['luggage', 'bagasi'],
];

const COLUMN_WIDTHS = [24, 40];

/** Blank import template with three example rows. Returns .xlsx bytes. */
export function buildTemplateXlsx() {
  return buildXlsx([HEADER_ROW, ...TEMPLATE_EXAMPLES], {
    sheetName: 'Vocabulary',
    columnWidths: COLUMN_WIDTHS,
  });
}

/** Current word list in the same layout the importer reads. Returns .xlsx bytes. */
export function buildWordsXlsx(words) {
  const rows = words.map((word) => [word.term, word.meaning ?? '']);
  return buildXlsx([HEADER_ROW, ...rows], { sheetName: 'Vocabulary', columnWidths: COLUMN_WIDTHS });
}
