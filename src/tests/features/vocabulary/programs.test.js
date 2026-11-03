import { describe, expect, it } from '@jest/globals';
import { createWord } from '../../../features/vocabulary/model.js';
import {
  PROGRAM_LANGUAGE_OPTIONS,
  createProgram,
  initialProgramsState,
  isKanjiProgram,
  levelOptionsFor,
  parseProgramLanguage,
  programLanguageLabel,
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
  decodeStored,
  loadPrograms,
  loadSettings,
  programWordsKey,
  removeStoredWords,
  replaceStoredPrograms,
  sanitizePrograms,
  savePrograms,
  saveSettings,
  saveWords,
  storageUsage,
} from '../../../features/vocabulary/storage.js';
import { memoryStorage } from '../../helpers/memoryStorage.js';

const EMPTY = { programs: [], wordsByProgram: {} };

/** State with the given programs added. */
function stateWith(...programs) {
  return programs.reduce((state, program) => programsReducer(state, { type: 'program/added', program }), initialProgramsState);
}

/** A word action for one program. */
const wordAction = (programId, action) => ({ type: 'program/words', programId, action });

describe('validateProgramName', () => {
  const existing = [{ id: 'a', name: 'JLPT N5' }];

  it.each([
    ['a blank name', '  ', undefined, /Enter a program name/],
    ['a name over 60 characters', 'x'.repeat(61), undefined, /Maximum 60/],
    ['a name already used (ignoring case)', 'jlpt n5', undefined, /already exists/],
  ])('should refuse the name when it is %s', (_, name, ignoreId, message) => {
    const error = validateProgramName(name, existing, ignoreId);

    expect(error).toMatch(message);
  });

  it.each([
    ['a new name', 'TOEFL', undefined],
    ['the program’s own name while editing it', 'jlpt n5', 'a'],
  ])('should accept the name when it is %s', (_, name, ignoreId) => {
    const error = validateProgramName(name, existing, ignoreId);

    expect(error).toBe('');
  });
});

describe('validateProgramTarget', () => {
  it.each(['1', '50', '100', 25])('should accept the target when it is %p', (value) => {
    const error = validateProgramTarget(value);

    expect(error).toBe('');
  });

  it.each(['', '  ', '0', '101', '2.5', 'abc'])('should refuse the target when it is %p', (value) => {
    const error = validateProgramTarget(value);

    expect(error).toMatch(/whole number from 1 to 100/);
  });
});

describe('Japanese (Kanji) programs', () => {
  it('should offer Japanese (Kanji) right after Japanese when a word language is chosen', () => {
    const values = PROGRAM_LANGUAGE_OPTIONS.map((option) => option.value);

    const position = values.indexOf('ja-kanji');

    expect(position).toBe(values.indexOf('ja') + 1);
  });

  it.each([
    ['ja-kanji', { wordLanguage: 'ja', script: 'kanji' }],
    ['ja', { wordLanguage: 'ja', script: null }],
    ['en', { wordLanguage: 'en', script: null }],
  ])('should read %p as %j when the choice is parsed', (value, expected) => {
    const parsed = parseProgramLanguage(value);

    expect(parsed).toEqual(expected);
  });

  it('should be a Japanese program with JLPT levels when it is created', () => {
    const program = createProgram('Kanji N5', 'ja', ['N5'], { script: 'kanji' });

    expect(program).toMatchObject({ wordLanguage: 'ja', levels: ['N5'], script: 'kanji' });
    expect(isKanjiProgram(program)).toBe(true);
    expect(programLanguageLabel(program)).toBe('Japanese (Kanji)');
  });

  it.each([
    ['a Japanese program', createProgram('A', 'ja'), 'Japanese'],
    ['an English program asking for kanji', createProgram('B', 'en', [], { script: 'kanji' }), 'English'],
  ])('should not be a kanji program when it is %s', (_, program, label) => {
    const kanji = isKanjiProgram(program);

    expect(kanji).toBe(false);
    expect(program.script).toBeNull();
    expect(programLanguageLabel(program)).toBe(label);
  });

  it('should keep its script when programs are saved and loaded', () => {
    const storage = memoryStorage();
    savePrograms([createProgram('Kanji', 'ja', ['N5'], { script: 'kanji' }), createProgram('Plain', 'ja')], storage);

    const { programs } = loadPrograms(storage);

    expect(programs.map((program) => program.script)).toEqual(['kanji', null]);
  });

  it('should drop the script when a stored non-Japanese program has one', () => {
    const storage = memoryStorage({
      [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'a', name: 'Odd', wordLanguage: 'en', script: 'kanji' }] }),
    });

    const { programs } = loadPrograms(storage);

    expect(programs[0].script).toBeNull();
  });
});

