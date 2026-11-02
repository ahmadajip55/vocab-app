import LZString from 'lz-string';
import { createId } from '../../lib/id.js';
import { cleanText, titleText } from '../../lib/text.js';
import { getLanguage } from '../../languages/index.js';
import { normalizeRomaji } from '../../languages/japanese/romaji.js';
import { DEFAULT_LANGUAGES, DEFAULT_TARGETS, LIMITS, TARGET_LIMITS, normalizeLanguageCode, sanitizeTarget } from './model.js';
import { PROGRAM_NAME_LIMIT, sanitizeLevels } from './programs.js';

/** Legacy key from before programs existed; still the default for loadWords/saveWords. */
export const STORAGE_KEY = 'vocab-app:v1';
export const PROGRAMS_KEY = 'vocab-app:programs';
export const SETTINGS_KEY = 'vocab-app:settings';
const SCHEMA_VERSION = 1;
// Word lists are saved compressed (lz-string, safe for UTF-16 storage), several times smaller than JSON.
const COMPRESSED_PREFIX = 'lz:';
const PROGRAM_FIELDS = ['id', 'name', 'wordLanguage', 'levels', 'masteredLevel', 'passedLevel', 'createdAt'];

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

const languageOr = (value, fallback) => cleanText(value).slice(0, 20) || fallback;
const timestamp = (value) => (Number.isFinite(value) ? value : Date.now());

/** Writes `value` under `key`; returns false when there is no storage or it is full or blocked. */
function writeItem(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Clean items from an untrusted list, each with an id no other item has. Items `clean` returns null for are dropped. */
function withUniqueIds(raw, clean) {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set();
  const items = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const cleaned = clean(item);
    if (!cleaned) continue;
    if (typeof cleaned.id !== 'string' || !cleaned.id || usedIds.has(cleaned.id)) cleaned.id = createId();
    usedIds.add(cleaned.id);
    items.push(cleaned);
  }
  return items;
}

function normalizePersistedWord(item) {
  // Saved lists from before Title Case was the rule are converted as they load.
  const term = titleText(item.term).slice(0, LIMITS.term);
  if (!term) return null;

  const wordLanguage = languageOr(item.wordLanguage, DEFAULT_LANGUAGES.wordLanguage);

  return {
    id: item.id,
    term,
    meaning: titleText(item.meaning).slice(0, LIMITS.meaning),
    wordLanguage,
    meaningLanguage: languageOr(item.meaningLanguage, DEFAULT_LANGUAGES.meaningLanguage),
    romaji: wordLanguage === 'ja' ? normalizeRomaji(item.romaji).slice(0, LIMITS.term * 4) : '',
    mastery: Math.min(TARGET_LIMITS.max, toCount(item.mastery)),
    quizPassed: toCount(item.quizPassed),
    attempts: toCount(item.attempts),
    correctCount: toCount(item.correctCount),
    createdAt: timestamp(item.createdAt),
  };
}

/** Validate untrusted data (from localStorage or a backup) into a clean word list. */
export function sanitizeWords(raw) {
  return withUniqueIds(raw, normalizePersistedWord);
}

/** The JSON text of a saved word list; lists saved before compression are plain JSON already. */
export function decodeStored(raw) {
  return raw.startsWith(COMPRESSED_PREFIX) ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length)) : raw;
}

/** True when the list under `key` is saved in the compressed format. */
export function isCompressedList(key, storage = getDefaultStorage()) {
  try {
    return storage?.getItem(key)?.startsWith(COMPRESSED_PREFIX) ?? false;
  } catch {
    return false;
  }
}

export function loadWords(storage = getDefaultStorage(), key = STORAGE_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    return sanitizeWords(JSON.parse(decodeStored(raw))?.words);
  } catch {
    return [];
  }
}

function serializeForStorage(word) {
  const term = cleanText(word.term).slice(0, LIMITS.term);
  if (!term) return null;

  const wordLanguage = languageOr(word.wordLanguage, DEFAULT_LANGUAGES.wordLanguage);

  const persisted = {
    id: word.id,
    term,
    wordLanguage,
    meaningLanguage: languageOr(word.meaningLanguage, DEFAULT_LANGUAGES.meaningLanguage),
    mastery: Math.min(TARGET_LIMITS.max, toCount(word.mastery)),
    quizPassed: toCount(word.quizPassed),
    attempts: toCount(word.attempts),
    correctCount: toCount(word.correctCount),
    createdAt: timestamp(word.createdAt),
  };
  // Saved meanings (typed or translated) survive a reload instead of being looked up again.
  const meaning = cleanText(word.meaning).slice(0, LIMITS.meaning);
  if (meaning) persisted.meaning = meaning;
  const romaji = wordLanguage === 'ja' ? normalizeRomaji(word.romaji) : '';
  if (romaji) persisted.romaji = romaji;

  return persisted;
}

