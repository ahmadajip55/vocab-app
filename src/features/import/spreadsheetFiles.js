import { buildXlsx } from '../../lib/xlsx.js';

const HEADER_ROW = ['Word', 'Meaning'];
const KANJI_HEADER_ROW = ['Kanji', 'Kana', 'Meaning'];

const TEMPLATE_EXAMPLES = [
  ['reluctant', 'enggan, berat hati'],
  ['deadline', 'tenggat waktu'],
  ['luggage', 'bagasi'],
];

const KANJI_TEMPLATE_EXAMPLES = [
  ['勉強', 'べんきょう', 'study'],
  ['先生', 'せんせい', 'teacher'],
  ['コーヒー', '', 'coffee'],
];

const COLUMN_WIDTHS = [24, 40];
const KANJI_COLUMN_WIDTHS = [16, 20, 20, 40];

/** Blank import template with three example rows (`kanji`: for a kanji program). Returns .xlsx bytes. */
export function buildTemplateXlsx({ kanji = false } = {}) {
  return kanji
    ? buildXlsx([KANJI_HEADER_ROW, ...KANJI_TEMPLATE_EXAMPLES], { sheetName: 'Vocabulary', columnWidths: KANJI_COLUMN_WIDTHS })
    : buildXlsx([HEADER_ROW, ...TEMPLATE_EXAMPLES], { sheetName: 'Vocabulary', columnWidths: COLUMN_WIDTHS });
}

/**
 * Current word list in a layout the importer reads (`kanji`: kanji, kana,
 * romaji and meaning). Returns .xlsx bytes.
 */
export function buildWordsXlsx(words, { kanji = false } = {}) {
  if (kanji) {
    const rows = words.map((word) => [word.term, word.kana ?? '', word.romaji ?? '', word.meaning ?? '']);
    return buildXlsx([['Kanji', 'Kana', 'Romaji', 'Meaning'], ...rows], { sheetName: 'Vocabulary', columnWidths: KANJI_COLUMN_WIDTHS });
  }
  const rows = words.map((word) => [word.term, word.meaning ?? '']);
  return buildXlsx([HEADER_ROW, ...rows], { sheetName: 'Vocabulary', columnWidths: COLUMN_WIDTHS });
}
