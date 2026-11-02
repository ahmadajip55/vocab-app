import { describe, expect, test } from '@jest/globals';
import { createWord } from '../../../features/vocabulary/model.js';
import {
  createProgram,
  initialProgramsState,
  levelOptionsFor,
  programsReducer,
  sanitizeLevels,
  validateProgramLevels,
  validateProgramName,
  validateProgramTarget,
} from '../../../features/vocabulary/programs.js';
import {
  PROGRAMS_KEY,
  SETTINGS_KEY,
  STORAGE_KEY,
  loadPrograms,
  loadSettings,
  programWordsKey,
  removeStoredWords,
  sanitizePrograms,
  savePrograms,
  saveSettings,
  saveWords,
} from '../../../features/vocabulary/storage.js';

const EMPTY = { programs: [], wordsByProgram: {} };

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** State with the given programs added. */
function stateWith(...programs) {
  return programs.reduce((state, program) => programsReducer(state, { type: 'program/added', program }), initialProgramsState);
}

/** A word action for one program. */
const wordAction = (programId, action) => ({ type: 'program/words', programId, action });

describe('validateProgramName', () => {
  const existing = [{ id: 'a', name: 'JLPT N5' }];

  test.each([
    ['a blank name', '  ', undefined, /Enter a program name/],
    ['a name over 60 characters', 'x'.repeat(61), undefined, /Maximum 60/],
    ['a name already used (ignoring case)', 'jlpt n5', undefined, /already exists/],
  ])('refuses %s', (_, name, ignoreId, message) => {
    const error = validateProgramName(name, existing, ignoreId);

    expect(error).toMatch(message);
  });

  test.each([
    ['a new name', 'TOEFL', undefined],
    ['the program’s own name while editing it', 'jlpt n5', 'a'],
  ])('accepts %s', (_, name, ignoreId) => {
    const error = validateProgramName(name, existing, ignoreId);

    expect(error).toBe('');
  });
});

describe('validateProgramTarget', () => {
  test.each(['1', '50', '100', 25])('accepts %p', (value) => {
    expect(validateProgramTarget(value)).toBe('');
  });

  test.each(['', '  ', '0', '101', '2.5', 'abc'])('refuses %p', (value) => {
    expect(validateProgramTarget(value)).toMatch(/whole number from 1 to 100/);
  });
});

describe('createProgram', () => {
  test('trims the name and defaults to English', () => {
    const name = '  TOEFL  ';

    const program = createProgram(name);

    expect(program.name).toBe('TOEFL');
    expect(program.wordLanguage).toBe('en');
  });

  test('accepts a language name', () => {
    const language = 'Japanese';

    const program = createProgram('N5', language);

    expect(program.wordLanguage).toBe('ja');
  });

  test('starts with the default learning targets', () => {
    const program = createProgram('TOEFL');

    expect(program).toMatchObject({ masteredLevel: 100, passedLevel: 100 });
  });

  test('copies the learning targets it is given', () => {
    const program = createProgram('TOEFL', 'en', [], { masteredLevel: 20, passedLevel: 500 });

    expect(program).toMatchObject({ masteredLevel: 20, passedLevel: 100 });
  });

  test('keeps its levels in the standard order', () => {
    const levels = ['N3', 'N4'];

    const program = createProgram('N4-N3', 'ja', levels);

    expect(program.levels).toEqual(['N4', 'N3']);
  });
});

