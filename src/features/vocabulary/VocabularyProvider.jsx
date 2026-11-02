import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ProgramsContext, VocabularyContext } from './VocabularyContext.js';
import { createWord } from './model.js';
import { createProgram, programsReducer } from './programs.js';
import {
  STORAGE_KEY,
  cleanSettings,
  isCompressedList,
  loadPrograms,
  loadSettings,
  programWordsKey,
  removeStoredWords,
  replaceStoredPrograms,
  savePrograms,
  saveSettings,
  saveWords,
} from './storage.js';

const NO_WORDS = [];
const SAVE_DELAY_MS = 400;

/** The loaded word lists that are already saved compressed, so they are not rewritten at start. */
function compressedOnStart({ programs, wordsByProgram }, storage) {
  const saved = {};
  for (const program of programs) {
    if (isCompressedList(programWordsKey(program.id), storage)) saved[program.id] = wordsByProgram[program.id];
  }
  return saved;
}

/**
 * Holds every program and its word list for the whole app and saves them to
 * localStorage: the program list under one key, each program's words under its own.
 * `storage` can be injected for tests; it defaults to window.localStorage.
 */
export function ProgramsProvider({ children, storage }) {
  const [state, dispatch] = useReducer(programsReducer, undefined, () => loadPrograms(storage));
  const [persistFailed, setPersistFailed] = useState(false);
  // App settings: the learning targets the next new program starts with (the last ones used).
  const [settings, setSettings] = useState(() => loadSettings(storage));
  // What was last written, so a change only rewrites what actually changed.
  const savedProgramsRef = useRef(null);
  // programId -> the words array last written. Lists already stored compressed need no rewrite at start.
  const savedWordsRef = useRef(null);
  if (savedWordsRef.current === null) savedWordsRef.current = compressedOnStart(state, storage);
  const legacyRemovedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Compressing a long word list takes a moment, so saving waits until the changes pause
  // (and happens at once when the page is hidden or closed).
  const persist = useCallback(() => {
    const current = stateRef.current;
    let ok = true;
    if (savedProgramsRef.current !== current.programs) {
      if (savePrograms(current.programs, storage)) savedProgramsRef.current = current.programs;
      else ok = false;
    }
    const saved = savedWordsRef.current;

    for (const program of current.programs) {
      const words = current.wordsByProgram[program.id] ?? NO_WORDS;
      if (saved[program.id] === words) continue;
      if (saveWords(words, storage, programWordsKey(program.id))) saved[program.id] = words;
      else ok = false;
    }
    for (const id of Object.keys(saved)) {
      if (current.wordsByProgram[id]) continue;
      removeStoredWords(programWordsKey(id), storage);
      delete saved[id];
    }
    // The pre-program list now lives inside a program, so the old key can go (once).
    if (ok && !legacyRemovedRef.current) {
      removeStoredWords(STORAGE_KEY, storage);
      legacyRemovedRef.current = true;
    }

    setPersistFailed(!ok);
  }, [storage]);

  useEffect(() => {
    const timer = setTimeout(persist, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, persist]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      persist(); // e.g. the provider unmounts with a save still waiting
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [persist]);

  const wordActions = useCallback((programId) => {
    const run = (action) => dispatch({ type: 'program/words', programId, action });
    return {
      addWord(input) {
        const word = createWord(input);
        run({ type: 'words/added', words: [word] });
        return word;
      },
      addWords(inputs) {
        const words = inputs.map((input) => createWord(input));
        run({ type: 'words/added', words });
        return words;
      },
      updateWord(id, changes) {
        run({ type: 'word/updated', id, changes });
      },
      removeWord(id) {
        run({ type: 'word/removed', id });
      },
      /** source: 'flashcards' or 'quiz'; only quiz answers count towards Passed. */
      recordResult(id, correct, source = 'flashcards') {
        run({ type: 'result/recorded', id, correct, source });
      },
      resetProgress() {
        run({ type: 'progress/reset' });
      },
      clearAll() {
        run({ type: 'words/cleared' });
      },
    };
  }, []);

  const programActions = useMemo(
    () => ({
      /** `targets` ({ masteredLevel, passedLevel }) are kept by the program and remembered for the next one. */
      addProgram(name, wordLanguage, levels, targets) {
        const program = createProgram(name, wordLanguage, levels, targets);
        dispatch({ type: 'program/added', program });
        const next = { masteredLevel: program.masteredLevel, passedLevel: program.passedLevel };
        setSettings(cleanSettings(next)); // used for this session even when it cannot be saved
        saveSettings(next, storage);
        return program;
      },
      removeProgram(id) {
        dispatch({ type: 'program/removed', id });
      },
      /**
       * Replaces every program, word and setting, e.g. with a restored backup (see parseBackup).
       * Returns 'saved', 'too-large' (nothing changed: it does not fit in the browser storage)
       * or 'unavailable' (restored for this visit only).
       */
      replaceAll({ programs, wordsByProgram, settings: nextSettings }) {
        const result = replaceStoredPrograms({ programs, wordsByProgram }, storage);
        if (result === 'too-large') return result;
        if (result === 'saved') {
          // Already written, so the next save has nothing to rewrite.
          savedProgramsRef.current = programs;
          savedWordsRef.current = { ...wordsByProgram };
        }
        dispatch({ type: 'programs/replaced', programs, wordsByProgram });
        setSettings(cleanSettings(nextSettings));
        saveSettings(nextSettings, storage);
        return result;
      },
    }),
    [storage],
  );

  const value = useMemo(
    () => ({ ...state, settings, persistFailed, wordActions, ...programActions }),
    [state, settings, persistFailed, wordActions, programActions],
  );

  return <ProgramsContext.Provider value={value}>{children}</ProgramsContext.Provider>;
}

/**
 * Makes one program the word list seen by useVocabulary() below it.
 * Renders `fallback` when the program does not exist.
 */
export function ProgramScope({ programId, children, fallback = null }) {
  const { programs, wordsByProgram, persistFailed, wordActions } = useProgramsContext();
  const program = programs.find((item) => item.id === programId) ?? null;
  const words = wordsByProgram[programId] ?? NO_WORDS;
  const wordLanguage = program?.wordLanguage;
  const actions = useMemo(() => {
    const base = wordActions(programId);
    // New words are read in the program's language from the start (e.g. romaji -> kana).
    return {
      ...base,
      addWord: (input) => base.addWord({ ...input, wordLanguage }),
      addWords: (inputs) => base.addWords(inputs.map((input) => ({ ...input, wordLanguage }))),
    };
  }, [wordActions, programId, wordLanguage]);

  const value = useMemo(
    () => ({ program, words, persistFailed, ...actions }),
    [program, words, persistFailed, actions],
  );

  if (!program) return fallback;
  return <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>;
}

function useProgramsContext() {
  const context = useContext(ProgramsContext);
  if (!context) throw new Error('ProgramScope must be used inside <ProgramsProvider>.');
  return context;
}
