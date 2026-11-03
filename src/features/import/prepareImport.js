import { getLanguage } from '../../languages/index.js';
import { readingCandidates, spellWithKanji } from '../../languages/japanese/kanji.js';
import { isKanaOnly, kanaToRomaji, toKanaReading } from '../../languages/japanese/romaji.js';
import { lowerText, titleText } from '../../lib/text.js';
import { translateTerms } from '../vocabulary/aiMeaning.js';
import { isKanjiProgram } from '../vocabulary/programs.js';
import { planImport } from './planImport.js';

/** The online lookups an import uses; tests pass their own. */
const LOOKUPS = {
  spell: spellWithKanji,
  readingOf: async (term) => (await readingCandidates(term))[0] ?? '',
  translate: translateTerms,
};

/**
 * The words from rowsToWords, ready for the preview:
 *   words in their saved form -> Japanese readings and kanji -> blank meanings translated.
 * Returns { fatal } when the rows cannot be used, otherwise { parsed, translation }
 * with translation = { requested, found, error }.
 * - program: the program imported into; existing: its words (only new words are translated)
 * - onProgress(text) hears what is happening.
 */
export async function prepareImport(read, { program, existing, meaningLanguage, onProgress = () => {}, lookups = {} }) {
  if (read.fatal) return { fatal: read.fatal };
  const use = { ...LOOKUPS, ...lookups };
  const kanji = isKanjiProgram(program);

  let words = toSavedForm(read.words, { wordLanguage: program.wordLanguage, kanji });
  if (program.wordLanguage === 'ja') words = await completeJapanese(words, { kanji, onProgress, ...use });

  const blank = planImport(words, existing, meaningLanguage).toAdd.filter((word) => !word.meaning);
  const translation = { requested: blank.length, found: 0, error: '' };
  if (blank.length > 0) {
    const target = getLanguage(meaningLanguage).label;
    onProgress(`Finding ${target} meanings for ${blank.length} words…`);
    const result = await use.translate(
      blank.map((word) => word.term),
      {
        sourceLanguage: program.wordLanguage,
        targetLanguage: meaningLanguage,
        onProgress: (done, total) => onProgress(`Finding ${target} meanings: ${done} of ${total}…`),
      },
    );
    const found = new Map(); // row -> translated meaning
    blank.forEach((word, index) => {
      if (result.meanings[index]) found.set(word.row, result.meanings[index]);
    });
    words = words.map((word) => (found.has(word.row) ? { ...word, meaning: found.get(word.row), translated: true } : word));
    translation.found = found.size;
    translation.error = result.error ?? '';
  }

  return { parsed: { ...read, words }, translation };
}

/**
 * Words are checked and translated in the form they will be saved in: Title Case,
 * and romaji "Migi" becomes みぎ in a Japanese program (lower case first, as
 * upper-case romaji would become katakana). A kanji program keeps rows with only a reading.
 */
export function toSavedForm(words, { wordLanguage, kanji = false }) {
  const { normalizeTerm } = getLanguage(wordLanguage);
  return words
    .map((word) => ({ ...word, term: titleText(normalizeTerm(lowerText(word.term))), meaning: titleText(word.meaning) }))
    .filter((word) => word.term || (kanji && (word.kana || word.romaji)));
}

/**
 * Japanese words after parsing: { term, kana, romaji, reading } for each.
 * - A Kana or Romaji column gives the reading (romaji turns into hiragana).
 * - A word in hiragana takes its usual kanji spelling (みぎ -> 右) and keeps the
 *   hiragana as its reading. In a kanji program, a row with only a reading does the same.
 * - In a kanji program, a word with kanji and no reading gets its reading looked up.
 * `reading` (the kana) is shown in the preview and counted when finding duplicates.
 */
export async function completeJapanese(words, { kanji = false, onProgress = () => {}, spell = LOOKUPS.spell, readingOf = LOOKUPS.readingOf }) {
  let list = words.map((word) => {
    const kana = toKanaReading(word.kana) || toKanaReading(word.romaji);
    return { ...word, term: word.term || kana, kana };
  });

  onProgress('Looking up kanji…');
  const spellings = await spell(
    list.map((word) => word.term),
    { onProgress: (done, total) => onProgress(`Looking up kanji: ${done} of ${total}…`) },
  );
  list = list.map((word, index) => (spellings[index] ? { ...word, term: spellings[index], kana: word.kana || word.term } : word));

  if (kanji) {
    const missing = list.filter((word) => !word.kana && !isKanaOnly(word.term));
    for (const [done, word] of missing.entries()) {
      onProgress(`Looking up readings: ${done} of ${missing.length}…`);
      word.kana = await readingOf(word.term);
    }
  }

  return list.map((word) => ({
    ...word,
    romaji: kanaToRomaji(word.kana) || kanaToRomaji(word.term),
    reading: word.kana && word.kana !== word.term ? word.kana : '',
  }));
}