describe('levels', () => {
  test.each([
    ['en', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']],
    ['es', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']],
    ['ja', ['N5', 'N4', 'N3', 'N2', 'N1']],
  ])('%s programs use %j', (language, expected) => {
    const options = levelOptionsFor(language);

    expect(options).toEqual(expected);
  });

  test.each([
    [[], 'en', 'Choose at least one level.'],
    [['N5'], 'en', 'Choose at least one level.'],
    [['b1'], 'en', ''],
    [['N3'], 'ja', ''],
  ])('levels %j for %s: %p', (levels, language, expected) => {
    const error = validateProgramLevels(levels, language);

    expect(error).toBe(expected);
  });

  test('keeps valid levels once each, in the standard order', () => {
    const levels = ['C1', 'a2', 'A2', 'N5', 'X'];

    const clean = sanitizeLevels(levels, 'en');

    expect(clean).toEqual(['A2', 'C1']);
  });
});

describe('programsReducer', () => {
  test('adds a program with an empty word list', () => {
    const program = createProgram('TOEFL');

    const state = programsReducer(initialProgramsState, { type: 'program/added', program });

    expect(state.programs).toEqual([program]);
    expect(state.wordsByProgram[program.id]).toEqual([]);
  });

  test('removes a program and its words', () => {
    const program = createProgram('TOEFL');
    const state = stateWith(program);

    const after = programsReducer(state, { type: 'program/removed', id: program.id });

    expect(after).toEqual(EMPTY);
  });

  test('a word action changes only the program it targets', () => {
    const a = createProgram('A');
    const b = createProgram('B');
    const word = createWord({ term: 'hello', meaning: 'halo' });

    const state = programsReducer(stateWith(a, b), wordAction(a.id, { type: 'words/added', words: [word] }));

    expect(state.wordsByProgram[a.id]).toHaveLength(1);
    expect(state.wordsByProgram[b.id]).toHaveLength(0);
  });

  test('passes answers on to the word list', () => {
    const program = createProgram('A');
    const word = createWord({ term: 'hello', meaning: 'halo' });
    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [word] }));

    const after = programsReducer(state, wordAction(program.id, { type: 'result/recorded', id: word.id, correct: true }));

    expect(after.wordsByProgram[program.id][0].mastery).toBe(1);
  });

  test('answers follow the program learning targets', () => {
    const program = createProgram('A', 'en', [], { masteredLevel: 2, passedLevel: 2 });
    const word = createWord({ term: 'hello', meaning: 'halo' });
    let state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [word] }));

    for (let i = 0; i < 3; i++) {
      state = programsReducer(state, wordAction(program.id, { type: 'result/recorded', id: word.id, correct: true, source: 'quiz' }));
    }

    expect(state.wordsByProgram[program.id][0]).toMatchObject({ mastery: 2, quizPassed: 3 });
  });

  test.each([
    ['a word action for a missing program', wordAction('missing', { type: 'words/cleared' })],
    ['an unknown action', { type: 'unknown' }],
  ])('ignores %s', (_, action) => {
    const state = stateWith(createProgram('A'));

    const after = programsReducer(state, action);

    expect(after).toBe(state);
  });

  test('every added word takes the program word language', () => {
    const program = createProgram('N5', 'ja');
    const english = createWord({ term: 'cat', wordLanguage: 'en' });

    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [english] }));

    expect(state.wordsByProgram[program.id][0].wordLanguage).toBe('ja');
  });

  test('an edit cannot change the word language', () => {
    const program = createProgram('N5', 'ja');
    const word = createWord({ term: 'cat', wordLanguage: 'en' });
    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [word] }));

    const after = programsReducer(
      state,
      wordAction(program.id, { type: 'word/updated', id: word.id, changes: { term: 'neko', wordLanguage: 'en' } }),
    );

    expect(after.wordsByProgram[program.id][0].term).toBe('Neko');
    expect(after.wordsByProgram[program.id][0].wordLanguage).toBe('ja');
  });
});

