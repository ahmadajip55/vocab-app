import { createContext } from 'react';

/** Every program and its words, for the whole app. */
export const ProgramsContext = createContext(null);

/** The words of the program chosen for the current page. */
export const VocabularyContext = createContext(null);