describe('createProgram', () => {
  it('should trim the name and use English when no language is given', () => {
    const name = '  TOEFL  ';

    const program = createProgram(name);

    expect(program.name).toBe('TOEFL');
    expect(program.wordLanguage).toBe('en');
  });

  it('should store its code when the language is given by name', () => {
    const language = 'Japanese';

    const program = createProgram('N5', language);

    expect(program.wordLanguage).toBe('ja');
  });

  it('should use the default learning targets when none are given', () => {
    const program = createProgram('TOEFL');

    expect(program).toMatchObject({ masteredLevel: 100, passedLevel: 100 });
  });

  it('should copy the learning targets, within 1-100, when they are given', () => {
    const program = createProgram('TOEFL', 'en', [], { masteredLevel: 20, passedLevel: 500 });

    expect(program).toMatchObject({ masteredLevel: 20, passedLevel: 100 });
  });

  it('should keep the levels in the standard order when they are given in any order', () => {
    const levels = ['N3', 'N4'];

    const program = createProgram('N4-N3', 'ja', levels);

    expect(program.levels).toEqual(['N4', 'N3']);
  });
});

describe('levels', () => {
  it.each([
    ['en', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']],
    ['es', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']],
    ['ja', ['N5', 'N4', 'N3', 'N2', 'N1']],
  ])('should give %s programs the levels %j when levels are listed', (language, expected) => {
    const options = levelOptionsFor(language);

    expect(options).toEqual(expected);
  });

  it.each([
    [[], 'en', 'Choose at least one level.'],
    [['N5'], 'en', 'Choose at least one level.'],
    [['b1'], 'en', ''],
    [['N3'], 'ja', ''],
  ])('should judge levels %j for %s as %p when they are validated', (levels, language, expected) => {
    const error = validateProgramLevels(levels, language);

    expect(error).toBe(expected);
  });

  it('should keep valid levels once each, in the standard order, when levels are sanitized', () => {
    const levels = ['C1', 'a2', 'A2', 'N5', 'X'];

    const clean = sanitizeLevels(levels, 'en');

    expect(clean).toEqual(['A2', 'C1']);
  });
});

describe('programsReducer', () => {
  it('should add the program with an empty word list when a program is added', () => {
    const program = createProgram('TOEFL');

    const state = programsReducer(initialProgramsState, { type: 'program/added', program });

    expect(state.programs).toEqual([program]);
    expect(state.wordsByProgram[program.id]).toEqual([]);
  });

  it('should remove the program and its words when a program is removed', () => {
    const program = createProgram('TOEFL');
    const state = stateWith(program);

    const after = programsReducer(state, { type: 'program/removed', id: program.id });

    expect(after).toEqual(EMPTY);
  });

  it('should change only the targeted program when a word action runs', () => {
    const a = createProgram('A');
    const b = createProgram('B');
    const word = createWord({ term: 'hello', meaning: 'halo' });

    const state = programsReducer(stateWith(a, b), wordAction(a.id, { type: 'words/added', words: [word] }));

    expect(state.wordsByProgram[a.id]).toHaveLength(1);
    expect(state.wordsByProgram[b.id]).toHaveLength(0);
  });

  it('should update the word list when an answer is recorded', () => {
    const program = createProgram('A');
    const word = createWord({ term: 'hello', meaning: 'halo' });
    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [word] }));

    const after = programsReducer(state, wordAction(program.id, { type: 'result/recorded', id: word.id, correct: true }));

    expect(after.wordsByProgram[program.id][0].mastery).toBe(1);
  });

  it('should follow the program learning targets when answers are recorded', () => {
    const program = createProgram('A', 'en', [], { masteredLevel: 2, passedLevel: 2 });
    const word = createWord({ term: 'hello', meaning: 'halo' });
    let state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [word] }));

    for (let i = 0; i < 3; i++) {
      state = programsReducer(state, wordAction(program.id, { type: 'result/recorded', id: word.id, correct: true, source: 'quiz' }));
    }

    expect(state.wordsByProgram[program.id][0]).toMatchObject({ mastery: 2, quizPassed: 3 });
  });

  it.each([
    ['a word action for a missing program', wordAction('missing', { type: 'words/cleared' })],
    ['an unknown action', { type: 'unknown' }],
  ])('should ignore %s when it is dispatched', (_, action) => {
    const state = stateWith(createProgram('A'));

    const after = programsReducer(state, action);

    expect(after).toBe(state);
  });

  it('should give the word the program word language when a word is added', () => {
    const program = createProgram('N5', 'ja');
    const english = createWord({ term: 'cat', wordLanguage: 'en' });

    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words: [english] }));

    expect(state.wordsByProgram[program.id][0].wordLanguage).toBe('ja');
  });

  it('should keep the word language when an edit tries to change it', () => {
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
  it("should save each program's words under its own key when programs are saved", () => {
    const storage = memoryStorage();
    const [a, b] = [createProgram('A'), createProgram('B')];

    const saved = [
      savePrograms([a, b], storage),
      saveWords([createWord({ term: 'cat' })], storage, programWordsKey(a.id)),
      saveWords([createWord({ term: 'dog' }), createWord({ term: 'fox' })], storage, programWordsKey(b.id)),
    ];

    expect(saved).toEqual([true, true, true]);
    expect(Object.keys(storage.data).sort()).toEqual([PROGRAMS_KEY, programWordsKey(a.id), programWordsKey(b.id)].sort());
  });

  it('should load the programs and their words back when they were saved', () => {
    const storage = memoryStorage();
    const [a, b] = [createProgram('A'), createProgram('B')];
    savePrograms([a, b], storage);
    saveWords([createWord({ term: 'cat' })], storage, programWordsKey(a.id));
    saveWords([createWord({ term: 'dog' }), createWord({ term: 'fox' })], storage, programWordsKey(b.id));

    const loaded = loadPrograms(storage);

    expect(loaded.programs.map((program) => program.name)).toEqual(['A', 'B']);
    expect(loaded.wordsByProgram[a.id].map((word) => word.term)).toEqual(['Cat']);
    expect(loaded.wordsByProgram[b.id].map((word) => word.term)).toEqual(['Dog', 'Fox']);
  });

  it('should leave the program empty when its stored words are removed', () => {
    const storage = memoryStorage();
    const program = createProgram('A');
    savePrograms([program], storage);
    saveWords([createWord({ term: 'cat' })], storage, programWordsKey(program.id));

    removeStoredWords(programWordsKey(program.id), storage);

    expect(storage.data[programWordsKey(program.id)]).toBeUndefined();
    expect(loadPrograms(storage).wordsByProgram[program.id]).toEqual([]);
  });

  it('should restore the levels when programs are loaded', () => {
    const storage = memoryStorage();
    savePrograms([createProgram('N5', 'ja', ['N5', 'N4'])], storage);

    const { programs } = loadPrograms(storage);

    expect(programs[0].levels).toEqual(['N5', 'N4']);
  });

  it('should restore the targets, with 100 for older programs, when programs are loaded', () => {
    const storage = memoryStorage({
      [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'a', name: 'Old', wordLanguage: 'en' }] }),
    });
    const program = createProgram('New', 'en', [], { masteredLevel: 7, passedLevel: 9 });

    const before = loadPrograms(storage).programs[0];
    savePrograms([before, program], storage);
    const { programs } = loadPrograms(storage);

    expect(programs.map((p) => [p.masteredLevel, p.passedLevel])).toEqual([[100, 100], [7, 9]]);
  });

  it('should drop invalid levels when the stored levels are damaged', () => {
    const storage = memoryStorage({
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

  it('should keep two entries when one term has two meaning languages', () => {
    const program = createProgram('Daily', 'en', ['A1']);
    const words = [createWord({ term: 'book', meaning: 'buku', meaningLanguage: 'id' }), createWord({ term: 'book', meaning: '本', meaningLanguage: 'ja' })];
    const state = programsReducer(stateWith(program), wordAction(program.id, { type: 'words/added', words }));
    const storage = memoryStorage();

    saveWords(state.wordsByProgram[program.id], storage, programWordsKey(program.id));
    const saved = JSON.parse(decodeStored(storage.data[programWordsKey(program.id)])).words;

    expect(saved.map((word) => [word.term, word.meaningLanguage, word.meaning])).toEqual([
      ['Book', 'id', 'Buku'],
      ['Book', 'ja', '本'],
    ]);
  });
});

describe('replacing all stored programs (restoring a backup)', () => {
  const wordsFor = (count) => Array.from({ length: count }, (_, i) => createWord({ term: `w${i} ${Math.random()}`, meaning: `${Math.random()}` }));

  function storageWithOldData(quota) {
    const storage = memoryStorage({ other: 'kept' }, { quota });
    const old = createProgram('Old');
    savePrograms([old], storage);
    saveWords(wordsFor(5), storage, programWordsKey(old.id));
    return { storage, old };
  }

  it('should write the new programs and remove the old ones when everything is replaced', () => {
    const { storage, old } = storageWithOldData(1e6);
    const program = createProgram('New');

    const result = replaceStoredPrograms({ programs: [program], wordsByProgram: { [program.id]: wordsFor(3) } }, storage);
    const loaded = loadPrograms(storage);

    expect(result).toBe('saved');
    expect(loaded.programs.map((p) => p.name)).toEqual(['New']);
    expect(loaded.wordsByProgram[program.id]).toHaveLength(3);
    expect(programWordsKey(old.id) in storage.data).toBe(false);
    expect(storage.data.other).toBe('kept');
  });

  it('should reuse the space of the old data when the storage is nearly full', () => {
    const oldSize = storageUsage(storageWithOldData(1e6).storage);
    const quota = oldSize + 200; // too small for the old and new data side by side
    const { storage: tight } = storageWithOldData(quota);
    const program = createProgram('New');

    const result = replaceStoredPrograms({ programs: [program], wordsByProgram: { [program.id]: wordsFor(5) } }, tight);

    expect(result).toBe('saved');
  });

  it('should keep the old data when the new data does not fit', () => {
    const { storage, old } = storageWithOldData(3000);
    const before = { ...storage.data };
    const program = createProgram('Huge');

    const result = replaceStoredPrograms({ programs: [program], wordsByProgram: { [program.id]: wordsFor(500) } }, storage);

    expect(result).toBe('too-large');
    expect(storage.data).toEqual(before);
    expect(loadPrograms(storage).programs.map((p) => p.id)).toEqual([old.id]);
  });

  it('should report "unavailable" when there is no storage', () => {
    const result = replaceStoredPrograms({ programs: [], wordsByProgram: {} }, null);

    expect(result).toBe('unavailable');
  });

  it("should count only this app's keys when storage usage is measured", () => {
    const storage = memoryStorage({ other: 'x'.repeat(500) }, { quota: 1e6 });
    savePrograms([createProgram('A')], storage);

    const used = storageUsage(storage);

    expect(used).toBe(PROGRAMS_KEY.length + storage.data[PROGRAMS_KEY].length);
  });
});

describe('app settings', () => {
  it('should be 100 for both targets when nothing is saved', () => {
    const settings = loadSettings(memoryStorage());

    expect(settings).toEqual({ masteredLevel: 100, passedLevel: 100 });
  });

  it('should load the saved settings, within 1-100, when settings are saved', () => {
    const storage = memoryStorage();

    const saved = saveSettings({ masteredLevel: 30, passedLevel: 0 }, storage);

    expect(saved).toBe(true);
    expect(loadSettings(storage)).toEqual({ masteredLevel: 30, passedLevel: 1 });
  });

  it('should use the defaults when the stored settings are damaged', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{oops' });

    expect(loadSettings(storage)).toEqual({ masteredLevel: 100, passedLevel: 100 });
    expect(saveSettings({}, null)).toBe(false);
  });
});

describe('migrating older data', () => {
  it('should take the language most of its words use when a program has no word language', () => {
    const storage = memoryStorage({ [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'p', name: 'Old' }] }) });
    saveWords(
      [createWord({ term: 'ねこ', wordLanguage: 'ja' }), createWord({ term: 'いぬ', wordLanguage: 'ja' }), createWord({ term: 'cat', wordLanguage: 'en' })],
      storage,
      programWordsKey('p'),
    );

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs[0].wordLanguage).toBe('ja');
    expect(wordsByProgram.p.map((word) => word.wordLanguage)).toEqual(['ja', 'ja', 'ja']);
  });

  it('should save the inferred word language when programs are saved again', () => {
    const storage = memoryStorage({ [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'p', name: 'Old' }] }) });
    saveWords([createWord({ term: 'ねこ', wordLanguage: 'ja' })], storage, programWordsKey('p'));
    const { programs } = loadPrograms(storage);

    savePrograms(programs, storage);

    expect(JSON.parse(storage.data[PROGRAMS_KEY]).programs[0].wordLanguage).toBe('ja');
  });

  it('should move the words into a "My words" program when they were saved before programs existed', () => {
    const storage = memoryStorage();
    saveWords([createWord({ term: 'old' })], storage, STORAGE_KEY);

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs.map((program) => program.name)).toEqual(['My words']);
    expect(wordsByProgram[programs[0].id].map((word) => word.term)).toEqual(['Old']);
  });

  it('should make one program per language when legacy words use several languages', () => {
    const storage = memoryStorage();
    saveWords([createWord({ term: 'cat', wordLanguage: 'en' }), createWord({ term: 'ねこ', wordLanguage: 'ja' })], storage, STORAGE_KEY);

    const { programs, wordsByProgram } = loadPrograms(storage);

    expect(programs.map((program) => [program.name, program.wordLanguage])).toEqual([
      ['My words (English)', 'en'],
      ['My words (Japanese)', 'ja'],
    ]);
    expect(programs.map((program) => wordsByProgram[program.id].map((word) => word.term))).toEqual([['Cat'], ['ねこ']]);
  });

  it('should no longer read the legacy list when a program list is saved', () => {
    const storage = memoryStorage();
    saveWords([createWord({ term: 'old' })], storage, STORAGE_KEY);
    savePrograms([], storage);

    const loaded = loadPrograms(storage);

    expect(loaded).toEqual(EMPTY);
  });
});

