import { cleanText, titleText } from '../../lib/text.js';
import { applyResult, resetProgress, termKey } from './model.js';

export const initialVocabularyState = { words: [] };

const EDITABLE_FIELDS = ['term', 'meaning', 'wordLanguage', 'meaningLanguage', 'romaji', 'kana'];
const TITLE_CASE_FIELDS = new Set(['term', 'meaning']);

function pickEditable(changes) {
  const picked = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in changes) picked[field] = TITLE_CASE_FIELDS.has(field) ? titleText(changes[field]) : cleanText(changes[field]);
  }
  return picked;
}

export function vocabularyReducer(state, action) {
  switch (action.type) {
    case 'words/added': {
      let incoming = action.words;
      if (action.skipDuplicates) {
        const seen = new Set(state.words.map((word) => termKey(word.term)));
        incoming = incoming.filter((word) => {
          const key = termKey(word.term);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      return { ...state, words: [...state.words, ...incoming] };
    }
    case 'word/updated':
      return {
        ...state,
        words: state.words.map((word) =>
          word.id === action.id ? { ...word, ...pickEditable(action.changes) } : word,
        ),
      };
    case 'word/removed':
      return { ...state, words: state.words.filter((word) => word.id !== action.id) };
    case 'result/recorded':
      return {
        ...state,
        words: state.words.map((word) =>
          word.id === action.id ? applyResult(word, action.correct, action.source, action.targets) : word,
        ),
      };
    case 'progress/reset':
      return { ...state, words: state.words.map(resetProgress) };
    case 'words/cleared':
      return { ...state, words: [] };
    default:
      return state;
  }
}
