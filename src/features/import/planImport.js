import { DEFAULT_LANGUAGES, termKey } from '../vocabulary/model.js';

/**
 * Decide which parsed words will be added.
 * Every imported word gets the meaning language chosen before importing.
 * Words already in the list with that meaning language, and repeats inside
 * the file, are skipped (terms compared ignoring case, accents and punctuation).
 * The same term with another meaning language is a separate entry and is kept.
 * A word given a kanji spelling also carries its `reading` (右 / みぎ); it
 * counts as existing when either form is already in the list.
 */
export function planImport(parsedWords, existingWords, meaningLanguage = DEFAULT_LANGUAGES.meaningLanguage) {
  const existing = new Set(
    existingWords
      .filter((word) => (word.meaningLanguage ?? DEFAULT_LANGUAGES.meaningLanguage) === meaningLanguage)
      .map((word) => termKey(word.term)),
  );
  const seenInFile = new Set();
  const toAdd = [];
  const duplicates = [];

  for (const word of parsedWords) {
    const keys = [word.term, word.reading].filter(Boolean).map(termKey);
    if (keys.some((key) => existing.has(key))) {
      duplicates.push({ ...word, reason: 'Sudah ada di daftar kata' });
    } else if (keys.some((key) => seenInFile.has(key))) {
      duplicates.push({ ...word, reason: 'Muncul lebih dari sekali di file' });
    } else {
      for (const key of keys) seenInFile.add(key);
      toAdd.push({ ...word, meaningLanguage });
    }
  }
  return { toAdd, duplicates };
}
