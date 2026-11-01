import { useContext } from 'react';
import { ProgramsContext } from '../features/vocabulary/VocabularyContext.js';

export function usePrograms() {
  const context = useContext(ProgramsContext);
  if (!context) {
    throw new Error('usePrograms must be used inside <ProgramsProvider>.');
  }
  return context;
}
