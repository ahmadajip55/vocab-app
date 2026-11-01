/**
 * Flashcard session state. The queue holds word ids in the order they are shown.
 * Pure and framework-free so it can be unit tested.
 */
export function createFlashcardSession(deckIds) {
  return { queue: [...deckIds], index: 0, flipped: false, known: [], unknown: [] };
}

export function isFlashcardSessionFinished(state) {
  return state.index >= state.queue.length;
}

export function flashcardSessionReducer(state, action) {
  if (isFlashcardSessionFinished(state)) return state;

  switch (action.type) {
    case 'flipped':
      return { ...state, flipped: !state.flipped };
    case 'answered': {
      const id = state.queue[state.index];
      return {
        ...state,
        index: state.index + 1,
        flipped: false,
        known: action.known ? [...state.known, id] : state.known,
        unknown: action.known ? state.unknown : [...state.unknown, id],
      };
    }
    default:
      return state;
  }
}
