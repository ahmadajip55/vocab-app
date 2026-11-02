import { createId } from '../../lib/id.js';
import { cleanText, titleText } from '../../lib/text.js';
import { getLanguage } from '../../languages/index.js';
import { normalizeRomaji } from '../../languages/japanese/romaji.js';
import { DEFAULT_LANGUAGES, DEFAULT_TARGETS, LIMITS, TARGET_LIMITS, normalizeLanguageCode, sanitizeTarget } from './model.js';
import { sanitizeLevels } from './programs.js';

/** Legacy key from before programs existed; still the default for loadWords/saveWords. */
export const STORAGE_KEY = 'vocab-app:v1';
export const PROGRAMS_KEY = 'vocab-app:programs';
export const SETTINGS_KEY = 'vocab-app:settings';
const SCHEMA_VERSION = 1;
const PROGRAM_NAME_LIMIT = 60;

/** Each program keeps its words under its own key. */
export function programWordsKey(programId) {
  return `${STORAGE_KEY}:program:${programId}`;
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access can throw when site data is blocked
  }
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizePersistedWord(item) {
  // Saved lists from before Title Case was the rule are converted as they load.
  const term = titleText(item.term).slice(0, LIMITS.term);
  if (!term) return null;

  const wordLanguage = cleanText(item.wordLanguage).slice(0, 20) || DEFAULT_LANGUAGES.wordLanguage;
  const meaningLanguage = cleanText(item.meaningLanguage).slice(0, 20) || DEFAULT_LANGUAGES.meaningLanguage;

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    term,
    meaning: titleText(item.meaning).slice(0, LIMITS.meaning),
    wordLanguage,
    meaningLanguage,
    romaji: wordLanguage === 'ja' ? normalizeRomaji(item.romaji).slice(0, LIMITS.term * 4) : '',
    mastery: Math.min(TARGET_LIMITS.max, toCount(item.mastery)),
    quizPassed: toCount(item.quizPassed),
    attempts: toCount(item.attempts),
    correctCount: toCount(item.correctCount),
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
  };
}

/** Validate untrusted data (from localStorage) into a clean word list. */
export function sanitizeWords(raw) {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set();
  const words = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const prepared = normalizePersistedWord(item);
    if (!prepared) continue;

    if (usedIds.has(prepared.id)) prepared.id = createId();
    usedIds.add(prepared.id);

    words.push(prepared);
  }
  return words;
}

export function loadWords(storage = getDefaultStorage(), key = STORAGE_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    return sanitizeWords(JSON.parse(raw)?.words);
  } catch {
    return [];
  }
}

function serializeForStorage(word) {
  const term = cleanText(word.term).slice(0, LIMITS.term);
  if (!term) return null;

  const normalizedWordLanguage = cleanText(word.wordLanguage).slice(0, 20) || DEFAULT_LANGUAGES.wordLanguage;
  const normalizedMeaningLanguage = cleanText(word.meaningLanguage).slice(0, 20) || DEFAULT_LANGUAGES.meaningLanguage;

  const persisted = {
    id: word.id,
    term,
    wordLanguage: normalizedWordLanguage,
    meaningLanguage: normalizedMeaningLanguage,
    mastery: Math.min(TARGET_LIMITS.max, toCount(word.mastery)),
    quizPassed: toCount(word.quizPassed),
    attempts: toCount(word.attempts),
    correctCount: toCount(word.correctCount),
    createdAt: Number.isFinite(word.createdAt) ? word.createdAt : Date.now(),
  };
  // Saved meanings (typed or translated) survive a reload instead of being looked up again.
  const meaning = cleanText(word.meaning).slice(0, LIMITS.meaning);
  if (meaning) persisted.meaning = meaning;
  const romaji = normalizedWordLanguage === 'ja' ? normalizeRomaji(word.romaji) : '';
  if (romaji) persisted.romaji = romaji;

  return persisted;
}

/** Words as they are saved (and exported in a backup): only the fields worth keeping. */
export function toStoredWords(words) {
  return words.map((word) => serializeForStorage(word)).filter(Boolean);
}

/** Returns true when the data was written. */
export function saveWords(words, storage = getDefaultStorage(), key = STORAGE_KEY) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify({ version: SCHEMA_VERSION, words: toStoredWords(words) }));
    return true;
  } catch {
    return false;
  }
}