/** Words as they are saved (and exported in a backup): only the fields worth keeping. */
export function toStoredWords(words) {
  return words.map((word) => serializeForStorage(word)).filter(Boolean);
}

/** A word list as the compressed text that is saved. */
function encodeWords(words) {
  const json = JSON.stringify({ version: SCHEMA_VERSION, words: toStoredWords(words) });
  return COMPRESSED_PREFIX + LZString.compressToUTF16(json);
}

/** Returns true when the data was written. */
export function saveWords(words, storage = getDefaultStorage(), key = STORAGE_KEY) {
  return writeItem(storage, key, encodeWords(words));
}

/** Validate untrusted data into a clean program list with unique ids. */
export function sanitizePrograms(raw) {
  return withUniqueIds(raw, (item) => {
    const name = cleanText(item.name).slice(0, PROGRAM_NAME_LIMIT);
    if (!name) return null;
    return {
      id: item.id,
      name,
      wordLanguage: item.wordLanguage ? normalizeLanguageCode(item.wordLanguage, DEFAULT_LANGUAGES.wordLanguage) : null,
      levels: Array.isArray(item.levels) ? item.levels : [],
      // Programs saved before targets existed keep the defaults.
      ...cleanSettings(item),
      createdAt: timestamp(item.createdAt),
    };
  });
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
    const program = { id: createId(), name, wordLanguage, levels: [], ...cleanSettings(null), createdAt: Date.now() };
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

/** A program as it is saved (and exported in a backup), without anything added while the app runs. */
export function toStoredProgram(program) {
  return Object.fromEntries(PROGRAM_FIELDS.map((field) => [field, program[field]]));
}

function encodePrograms(programs) {
  return JSON.stringify({ version: SCHEMA_VERSION, programs: programs.map(toStoredProgram) });
}

/** Returns true when the program list was written. */
export function savePrograms(programs, storage = getDefaultStorage()) {
  return writeItem(storage, PROGRAMS_KEY, encodePrograms(programs));
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
 * Learning targets, { masteredLevel, passedLevel }, each 1-100 (default 100):
 * the app settings (what the next new program starts with) and each program's own.
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
  return writeItem(storage, SETTINGS_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...cleanSettings(settings) }));
}

/** Every key this app keeps its programs and words under. */
function appKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === PROGRAMS_KEY || key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:program:`)) keys.push(key);
  }
  return keys;
}

/**
 * Replaces every stored program and word list (a restored backup) all at once, or not at all:
 * when the new data does not fit, the old data is put back.
 * Returns 'saved', 'too-large' (nothing changed) or 'unavailable' (no storage to write to).
 */
export function replaceStoredPrograms({ programs, wordsByProgram }, storage = getDefaultStorage()) {
  let previous;
  try {
    if (!storage) return 'unavailable';
    previous = new Map(appKeys(storage).map((key) => [key, storage.getItem(key)]));
  } catch {
    return 'unavailable';
  }
  try {
    // The old data is removed first, so its space can be used by the new data.
    for (const key of previous.keys()) storage.removeItem(key);
    for (const program of programs) storage.setItem(programWordsKey(program.id), encodeWords(wordsByProgram[program.id] ?? []));
    storage.setItem(PROGRAMS_KEY, encodePrograms(programs));
    return 'saved';
  } catch {
    try {
      for (const key of appKeys(storage)) storage.removeItem(key);
      for (const [key, value] of previous) storage.setItem(key, value);
    } catch {
      // the old data still fits, as it did before
    }
    return 'too-large';
  }
}

/** Characters this app keeps in storage; browsers count about 2 bytes for each. */
export function storageUsage(storage = getDefaultStorage()) {
  try {
    if (!storage) return 0;
    return [...appKeys(storage), SETTINGS_KEY].reduce((sum, key) => {
      const value = storage.getItem(key);
      return value === null ? sum : sum + key.length + value.length;
    }, 0);
  } catch {
    return 0;
  }
}
