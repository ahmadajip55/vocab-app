import { useContext } from 'react';
import { VocabularyContext } from '../features/vocabulary/VocabularyContext.js';

/** The chosen program's words and actions; only available on a page inside <ProgramScope>. */
export function useVocabulary() {
  const context = useContext(VocabularyContext);
  if (!context) {
    throw new Error('useVocabulary must be used inside <ProgramScope>.');
  }
  return context;
}