/** Validate untrusted data into a clean program list with unique ids. */
export function sanitizePrograms(raw) {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set();
  const programs = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = cleanText(item.name).slice(0, PROGRAM_NAME_LIMIT);
    if (!name) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : createId();
    if (usedIds.has(id)) id = createId();
    usedIds.add(id);
    const wordLanguage = item.wordLanguage ? normalizeLanguageCode(item.wordLanguage, DEFAULT_LANGUAGES.wordLanguage) : null;
    const levels = Array.isArray(item.levels) ? item.levels : [];
    programs.push({
      id,
      name,
      wordLanguage,
      levels,
      // Programs saved before targets existed keep the defaults.
      masteredLevel: sanitizeTarget(item.masteredLevel, DEFAULT_TARGETS.mastered),
      passedLevel: sanitizeTarget(item.passedLevel, DEFAULT_TARGETS.passed),
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
    });
  }
  return programs;
}

/** The word language most of these words use. */
function mostUsedLanguage(words) {
  const counts = new Map();
  for (const word of words) counts.set(word.wordLanguage, (counts.get(word.wordLanguage) ?? 0) + 1);
  let best = DEFAULT_LANGUAGES.wordLanguage;
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) [best, bestCount] = [language, count];
  }
  return best;
}

/**
 * Words saved before programs existed become one "My words" program per word
 * language, since a program holds a single word language.
 */
function migrateLegacyWords(words) {
  const byLanguage = new Map();
  for (const word of words) {
    if (!byLanguage.has(word.wordLanguage)) byLanguage.set(word.wordLanguage, []);
    byLanguage.get(word.wordLanguage).push(word);
  }
  const programs = [];
  const wordsByProgram = {};
  for (const [wordLanguage, list] of byLanguage) {
    const name = byLanguage.size > 1 ? `My words (${getLanguage(wordLanguage).label})` : 'My words';
    const program = {
      id: createId(),
      name,
      wordLanguage,
      levels: [],
      masteredLevel: DEFAULT_TARGETS.mastered,
      passedLevel: DEFAULT_TARGETS.passed,
      createdAt: Date.now(),
    };
    programs.push(program);
    wordsByProgram[program.id] = list;
  }
  return { programs, wordsByProgram };
}

/**
 * Load every program and its words: { programs, wordsByProgram }.
 * Programs saved without a word language get the one most of their words use,
 * and every word is kept in its program's language.
 */
export function loadPrograms(storage = getDefaultStorage()) {
  let programs = null;
  try {
    const raw = storage?.getItem(PROGRAMS_KEY);
    if (raw) programs = sanitizePrograms(JSON.parse(raw)?.programs);
  } catch {
    programs = null;
  }

  if (programs === null) {
    const legacyWords = loadWords(storage, STORAGE_KEY);
    return migrateLegacyWords(legacyWords);
  }

  return settlePrograms(programs, (program) => loadWords(storage, programWordsKey(program.id)));
}

/**
 * { programs, wordsByProgram } from sanitized programs and `wordsOf(program)`.
 * A program without a word language gets the one most of its words use,
 * and its words and levels are kept in that language.
 */
export function settlePrograms(programs, wordsOf) {
  const wordsByProgram = {};
  const settled = programs.map((program) => {
    const words = wordsOf(program);
    const wordLanguage = program.wordLanguage ?? mostUsedLanguage(words);
    wordsByProgram[program.id] = words.map((word) => (word.wordLanguage === wordLanguage ? word : { ...word, wordLanguage }));
    return { ...program, wordLanguage, levels: sanitizeLevels(program.levels, wordLanguage) };
  });
  return { programs: settled, wordsByProgram };
}

/** Returns true when the program list was written. */
export function savePrograms(programs, storage = getDefaultStorage()) {
  try {
    if (!storage) return false;
    const persisted = programs.map(({ id, name, wordLanguage, levels, masteredLevel, passedLevel, createdAt }) => ({
      id,
      name,
      wordLanguage,
      levels,
      masteredLevel,
      passedLevel,
      createdAt,
    }));
    storage.setItem(PROGRAMS_KEY, JSON.stringify({ version: SCHEMA_VERSION, programs: persisted }));
    return true;
  } catch {
    return false;
  }
}

/** Remove a deleted program's words, or the legacy list once it has been migrated. */
export function removeStoredWords(key, storage = getDefaultStorage()) {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clean up when storage is blocked
  }
}

/**
 * App settings: the learning targets new programs start with,
 * { masteredLevel, passedLevel }, each 1-100 (default 100).
 */
export function cleanSettings(raw) {
  return {
    masteredLevel: sanitizeTarget(raw?.masteredLevel, DEFAULT_TARGETS.mastered),
    passedLevel: sanitizeTarget(raw?.passedLevel, DEFAULT_TARGETS.passed),
  };
}

export function loadSettings(storage = getDefaultStorage()) {
  try {
    return cleanSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return cleanSettings(null);
  }
}

/** Returns true when the settings were written. */
export function saveSettings(settings, storage = getDefaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...cleanSettings(settings) }));
    return true;
  } catch {
    return false;
  }
}
