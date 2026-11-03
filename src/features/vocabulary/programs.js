import { createId } from '../../lib/id.js';
import { cleanText, normalizeText } from '../../lib/text.js';
import { getLanguage } from '../../languages/index.js';
import {
  DEFAULT_LANGUAGES,
  DEFAULT_TARGETS,
  LANGUAGE_OPTIONS,
  TARGET_LIMITS,
  normalizeLanguageCode,
  sanitizeTarget,
  targetsOf,
} from './model.js';
import { vocabularyReducer } from './reducer.js';

export const PROGRAM_NAME_LIMIT = 60;

export const initialProgramsState = { programs: [], wordsByProgram: {} };

/**
 * A Japanese program can focus on kanji (`script: 'kanji'`): its words are added
 * with three fields (kanji, kana reading, romaji). It is still Japanese ('ja')
 * for everything else: input method, readings, speech, JLPT levels, translation.
 */
export const KANJI_SCRIPT = 'kanji';
const KANJI_OPTION = { value: 'ja-kanji', label: 'Japanese (Kanji)' };

/** Word language choices for a new program: the languages, plus Japanese (Kanji) after Japanese. */
export const PROGRAM_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS.flatMap((option) => (option.value === 'ja' ? [option, KANJI_OPTION] : [option]));

/** A choice from PROGRAM_LANGUAGE_OPTIONS -> { wordLanguage, script }. */
export function parseProgramLanguage(value) {
  return value === KANJI_OPTION.value ? { wordLanguage: 'ja', script: KANJI_SCRIPT } : { wordLanguage: value, script: null };
}

export function isKanjiProgram(program) {
  return program?.wordLanguage === 'ja' && program?.script === KANJI_SCRIPT;
}

/** "Japanese (Kanji)" for a kanji program, otherwise the language name. */
export function programLanguageLabel(program) {
  return isKanjiProgram(program) ? KANJI_OPTION.label : getLanguage(program?.wordLanguage).label;
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];

/** Japanese programs use JLPT levels; every other language uses CEFR. */
export function levelOptionsFor(wordLanguage) {
  return normalizeLanguageCode(wordLanguage, DEFAULT_LANGUAGES.wordLanguage) === 'ja' ? JLPT_LEVELS : CEFR_LEVELS;
}

/** Keeps only levels valid for the language, without repeats, in the standard order. */
export function sanitizeLevels(levels, wordLanguage) {
  const chosen = new Set(Array.isArray(levels) ? levels.map((level) => String(level).trim().toUpperCase()) : []);
  return levelOptionsFor(wordLanguage).filter((level) => chosen.has(level));
}

/** Returns an error message, or '' when at least one valid level is chosen. */
export function validateProgramLevels(levels, wordLanguage) {
  return sanitizeLevels(levels, wordLanguage).length ? '' : 'Choose at least one level.';
}

/** A learning target as typed in the form: a whole number within TARGET_LIMITS. */
export function validateProgramTarget(value) {
  const n = Number(value);
  return String(value).trim() !== '' && Number.isInteger(n) && n >= TARGET_LIMITS.min && n <= TARGET_LIMITS.max
    ? ''
    : `Enter a whole number from ${TARGET_LIMITS.min} to ${TARGET_LIMITS.max}.`;
}

/**
 * A new program, studying words in exactly one word language. `settings` holds its
 * learning targets ({ masteredLevel, passedLevel }), which it keeps from then on,
 * and `script: 'kanji'` for a Japanese kanji program.
 */
export function createProgram(name, wordLanguage = DEFAULT_LANGUAGES.wordLanguage, levels = [], settings = {}) {
  const language = normalizeLanguageCode(wordLanguage, DEFAULT_LANGUAGES.wordLanguage);
  return {
    id: createId(),
    name: cleanText(name).trim(),
    wordLanguage: language,
    levels: sanitizeLevels(levels, language),
    masteredLevel: sanitizeTarget(settings.masteredLevel, DEFAULT_TARGETS.mastered),
    passedLevel: sanitizeTarget(settings.passedLevel, DEFAULT_TARGETS.passed),
    script: language === 'ja' && settings.script === KANJI_SCRIPT ? KANJI_SCRIPT : null,
    createdAt: Date.now(),
  };
}

/** Every word in a program uses the program's word language, and answers count towards its targets. */
function withProgramRules(action, program) {
  const { wordLanguage } = program;
  if (action.type === 'result/recorded') return { ...action, targets: targetsOf(program) };
  if (action.type === 'words/added') {
    return { ...action, words: action.words.map((word) => ({ ...word, wordLanguage })) };
  }
  if (action.type === 'word/updated' && 'wordLanguage' in action.changes) {
    return { ...action, changes: { ...action.changes, wordLanguage } };
  }
  return action;
}

/** Returns an error message, or '' when the name can be used. */
export function validateProgramName(name, programs = [], ignoreId = null) {
  const clean = cleanText(name).trim();
  if (!clean) return 'Enter a program name.';
  if (clean.length > PROGRAM_NAME_LIMIT) return `Maximum ${PROGRAM_NAME_LIMIT} characters.`;
  const key = normalizeText(clean);
  if (programs.some((program) => program.id !== ignoreId && normalizeText(program.name) === key)) {
    return `"${clean}" already exists.`;
  }
  return '';
}

/**
 * Programs and their word lists. Word actions are wrapped as
 * { type: 'program/words', programId, action } and run through vocabularyReducer.
 */
export function programsReducer(state, action) {
  switch (action.type) {
    case 'program/added':
      return {
        programs: [...state.programs, action.program],
        wordsByProgram: { ...state.wordsByProgram, [action.program.id]: [] },
      };
    case 'programs/replaced':
      return { programs: action.programs, wordsByProgram: action.wordsByProgram };
    case 'program/removed': {
      const wordsByProgram = { ...state.wordsByProgram };
      delete wordsByProgram[action.id];
      return { programs: state.programs.filter((program) => program.id !== action.id), wordsByProgram };
    }
    case 'program/words': {
      const program = state.programs.find((item) => item.id === action.programId);
      if (!program) return state;
      const current = state.wordsByProgram[action.programId] ?? [];
      const next = vocabularyReducer({ words: current }, withProgramRules(action.action, program)).words;
      if (next === current) return state;
      return { ...state, wordsByProgram: { ...state.wordsByProgram, [action.programId]: next } };
    }
    default:
      return state;
  }
}