describe('saving and loading programs', () => {
  test('each program saves its words under its own key', () => {
    const storage = fakeStorage();
    const [a, b] = [createProgram('A'), createProgram('B')];

    const saved = [
      savePrograms([a, b], storage),
      saveWords([createWord({ term: 'cat' })], storage, programWordsKey(a.id)),
      saveWords([createWord({ term: 'dog' }), createWord({ term: 'fox' })], storage, programWordsKey(b.id)),
    ];

    expect(saved).toEqual([true, true, true]);
    expect(Object.keys(storage.data).sort()).toEqual([PROGRAMS_KEY, programWordsKey(a.id), programWordsKey(b.id)].sort());
  });

  test('loads the programs and their words back', () => {
    const storage = fakeStorage();
    const [a, b] = [createProgram('A'), createProgram('B')];
    savePrograms([a, b], storage);
    saveWords([createWord({ term: 'cat' })], storage, programWordsKey(a.id));
    saveWords([createWord({ term: 'dog' }), createWord({ term: 'fox' })], storage, programWordsKey(b.id));

    const loaded = loadPrograms(storage);

    expect(loaded.programs.map((program) => program.name)).toEqual(['A', 'B']);
    expect(loaded.wordsByProgram[a.id].map((word) => word.term)).toEqual(['Cat']);
    expect(loaded.wordsByProgram[b.id].map((word) => word.term)).toEqual(['Dog', 'Fox']);
  });

  test('removing a program’s words leaves it empty', () => {
    const storage = fakeStorage();
    const program = createProgram('A');
    savePrograms([program], storage);
    saveWords([createWord({ term: 'cat' })], storage, programWordsKey(program.id));

    removeStoredWords(programWordsKey(program.id), storage);

    expect(storage.data[programWordsKey(program.id)]).toBeUndefined();
    expect(loadPrograms(storage).wordsByProgram[program.id]).toEqual([]);
  });

  test('restores the levels', () => {
    const storage = fakeStorage();
    savePrograms([createProgram('N5', 'ja', ['N5', 'N4'])], storage);

    const { programs } = loadPrograms(storage);

    expect(programs[0].levels).toEqual(['N5', 'N4']);
  });

  test('restores the learning targets, defaulting older programs to 100', () => {
    const storage = fakeStorage({
      [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'a', name: 'Old', wordLanguage: 'en' }] }),
    });
    const program = createProgram('New', 'en', [], { masteredLevel: 7, passedLevel: 9 });

    const before = loadPrograms(storage).programs[0];
    savePrograms([before, program], storage);
    const { programs } = loadPrograms(storage);

    expect(programs.map((p) => [p.masteredLevel, p.passedLevel])).toEqual([[100, 100], [7, 9]]);
  });

  test('drops invalid stored levels', () => {
    const storage = fakeStorage({
      [PROGRAMS_KEY]: JSON.stringify({
        programs: [
          { id: 'a', name: 'Old', wordLanguage: 'en' },
          { id: 'b', name: 'Mixed', wordLanguage: 'en', levels: ['B2', 'N3', 'B2'] },
        ],
      }),
    });

    const { programs } = loadPrograms(storage);

    expect(programs.map((program) => program.levels)).toEqual([[], ['B2']]);
  });

  test('keeps one term with two meaning languages as two entries', () => {
    const program = createProgram('Daily', 'en', ['A1']);
    const words = [createWord({ term: 'book', meaning: 'buku', meaningLanguage: 'id' }), createWord({ term: 'book', meaning: '本', meaningLanguage: 'ja' })];
    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words }));
    const storage = fakeStorage();

    saveWords(state.wordsByProgram[program.id], storage, programWordsKey(program.id));

    const saved = JSON.parse(storage.data[programWordsKey(program.id)]).words;
    expect(saved.map((word) => [word.term, word.meaningLanguage, word.meaning])).toEqual([
      ['Book', 'id', 'Buku'],
      ['Book', 'ja', '本'],
    ]);
  });
});

describe('app settings', () => {
  test('default to 100 for both targets', () => {
    const settings = loadSettings(fakeStorage());

    expect(settings).toEqual({ masteredLevel: 100, passedLevel: 100 });
  });

  test('are saved and loaded back, kept within 1-100', () => {
    const storage = fakeStorage();

    const saved = saveSettings({ masteredLevel: 30, passedLevel: 0 }, storage);

    expect(saved).toBe(true);
    expect(loadSettings(storage)).toEqual({ masteredLevel: 30, passedLevel: 1 });
  });

  test('ignore damaged storage', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: '{oops' });

    expect(loadSettings(storage)).toEqual({ masteredLevel: 100, passedLevel: 100 });
    expect(saveSettings({}, null)).toBe(false);
  });
});

