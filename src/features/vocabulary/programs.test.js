import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWord } from './model.js';
import {
  createProgram,
  initialProgramsState,
  levelOptionsFor,
  programsReducer,
  sanitizeLevels,
  validateProgramLevels,
  validateProgramName,
} from './programs.js';
import {
  PROGRAMS_KEY,
  STORAGE_KEY,
  loadPrograms,
  programWordsKey,
  removeStoredWords,
  sanitizePrograms,
  savePrograms,
  saveWords,
} from './storage.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

test('validateProgramName requires a unique name within the limit', () => {
  const existing = [{ id: 'a', name: 'JLPT N5' }];
  assert.equal(validateProgramName('  ', existing), 'Enter a program name.');
  assert.match(validateProgramName('x'.repeat(61), existing), /Maximum 60/);
  assert.match(validateProgramName('jlpt n5', existing), /already exists/);
  assert.equal(validateProgramName('jlpt n5', existing, 'a'), '');
  assert.equal(validateProgramName('TOEFL', existing), '');
});

test('programsReducer adds and removes programs', () => {
  const program = createProgram('  TOEFL  ');
  assert.equal(program.name, 'TOEFL');
  assert.equal(program.wordLanguage, 'en');
  assert.equal(createProgram('N5', 'Japanese').wordLanguage, 'ja');

  let state = programsReducer(initialProgramsState, { type: 'program/added', program });
  assert.deepEqual(state.programs, [program]);
  assert.deepEqual(state.wordsByProgram[program.id], []);

  state = programsReducer(state, { type: 'program/removed', id: program.id });
  assert.deepEqual(state, { programs: [], wordsByProgram: {} });
});

test('word actions only change the program they target', () => {
  const a = createProgram('A');
  const b = createProgram('B');
  let state = programsReducer(initialProgramsState, { type: 'program/added', program: a });
  state = programsReducer(state, { type: 'program/added', program: b });

  const word = createWord({ term: 'hello', meaning: 'halo' });
  state = programsReducer(state, { type: 'program/words', programId: a.id, action: { type: 'words/added', words: [word] } });
  assert.equal(state.wordsByProgram[a.id].length, 1);
  assert.equal(state.wordsByProgram[b.id].length, 0);

  state = programsReducer(state, {
    type: 'program/words',
    programId: a.id,
    action: { type: 'result/recorded', id: word.id, correct: true },
  });
  assert.equal(state.wordsByProgram[a.id][0].mastery, 1);

  const unchanged = programsReducer(state, { type: 'program/words', programId: 'missing', action: { type: 'words/cleared' } });
  assert.equal(unchanged, state);
  assert.equal(programsReducer(state, { type: 'unknown' }), state);
});

test('each program saves its words under its own key and loads back', () => {
  const storage = fakeStorage();
  const a = createProgram('A');
  const b = createProgram('B');
  assert.equal(savePrograms([a, b], storage), true);
  assert.equal(saveWords([createWord({ term: 'cat' })], storage, programWordsKey(a.id)), true);
  assert.equal(saveWords([createWord({ term: 'dog' }), createWord({ term: 'fox' })], storage, programWordsKey(b.id)), true);

  assert.ok(storage.data[PROGRAMS_KEY]);
  assert.ok(storage.data[programWordsKey(a.id)]);
  assert.ok(storage.data[programWordsKey(b.id)]);

  const loaded = loadPrograms(storage);
  assert.deepEqual(loaded.programs.map((p) => p.name), ['A', 'B']);
  assert.deepEqual(loaded.wordsByProgram[a.id].map((w) => w.term), ['Cat']);
  assert.deepEqual(loaded.wordsByProgram[b.id].map((w) => w.term), ['Dog', 'Fox']);

  removeStoredWords(programWordsKey(a.id), storage);
  assert.equal(storage.data[programWordsKey(a.id)], undefined);
  assert.deepEqual(loadPrograms(storage).wordsByProgram[a.id], []);
});

