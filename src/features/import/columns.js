import { normalizeText } from '../../lib/text.js';

/** Header names (Indonesian and English) recognised for each field. */
export const COLUMN_ALIASES = {
  term: ['kata', 'word', 'term', 'vocabulary', 'vocab', 'kosakata', 'english', 'inggris', 'bahasa inggris', 'kata inggris'],
  meaning: [
    'arti',
    'meaning',
    'meaning result',
    'translation',
    'terjemahan',
    'indonesia',
    'indonesian',
    'bahasa indonesia',
    'definition',
    'definisi',
    'makna',
  ],
};

/** Column order assumed when the first row is not a recognisable header: word, then meaning. */
export const POSITIONAL_COLUMNS = { term: 0, meaning: 1 };

const lookup = new Map();
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) lookup.set(normalizeText(alias), field);
}

const IMPORTED_FIELDS = ['term', 'meaning'];

/** Map field name to column index for a header row. Unknown headers are ignored. */
export function detectColumns(headerRow) {
  const columns = {};
  headerRow.forEach((cell, index) => {
    const field = lookup.get(normalizeText(cell));
    if (IMPORTED_FIELDS.includes(field) && columns[field] === undefined) columns[field] = index;
  });
  return columns;
}
