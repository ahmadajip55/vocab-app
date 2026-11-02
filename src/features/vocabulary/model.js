import { toHiragana, toRomaji } from 'wanakana';
import {
  DEFAULT_MEANING_LANGUAGE,
  DEFAULT_WORD_LANGUAGE,
  LANGUAGE_OPTIONS,
  getLanguage,
  normalizeLanguageCode,
} from '../../languages/index.js';
import { normalizeRomaji } from '../../languages/japanese/romaji.js';
import { createId } from '../../lib/id.js';
import { cleanText, lowerText, normalizeText, titleText } from '../../lib/text.js';

export const LIMITS = { term: 120, meaning: 400 };
/**
 * Learning targets of a program:
 * - mastered: correct answers in a row for 'Mastered' (a wrong answer starts again from 0);
 * - passed: correct quiz answers in total for 'Passed' (wrong answers do not reset it).
 * They are set in the app settings and copied into each program when it is created.
 */
export const DEFAULT_TARGETS = Object.freeze({ mastered: 100, passed: 100 });
export const TARGET_LIMITS = Object.freeze({ min: 1, max: 100 });

/** A whole number within TARGET_LIMITS, or `fallback` when the value is not usable. */
export function sanitizeTarget(value, fallback = DEFAULT_TARGETS.mastered) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(TARGET_LIMITS.max, Math.max(TARGET_LIMITS.min, n));
}

/** The targets a program was created with; programs from before targets existed use the defaults. */
export function targetsOf(program) {
  return {
    mastered: sanitizeTarget(program?.masteredLevel, DEFAULT_TARGETS.mastered),
    passed: sanitizeTarget(program?.passedLevel, DEFAULT_TARGETS.passed),
  };
}
export const DEFAULT_LANGUAGES = { wordLanguage: DEFAULT_WORD_LANGUAGE, meaningLanguage: DEFAULT_MEANING_LANGUAGE };

export { LANGUAGE_OPTIONS, normalizeLanguageCode };

const KANA_OR_KANJI = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * Guess the language from the script only: kana or kanji means Japanese.
 * Latin text is never guessed (an English word such as "agenda" must stay
 * English), so the chosen word language decides how Latin text is read.
 */
export function detectWordLanguage(term, fallback = DEFAULT_LANGUAGES.wordLanguage) {
  return KANA_OR_KANJI.test(cleanText(term)) ? 'ja' : fallback;
}

/** Romaji -> hiragana. Text that is not fully convertible (e.g. "hello") is returned unchanged. */
export function toJapaneseReading(value) {
  const text = cleanText(value).trim();
  if (!text || !/[A-Za-z]/.test(text)) return text;
  const converted = toHiragana(text);
  return /[A-Za-z]/.test(converted) ? text : converted;
}

export function getWordSuggestions(words = [], query = '', language = DEFAULT_LANGUAGES.wordLanguage) {
  const needle = cleanText(query);
  if (!needle) return [];

  const normalizedLanguage = normalizeLanguageCode(language, DEFAULT_LANGUAGES.wordLanguage);
  const searchText = normalizedLanguage === 'ja'
    ? (/[a-z]/i.test(needle) ? toHiragana(needle) : toJapaneseReading(needle))
    : needle;
  const searchKey = normalizeText(searchText);
  const searchRomaji = normalizedLanguage === 'ja' ? toRomaji(searchText).toLowerCase().replace(/[^a-z]/g, '') : '';
  if (!searchKey && !searchRomaji) return [];

  const suggestions = [];
  const seen = new Set();

  for (const word of words) {
    const term = cleanText(word?.term ?? '');
    if (!term) continue;

    const candidateLanguage = normalizeLanguageCode(word?.wordLanguage ?? normalizedLanguage, normalizedLanguage);
    if (candidateLanguage !== normalizedLanguage) continue;

    const candidateText = normalizedLanguage === 'ja' ? toJapaneseReading(term) : term;
    const candidateKey = normalizeText(candidateText);
    const candidateRomaji = normalizedLanguage === 'ja' ? toRomaji(candidateText).toLowerCase().replace(/[^a-z]/g, '') : '';
    if (!candidateKey) continue;
    const matchesJapaneseText = candidateKey.includes(searchKey) || candidateText.toLowerCase().includes(searchText.toLowerCase());
    const matchesRomaji = Boolean(searchRomaji) && candidateRomaji.includes(searchRomaji);
    if (!matchesJapaneseText && !matchesRomaji) continue;

    const value = candidateText || term;
    if (seen.has(value)) continue;
    seen.add(value);
    suggestions.push(value);
  }

  return suggestions.slice(0, 8);
}

/**
 * Word shape:
 * { id, term, meaning, wordLanguage, meaningLanguage, romaji, mastery (0 to the mastered target), quizPassed, attempts, correctCount, createdAt }
 * mastery goes up by one for each correct answer and drops to 0 on a wrong one.
 * quizPassed counts correct quiz answers only; at the program's `passed` target the word is 'Passed'.
 */
export function createWord(input, now = Date.now()) {
  const rawTerm = lowerText(input.term);
  const wordLanguage = normalizeLanguageCode(
    input.wordLanguage ?? input.sourceLanguage ?? detectWordLanguage(rawTerm),
    DEFAULT_LANGUAGES.wordLanguage,
  );
  const term = titleText(getLanguage(wordLanguage).normalizeTerm(rawTerm));
  const meaningLanguage = normalizeLanguageCode(
    input.meaningLanguage ?? input.targetLanguage,
    DEFAULT_LANGUAGES.meaningLanguage,
  );

  return {
    id: createId(),
    term,
    meaning: titleText(input.meaning),
    wordLanguage,
    meaningLanguage,
    romaji: wordLanguage === 'ja' ? normalizeRomaji(input.romaji) : '',
    mastery: 0,
    quizPassed: 0,
    attempts: 0,
    correctCount: 0,
    createdAt: now,
  };
}

