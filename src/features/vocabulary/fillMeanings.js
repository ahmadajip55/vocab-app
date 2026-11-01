import { translateTerms } from './aiMeaning.js';

/**
 * Fill in the missing meanings of a study list with one batched lookup (not a
 * request per word). Saved meanings are never replaced. onFound(id, meaning)
 * runs for each meaning found, so the caller can save it and skip the lookup
 * next time. Resolves to the list with the meanings filled in.
 * All words share one word language and one meaning language (one program,
 * one chosen meaning language).
 */
export async function fillMissingMeanings(words, onFound, { fetchImpl } = {}) {
  const blank = words.filter((word) => !word.meaning);
  if (blank.length === 0) return words;

  const { meanings } = await translateTerms(
    blank.map((word) => word.term),
    { sourceLanguage: blank[0].wordLanguage, targetLanguage: blank[0].meaningLanguage, fetchImpl },
  );
  const found = new Map();
  blank.forEach((word, index) => {
    if (!meanings[index]) return;
    found.set(word.id, meanings[index]);
    onFound?.(word.id, meanings[index]);
  });
  return words.map((word) => (found.has(word.id) ? { ...word, meaning: found.get(word.id) } : word));
}
