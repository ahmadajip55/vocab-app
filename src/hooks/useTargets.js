import { useMemo } from 'react';
import { targetsOf } from '../features/vocabulary/model.js';
import { useVocabulary } from './useVocabulary.js';

/** The learning targets ({ mastered, passed }) of the program the page is working on; stable between renders. */
export function useTargets() {
  const { program } = useVocabulary();
  return useMemo(() => targetsOf(program), [program]);
}