export function validateWordInput(input) {
  const errors = {};
  if (!cleanText(input.term)) errors.term = 'Isi kata terlebih dahulu.';
  for (const [field, max] of Object.entries(LIMITS)) {
    if (field === 'meaning') continue;
    if (!errors[field] && cleanText(input[field]).length > max) {
      errors[field] = `Maksimal ${max} karakter.`;
    }
  }
  if (!cleanText(input.meaning)) errors.meaning = 'Isi arti terlebih dahulu.';
  else if (cleanText(input.meaning).length > LIMITS.meaning) {
    errors.meaning = `Maksimal ${LIMITS.meaning} karakter.`;
  }
  return errors;
}

export function termKey(term) {
  return normalizeText(term) || cleanText(term).toLowerCase();
}

/**
 * An existing word with the same term. With `meaningLanguage`, only a word with
 * that meaning language counts: one term may have one entry per meaning language.
 */
export function findByTerm(words, term, ignoreId, meaningLanguage) {
  const key = termKey(term);
  return words.find(
    (word) =>
      word.id !== ignoreId &&
      termKey(word.term) === key &&
      (meaningLanguage === undefined || (word.meaningLanguage ?? DEFAULT_LANGUAGES.meaningLanguage) === meaningLanguage),
  );
}

/**
 * Entries that share a term, shown as one row: [{ key, term, words }], in the
 * order each term first appears. Each entry keeps its own meaning language and progress.
 */
export function groupByTerm(words) {
  const groups = new Map();
  for (const word of words) {
    const key = termKey(word.term);
    if (!groups.has(key)) groups.set(key, { key, term: word.term, words: [] });
    groups.get(key).words.push(word);
  }
  return [...groups.values()];
}

/** `source` 'quiz' also counts a correct answer towards the Passed flag. Mastery stops at `targets.mastered`. */
export function applyResult(word, correct, source = 'flashcards', targets = DEFAULT_TARGETS) {
  return {
    ...word,
    attempts: word.attempts + 1,
    correctCount: word.correctCount + (correct ? 1 : 0),
    mastery: correct ? Math.min(targets.mastered, word.mastery + 1) : 0,
    quizPassed: (word.quizPassed ?? 0) + (correct && source === 'quiz' ? 1 : 0),
  };
}

export function resetProgress(word) {
  return { ...word, mastery: 0, quizPassed: 0, attempts: 0, correctCount: 0 };
}

/** Answered correctly in the quiz `targets.passed` times. */
export function isPassed(word, targets = DEFAULT_TARGETS) {
  return (word.quizPassed ?? 0) >= targets.passed;
}

/** 'new' (never practised), 'weak' (last answer wrong), 'learning', 'mastered'. */
export function getStatus(word, targets = DEFAULT_TARGETS) {
  if (word.attempts === 0) return 'new';
  if (word.mastery >= targets.mastered) return 'mastered';
  if (word.mastery === 0) return 'weak';
  return 'learning';
}

export const STATUS_LABELS = {
  new: 'New',
  weak: 'Not mastered',
  learning: 'In progress',
  mastered: 'Mastered',
};

export function summarizeWords(words, targets = DEFAULT_TARGETS) {
  const summary = { total: words.length, new: 0, weak: 0, learning: 0, mastered: 0, passed: 0 };
  for (const word of words) {
    summary[getStatus(word, targets)]++;
    if (isPassed(word, targets)) summary.passed++;
  }
  return summary;
}

/** The meaning language most of the program's words use, never the word language itself. */
export function defaultMeaningLanguage(words, wordLanguage) {
  const counts = new Map();
  for (const word of words) {
    if (word.meaningLanguage !== wordLanguage) counts.set(word.meaningLanguage, (counts.get(word.meaningLanguage) ?? 0) + 1);
  }
  const [mostUsed] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (mostUsed) return mostUsed;
  if (DEFAULT_LANGUAGES.meaningLanguage !== wordLanguage) return DEFAULT_LANGUAGES.meaningLanguage;
  return LANGUAGE_OPTIONS.find((option) => option.value !== wordLanguage).value;
}

/** Meaning languages used by these words, most-used first: [{ code, count }]. */
export function meaningLanguagesOf(words) {
  const counts = new Map();
  for (const word of words) counts.set(word.meaningLanguage, (counts.get(word.meaningLanguage) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

/**
 * Quiz progress of a list towards Passed: each word counts up to `targets.passed`
 * correct quiz answers. { passed, total, points, max, percent }.
 */
export function quizProgressOf(words, targets = DEFAULT_TARGETS) {
  let points = 0;
  let passed = 0;
  for (const word of words) {
    const count = Math.min(word.quizPassed ?? 0, targets.passed);
    points += count;
    if (count >= targets.passed) passed += 1;
  }
  const max = words.length * targets.passed;
  return { passed, total: words.length, points, max, percent: max ? Math.floor((points / max) * 100) : 0 };
}

/** Meaning languages a word in `wordLanguage` can be translated into (every language but its own). */
export function meaningLanguageOptions(wordLanguage) {
  return LANGUAGE_OPTIONS.filter((option) => option.value !== wordLanguage);
}
