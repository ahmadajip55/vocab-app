import { translateSentences } from '../vocabulary/aiMeaning.js';
import { findExamples } from '../vocabulary/examples.js';

const EXAMPLES_PER_CARD = 3;

// One lookup per word and language pair for the whole session; a failed one is retried next time.
const cache = new Map();

/**
 * 1-3 example sentences for a flashcard: [{ sentence, translation }], the
 * sentence in the word language (front) and its translation in the card's
 * meaning language (back). Human translations from Tatoeba are kept; missing
 * ones are machine-translated. Resolves to [] when no sentence is found.
 */
export function loadCardExamples(word, { fetchImpl } = {}) {
  const key = `${word.term}|${word.wordLanguage}|${word.meaningLanguage}`;
  if (!cache.has(key)) {
    const request = (async () => {
      const languages = { sourceLanguage: word.wordLanguage, targetLanguage: word.meaningLanguage };
      const examples = await findExamples(word.term, { ...languages, limit: EXAMPLES_PER_CARD, fetchImpl });
      const missing = examples.filter((example) => !example.translation);
      if (missing.length) {
        const translated = await translateSentences(
          missing.map((example) => example.sentence),
          { ...languages, fetchImpl },
        );
        missing.forEach((example, index) => {
          example.translation = translated[index];
        });
      }
      return examples.map(({ sentence, translation }) => ({ sentence, translation }));
    })();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

export function clearCardExamples() {
  cache.clear();
}