describe('migrating older data', () => {
  test('a program saved without a word language takes the one most of its words use', () => {
    const storage = fakeStorage({ [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'p', name: 'Old' }] }) });
    saveWords(
      [createWord({ term: 'ねこ', wordLanguage: 'ja' }), createWord({ term: 'いぬ', wordLanguage: 'ja' }), createWord({ term: 'cat', wordLanguage: 'en' })],
      storage,
      programWordsKey('p'),
    );

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs[0].wordLanguage).toBe('ja');
    expect(wordsByProgram.p.map((word) => word.wordLanguage)).toEqual(['ja', 'ja', 'ja']);
  });

  test('the inferred word language is saved with the program', () => {
    const storage = fakeStorage({ [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'p', name: 'Old' }] }) });
    saveWords([createWord({ term: 'ねこ', wordLanguage: 'ja' })], storage, programWordsKey('p'));
    const { programs } = loadPrograms(storage);

    savePrograms(programs, storage);

    expect(JSON.parse(storage.data[PROGRAMS_KEY]).programs[0].wordLanguage).toBe('ja');
  });

  test('words saved before programs existed move into a "My words" program', () => {
    const storage = fakeStorage();
    saveWords([createWord({ term: 'old' })], storage, STORAGE_KEY);

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs.map((program) => program.name)).toEqual(['My words']);
    expect(wordsByProgram[programs[0].id].map((word) => word.term)).toEqual(['Old']);
  });

  test('legacy words in several languages become one program per language', () => {
    const storage = fakeStorage();
    saveWords([createWord({ term: 'cat', wordLanguage: 'en' }), createWord({ term: 'ねこ', wordLanguage: 'ja' })], storage, STORAGE_KEY);

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs.map((program) => [program.name, program.wordLanguage])).toEqual([
      ['My words (English)', 'en'],
      ['My words (Japanese)', 'ja'],
    ]);
    expect(programs.map((program) => wordsByProgram[program.id].map((word) => word.term))).toEqual([['Cat'], ['ねこ']]);
  });

  test('once a program list is saved, the legacy list is no longer read', () => {
    const storage = fakeStorage();
    saveWords([createWord({ term: 'old' })], storage, STORAGE_KEY);
    savePrograms([], storage);

    const loaded = loadPrograms(storage);

    expect(loaded).toEqual(EMPTY);
  });
});

describe('damaged or blocked storage', () => {
  test.each([
    ['empty storage', fakeStorage()],
    ['no storage at all', null],
    ['a corrupt program list', fakeStorage({ [PROGRAMS_KEY]: '{oops' })],
  ])('loadPrograms survives %s', (_, storage) => {
    const loaded = loadPrograms(storage);

    expect(loaded).toEqual(EMPTY);
  });

  test.each([
    ['no storage at all', null],
    ['a full storage', { setItem() { throw new Error('quota'); } }],
  ])('savePrograms reports failure with %s', (_, storage) => {
    const saved = savePrograms([], storage);

    expect(saved).toBe(false);
  });

  test('removeStoredWords ignores a blocked storage', () => {
    const storage = { removeItem() { throw new Error('blocked'); } };

    const remove = () => removeStoredWords('x', storage);

    expect(remove).not.toThrow();
  });

  test('sanitizePrograms drops junk and gives repeated ids new ones', () => {
    const raw = [null, { name: '  ' }, { id: 'p', name: 'One' }, { id: 'p', name: 'Two' }, 'junk'];

    const programs = sanitizePrograms(raw);

    expect(programs.map((program) => program.name)).toEqual(['One', 'Two']);
    expect(programs[0].id).not.toBe(programs[1].id);
  });

  test('sanitizePrograms reads only a list', () => {
    const raw = 'nope';

    const programs = sanitizePrograms(raw);

    expect(programs).toEqual([]);
  });
});