test('levels are CEFR, or JLPT for Japanese, and at least one is required', () => {
  assert.deepEqual(levelOptionsFor('en'), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.deepEqual(levelOptionsFor('es'), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.deepEqual(levelOptionsFor('ja'), ['N5', 'N4', 'N3', 'N2', 'N1']);

  assert.equal(validateProgramLevels([], 'en'), 'Choose at least one level.');
  assert.equal(validateProgramLevels(['N5'], 'en'), 'Choose at least one level.');
  assert.equal(validateProgramLevels(['b1'], 'en'), '');
  assert.equal(validateProgramLevels(['N3'], 'ja'), '');

  // Several levels can be chosen; they are kept once each, in the standard order.
  assert.deepEqual(sanitizeLevels(['C1', 'a2', 'A2', 'N5', 'X'], 'en'), ['A2', 'C1']);
  assert.deepEqual(createProgram('N4-N3', 'ja', ['N3', 'N4']).levels, ['N4', 'N3']);
});

test('levels are saved and restored, and invalid stored levels are dropped', () => {
  const storage = fakeStorage();
  const program = createProgram('N5', 'ja', ['N5', 'N4']);
  savePrograms([program], storage);
  assert.deepEqual(loadPrograms(storage).programs[0].levels, ['N5', 'N4']);

  const old = fakeStorage({
    [PROGRAMS_KEY]: JSON.stringify({
      programs: [
        { id: 'a', name: 'Old', wordLanguage: 'en' },
        { id: 'b', name: 'Mixed', wordLanguage: 'en', levels: ['B2', 'N3', 'B2'] },
      ],
    }),
  });
  assert.deepEqual(loadPrograms(old).programs.map((p) => p.levels), [[], ['B2']]);
});

test('every word in a program uses the program word language', () => {
  const program = createProgram('N5', 'ja');
  let state = programsReducer(initialProgramsState, { type: 'program/added', program });
  const english = createWord({ term: 'cat', wordLanguage: 'en' });
  state = programsReducer(state, { type: 'program/words', programId: program.id, action: { type: 'words/added', words: [english] } });
  assert.equal(state.wordsByProgram[program.id][0].wordLanguage, 'ja');

  state = programsReducer(state, {
    type: 'program/words',
    programId: program.id,
    action: { type: 'word/updated', id: english.id, changes: { term: 'neko', wordLanguage: 'en' } },
  });
  assert.equal(state.wordsByProgram[program.id][0].term, 'Neko');
  assert.equal(state.wordsByProgram[program.id][0].wordLanguage, 'ja');
});

test('a program saved without a word language takes the one most of its words use', () => {
  const storage = fakeStorage({ [PROGRAMS_KEY]: JSON.stringify({ programs: [{ id: 'p', name: 'Old' }] }) });
  saveWords(
    [createWord({ term: 'ねこ', wordLanguage: 'ja' }), createWord({ term: 'いぬ', wordLanguage: 'ja' }), createWord({ term: 'cat', wordLanguage: 'en' })],
    storage,
    programWordsKey('p'),
  );
  const { programs, wordsByProgram } = loadPrograms(storage);
  assert.equal(programs[0].wordLanguage, 'ja');
  assert.deepEqual(wordsByProgram.p.map((w) => w.wordLanguage), ['ja', 'ja', 'ja']);

  savePrograms(programs, storage);
  assert.equal(JSON.parse(storage.data[PROGRAMS_KEY]).programs[0].wordLanguage, 'ja');
});

test('legacy words in several languages become one program per language', () => {
  const storage = fakeStorage();
  saveWords([createWord({ term: 'cat', wordLanguage: 'en' }), createWord({ term: 'ねこ', wordLanguage: 'ja' })], storage, STORAGE_KEY);
  const { programs, wordsByProgram } = loadPrograms(storage);
  assert.deepEqual(programs.map((p) => [p.name, p.wordLanguage]), [
    ['My words (English)', 'en'],
    ['My words (Japanese)', 'ja'],
  ]);
  assert.deepEqual(programs.map((p) => wordsByProgram[p.id].map((w) => w.term)), [['Cat'], ['ねこ']]);
});

test('words saved before programs existed move into a "My words" program', () => {
  const storage = fakeStorage();
  saveWords([createWord({ term: 'old' })], storage, STORAGE_KEY);

  const migrated = loadPrograms(storage);
  assert.equal(migrated.programs.length, 1);
  assert.equal(migrated.programs[0].name, 'My words');
  assert.deepEqual(migrated.wordsByProgram[migrated.programs[0].id].map((w) => w.term), ['Old']);

  // Once a program list is saved, the legacy key is no longer read.
  savePrograms([], storage);
  assert.deepEqual(loadPrograms(storage), { programs: [], wordsByProgram: {} });
});

test('loadPrograms and sanitizePrograms survive empty, corrupt and blocked storage', () => {
  assert.deepEqual(loadPrograms(fakeStorage()), { programs: [], wordsByProgram: {} });
  assert.deepEqual(loadPrograms(null), { programs: [], wordsByProgram: {} });
  assert.deepEqual(loadPrograms(fakeStorage({ [PROGRAMS_KEY]: '{oops' })), { programs: [], wordsByProgram: {} });
  assert.equal(savePrograms([], null), false);
  assert.equal(savePrograms([], { setItem() { throw new Error('quota'); } }), false);
  removeStoredWords('x', { removeItem() { throw new Error('blocked'); } });

  const clean = sanitizePrograms([null, { name: '  ' }, { id: 'p', name: 'One' }, { id: 'p', name: 'Two' }, 'junk']);
  assert.deepEqual(clean.map((p) => p.name), ['One', 'Two']);
  assert.notEqual(clean[0].id, clean[1].id);
  assert.deepEqual(sanitizePrograms('nope'), []);
});

test('one term with two meaning languages is stored as two entries', () => {
  const program = createProgram('Daily', 'en', ['A1']);
  let state = programsReducer(initialProgramsState, { type: 'program/added', program });
  for (const [meaning, meaningLanguage] of [['buku', 'id'], ['本', 'ja']]) {
    state = programsReducer(state, {
      type: 'program/words',
      programId: program.id,
      action: { type: 'words/added', words: [createWord({ term: 'book', meaning, meaningLanguage })] },
    });
  }
  const storage = fakeStorage();
  saveWords(state.wordsByProgram[program.id], storage, programWordsKey(program.id));
  const saved = JSON.parse(storage.data[programWordsKey(program.id)]).words;
  assert.deepEqual(saved.map((w) => [w.term, w.meaningLanguage, w.meaning]), [
    ['Book', 'id', 'Buku'],
    ['Book', 'ja', '本'],
  ]);
});
