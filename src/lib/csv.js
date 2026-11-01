const DELIMITERS = [',', ';', '\t'];

/**
 * Guess the delimiter from the first lines of the text.
 * Indonesian-locale Excel saves CSV with ";", other locales use ",",
 * and text pasted from a spreadsheet uses tabs.
 */
export function detectDelimiter(text) {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 5);

  let best = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    for (const line of lines) {
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === delimiter && !inQuotes) count++;
      }
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse delimited text (RFC 4180 style quoting) into an array of rows.
 * Fully blank lines are dropped.
 */
export function parseDelimited(text, delimiter) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const separator = delimiter ?? detectDelimiter(source);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      inQuotes = true;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
