import { useVocabulary } from './useVocabulary.js';

/** Link to another menu while staying in the current program, e.g. programPath('quiz'). */
export function useProgramPath() {
  const { program } = useVocabulary();
  return (section) => `/${section}/${program.id}`;
}
