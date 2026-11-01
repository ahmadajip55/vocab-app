import { shuffle } from '../../lib/random.js';
import { MASTERED_LEVEL } from '../vocabulary/model.js';

export { meaningLanguagesOf } from '../vocabulary/model.js';

/** Words that match the session settings, in list order. `meaningLanguage` keeps only that language's entries. */
export function selectWords(words, { onlyUnmastered = false, meaningLanguage = '' } = {}) {
  return words.filter(
    (word) =>
      (!onlyUnmastered || word.mastery < MASTERED_LEVEL) && (!meaningLanguage || word.meaningLanguage === meaningLanguage),
  );
}

export function buildDeck(words, settings, rng = Math.random) {
  const selected = selectWords(words, settings);
  return settings.shuffle ? shuffle(selected, rng) : selected;
}
