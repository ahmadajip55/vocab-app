import { createId } from '../../lib/id.js';
import { cleanText, normalizeText } from '../../lib/text.js';
import { DEFAULT_LANGUAGES, normalizeLanguageCode } from './model.js';
import { vocabularyReducer } from './reducer.js';

export const PROGRAM_NAME_LIMIT = 60;

export const initialProgramsState = { programs: [], wordsByProgram: {} };

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

/** A program studies words in exactly one word language. */
export function createProgram(name, wordLanguage = DEFAULT_LANGUAGES.wordLanguage, levels = []) {
  const language = normalizeLanguageCode(wordLanguage, DEFAULT_LANGUAGES.wordLanguage);
  return {
    id: createId(),
    name: cleanText(name).trim(),
    wordLanguage: language,
    levels: sanitizeLevels(levels, language),
    createdAt: Date.now(),
  };
}

/** Every word in a program uses the program's word language. */
function withProgramLanguage(action, wordLanguage) {
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
    case 'program/removed': {
      const wordsByProgram = { ...state.wordsByProgram };
      delete wordsByProgram[action.id];
      return { programs: state.programs.filter((program) => program.id !== action.id), wordsByProgram };
    }
    case 'program/words': {
      const program = state.programs.find((item) => item.id === action.programId);
      if (!program) return state;
      const current = state.wordsByProgram[action.programId] ?? [];
      const next = vocabularyReducer({ words: current }, withProgramLanguage(action.action, program.wordLanguage)).words;
      if (next === current) return state;
      return { ...state, wordsByProgram: { ...state.wordsByProgram, [action.programId]: next } };
    }
    default:
      return state;
  }
}