describe('damaged or blocked storage', () => {
  it.each([
    ['empty storage', memoryStorage()],
    ['no storage at all', null],
    ['a corrupt program list', memoryStorage({ [PROGRAMS_KEY]: '{oops' })],
  ])('should not crash when loadPrograms meets %s', (_, storage) => {
    const loaded = loadPrograms(storage);

    expect(loaded).toEqual(EMPTY);
  });

  it.each([
    ['no storage at all', null],
    ['a full storage', { setItem() { throw new Error('quota'); } }],
  ])('should report failure when savePrograms meets %s', (_, storage) => {
    const saved = savePrograms([], storage);

    expect(saved).toBe(false);
  });

  it('should not throw when removeStoredWords meets a blocked storage', () => {
    const storage = { removeItem() { throw new Error('blocked'); } };

    const remove = () => removeStoredWords('x', storage);

    expect(remove).not.toThrow();
  });

  it('should drop junk and give new ids when sanitizePrograms meets repeated ids', () => {
    const raw = [null, { name: '  ' }, { id: 'p', name: 'One' }, { id: 'p', name: 'Two' }, 'junk'];

    const programs = sanitizePrograms(raw);

    expect(programs.map((program) => program.name)).toEqual(['One', 'Two']);
    expect(programs[0].id).not.toBe(programs[1].id);
  });

  it('should return an empty list when sanitizePrograms gets something other than a list', () => {
    const raw = 'nope';

    const programs = sanitizePrograms(raw);

    expect(programs).toEqual([]);
  });
});
