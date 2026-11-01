import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_OPTIONS,
  MASTERED_LEVEL,
  PASSED_LEVEL,
  isPassed,
  quizProgressOf,
  resetProgress,
  applyResult,
  createWord,
  detectWordLanguage,
  findByTerm,
  getStatus,
  getWordSuggestions,
  groupByTerm,
  summarizeWords,
  termKey,
  toJapaneseReading,
  validateWordInput,
} from './model.js';
import { getLanguage } from '../../languages/index.js';
import { initialVocabularyState, vocabularyReducer } from './reducer.js';
import { loadWords, sanitizeWords, saveWords, STORAGE_KEY } from './storage.js';

const word = (term, meaning, extra = {}) => ({ ...createWord({ term, meaning }), ...extra });

test('createWord trims fields and starts with no progress', () => {
  const w = createWord({
    term: '  hello  ',
    meaning: ' halo ',
    wordLanguage: 'ja',
    meaningLanguage: 'en',
  });
  assert.equal(w.term, 'Hello');
  assert.equal(w.wordLanguage, 'ja');
  assert.equal(w.meaningLanguage, 'en');
  assert.deepEqual([w.mastery, w.attempts, w.correctCount], [0, 0, 0]);
  assert.ok(w.id);
});

test('validateWordInput requires term but allows blank meaning and enforces limits', () => {
  assert.deepEqual(Object.keys(validateWordInput({ term: ' ', meaning: '' })).sort(), ['term']);
  assert.deepEqual(validateWordInput({ term: 'a', meaning: '' }), {});
  assert.deepEqual(validateWordInput({ term: 'a', meaning: 'x'.repeat(401) }).meaning, 'Maksimal 400 karakter.');
  assert.ok(validateWordInput({ term: 'a'.repeat(121), meaning: 'b' }).term);
});

test('findByTerm ignores case, accents and the edited word itself', () => {
  const a = word('Café', 'kafe');
  assert.equal(findByTerm([a], 'cafe'), a);
  assert.equal(findByTerm([a], 'cafe', a.id), undefined);
  assert.equal(findByTerm([a], 'tea'), undefined);
});

test('the same term may exist once per meaning language', () => {
  const id = word('Café', 'kafe', { meaningLanguage: 'id' });
  const en = word('cafe', 'coffee shop', { meaningLanguage: 'en' });
  const list = [id, en];
  assert.equal(findByTerm(list, 'café', undefined, 'id'), id);
  assert.equal(findByTerm(list, 'café', undefined, 'en'), en);
  assert.equal(findByTerm(list, 'café', undefined, 'ja'), undefined);
  assert.equal(findByTerm(list, 'café', en.id, 'en'), undefined); // editing that entry itself
});

test('groupByTerm shows one row per term with every meaning entry inside', () => {
  const a = word('book', 'buku', { meaningLanguage: 'id' });
  const b = word('pen', 'pena', { meaningLanguage: 'id' });
  const c = word('Book', 'livre', { meaningLanguage: 'fr' });
  const groups = groupByTerm([a, b, c]);
  assert.deepEqual(groups.map((g) => g.term), ['Book', 'Pen']);
  assert.deepEqual(groups[0].words, [a, c]);
  assert.deepEqual(groupByTerm([]), []);
});

test('detectWordLanguage reads the script only, never guesses from Latin letters', () => {
  assert.equal(detectWordLanguage('日本語'), 'ja');
  assert.equal(detectWordLanguage('コーヒー'), 'ja');
  assert.equal(detectWordLanguage('にほん'), 'ja');
  // Latin text keeps the fallback: "agenda" and "sushi" must not turn into kana by accident.
  assert.equal(detectWordLanguage('agenda'), 'en');
  assert.equal(detectWordLanguage('watashi'), 'en');
  assert.equal(detectWordLanguage('hello', 'es'), 'es');
});

test('Japanese words are read as romaji only when Japanese is the word language', () => {
  assert.equal(createWord({ term: 'agenda', meaning: 'agenda' }).term, 'Agenda');
  assert.equal(createWord({ term: 'agenda', meaning: 'agenda' }).wordLanguage, 'en');

  const japanese = createWord({ term: 'watashi', meaning: 'saya', wordLanguage: 'ja' });
  assert.equal(japanese.term, 'わたし');
  assert.equal(japanese.wordLanguage, 'ja');

  // Kanji and katakana typed through the IME are saved exactly as typed.
  assert.equal(createWord({ term: '日本', wordLanguage: 'ja' }).term, '日本');
  assert.equal(createWord({ term: 'コーヒー', wordLanguage: 'ja' }).term, 'コーヒー');
  // Imported kanji is recognised without a language column.
  assert.equal(createWord({ term: '日本語', meaning: 'bahasa Jepang' }).wordLanguage, 'ja');

  assert.equal(toJapaneseReading('watashi'), 'わたし');
  assert.equal(toJapaneseReading('konnichiwa'), 'こんにちわ');
  assert.equal(toJapaneseReading('nomimono'), 'のみもの');
  assert.equal(toJapaneseReading('こんばんは'), 'こんばんは');
  assert.equal(toJapaneseReading('hello'), 'hello');
});

test('language options are limited to the approved list', () => {
  assert.deepEqual(
    LANGUAGE_OPTIONS.map((option) => option.value),
    ['en', 'id', 'ja', 'es', 'de', 'fr', 'it', 'nl', 'pt', 'pl'],
  );
});

test('mobile keyboard hints follow the selected word language', () => {
  assert.deepEqual(getLanguage('ja').inputProps, {
    lang: 'ja',
    inputMode: 'text',
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
  });
  assert.deepEqual(getLanguage('en').inputProps, {
    lang: 'en',
    inputMode: 'text',
    autoCapitalize: 'sentences',
    autoCorrect: 'on',
    spellCheck: true,
  });
});

test('word suggestions match the selected language and romaji input', () => {
  const words = [
    word('watashi', 'I', { wordLanguage: 'ja' }),
    word('arigatou', 'thank you', { wordLanguage: 'ja' }),
    word('apple', 'apel', { wordLanguage: 'en' }),
  ];

  assert.deepEqual(getWordSuggestions(words, 'wa', 'ja'), ['わたし']);
  assert.deepEqual(getWordSuggestions(words, 'ar', 'ja'), ['ありがとう']);
  assert.deepEqual(getWordSuggestions(words, 'ap', 'en'), ['Apple']);
});

test('applyResult raises mastery up to 100 and resets it on a wrong answer', () => {
  assert.equal(MASTERED_LEVEL, 100);
  let w = word('a', 'b');
  for (let i = 0; i < 99; i++) w = applyResult(w, true);
  assert.equal(w.mastery, 99);
  assert.equal(getStatus(w), 'learning', 'one short of mastered');
  for (let i = 0; i < 5; i++) w = applyResult(w, true);
  assert.equal(w.mastery, 100, 'capped at the mastered level');
  assert.equal(w.attempts, 104);
  assert.equal(getStatus(w), 'mastered');
  w = applyResult(w, false);
  assert.equal(w.mastery, 0);
  assert.equal(w.correctCount, 104);
  assert.equal(getStatus(w), 'weak');
});

test('getStatus and summarizeWords', () => {
  const words = [
    word('a', 'b'),
    word('c', 'd', { attempts: 2, mastery: 1 }),
    word('e', 'f', { attempts: 100, mastery: MASTERED_LEVEL }),
    word('g', 'h', { attempts: 1, mastery: 0 }),
  ];
  assert.deepEqual(summarizeWords(words), { total: 4, new: 1, learning: 1, mastered: 1, weak: 1, passed: 0 });
});

test('reducer adds, updates, removes, records results and resets', () => {
  const a = word('a', 'b');
  const b = word('c', 'd');
  let state = vocabularyReducer(initialVocabularyState, { type: 'words/added', words: [a, b] });
  assert.equal(state.words.length, 2);

  state = vocabularyReducer(state, { type: 'word/updated', id: a.id, changes: { meaning: '  baru ', mastery: 3 } });
  assert.equal(state.words[0].meaning, 'Baru');
  assert.equal(state.words[0].mastery, 0, 'progress is not editable');

  state = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true });
  assert.equal(state.words[1].mastery, 1);

  state = vocabularyReducer(state, { type: 'progress/reset' });
  assert.equal(state.words[1].mastery, 0);

  state = vocabularyReducer(state, { type: 'word/removed', id: a.id });
  assert.deepEqual(state.words.map((w) => w.id), [b.id]);

  state = vocabularyReducer(state, { type: 'words/cleared' });
  assert.deepEqual(state.words, []);
});

test('reducer skipDuplicates drops terms that already exist', () => {
  const a = word('Hello', 'halo');
  const state = vocabularyReducer(
    { words: [a] },
    { type: 'words/added', skipDuplicates: true, words: [word('hello', 'x'), word('new', 'baru'), word('NEW', 'y')] },
  );
  assert.deepEqual(state.words.map((w) => w.term), ['Hello', 'New']);
});

test('sanitizeWords discards junk and repairs fields', () => {
  const out = sanitizeWords([
    null,
    'x',
    { term: 'ok', meaning: 'fine', mastery: 250, attempts: -3, id: 'same' },
    { term: 'dup id', meaning: 'm', id: 'same' },
    { term: '', meaning: 'no term' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].mastery, MASTERED_LEVEL);
  assert.equal(out[0].attempts, 0);
  assert.notEqual(out[0].id, out[1].id);
  assert.deepEqual(sanitizeWords('nope'), []);
});

test('reducer ignores unknown actions and termKey falls back cleanly for blank text', () => {
  const state = { words: [word('Hello', 'halo')] };
  assert.equal(vocabularyReducer(state, { type: 'unexpected' }), state);
  assert.equal(termKey(''), '');
  assert.equal(termKey('  '), '');
  assert.equal(termKey('!!!'), '!!!');
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test('saveWords stores term, meaning, languages and progress, and loadWords restores the clean shape', () => {
  const storage = fakeStorage();
  const words = [
    { id: 'w1', term: 'thrive', meaning: 'tumbuh subur', wordLanguage: 'en', meaningLanguage: 'id', mastery: 2, attempts: 5, correctCount: 4, createdAt: 123 },
    { id: 'w2', term: 'swift', meaning: 'cepat', wordLanguage: 'en', meaningLanguage: 'id', mastery: 0, attempts: 1, correctCount: 0, createdAt: 456 },
  ];

  assert.equal(saveWords(words, storage), true);

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.deepEqual(raw.words, [
    {
      id: 'w1',
      term: 'thrive',
      wordLanguage: 'en',
      meaningLanguage: 'id',
      mastery: 2,
      quizPassed: 0,
      attempts: 5,
      correctCount: 4,
      createdAt: 123,
      meaning: 'tumbuh subur',
    },
    {
      id: 'w2',
      term: 'swift',
      wordLanguage: 'en',
      meaningLanguage: 'id',
      mastery: 0,
      quizPassed: 0,
      attempts: 1,
      correctCount: 0,
      createdAt: 456,
      meaning: 'cepat',
    },
  ]);

  assert.deepEqual(loadWords(storage).map((w) => w.meaning), ['Tumbuh Subur', 'Cepat']);

  assert.deepEqual(
    loadWords(storage).map(({ id, term, wordLanguage, meaningLanguage, mastery, attempts, correctCount, createdAt }) => ({
      id,
      term,
      wordLanguage,
      meaningLanguage,
      mastery,
      attempts,
      correctCount,
      createdAt,
    })),
    [
      {
        id: 'w1',
        term: 'Thrive',
        wordLanguage: 'en',
        meaningLanguage: 'id',
        mastery: 2,
        attempts: 5,
        correctCount: 4,
        createdAt: 123,
      },
      {
        id: 'w2',
        term: 'Swift',
        wordLanguage: 'en',
        meaningLanguage: 'id',
        mastery: 0,
        attempts: 1,
        correctCount: 0,
        createdAt: 456,
      },
    ],
  );

  const sanitized = sanitizeWords([{ term: 'ok', meaning: 'fine', createdAt: Number.NaN }]);
  assert.equal(sanitized.length, 1);
  assert.ok(Number.isFinite(sanitized[0].createdAt));
});

test('loadWords survives corrupt data and blocked storage', () => {
  assert.deepEqual(loadWords(fakeStorage({ [STORAGE_KEY]: '{not json' })), []);
  assert.deepEqual(loadWords(null), []);
  assert.deepEqual(loadWords({ getItem: () => '' }), []);
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(loadWords(throwing), []);
  assert.equal(saveWords([], throwing), false);
  assert.equal(saveWords([], null), false);

  // Keep the descriptor rather than the value: reading Node's built-in
  // localStorage getter prints an ExperimentalWarning.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('blocked');
    },
    configurable: true,
  });
  try {
    assert.deepEqual(loadWords(), []);
    assert.equal(saveWords([], undefined), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('words and meanings are kept in Title Case when created, edited and loaded', () => {
  const w = createWord({ term: '  persuade ', meaning: 'membujuk, MEYAKINKAN' });
  assert.deepEqual([w.term, w.meaning], ['Persuade', 'Membujuk, Meyakinkan']);
  assert.equal(createWord({ term: "it's well-known", meaning: 'terima kasih (banyak)' }).term, "It's Well-Known");
  assert.equal(createWord({ term: 'x', meaning: 'terima kasih (banyak)' }).meaning, 'Terima Kasih (Banyak)');

  // Upper-case romaji must not turn into katakana: MIGI -> みぎ, not ミギ. Kana and kanji are unchanged.
  assert.equal(createWord({ term: 'MIGI', wordLanguage: 'ja' }).term, 'みぎ');
  assert.equal(createWord({ term: '右', wordLanguage: 'ja', meaning: 'kanan' }).meaning, 'Kanan');

  const state = vocabularyReducer({ words: [w] }, { type: 'word/updated', id: w.id, changes: { term: 'convince', meaning: 'MEYAKINKAN' } });
  assert.deepEqual([state.words[0].term, state.words[0].meaning], ['Convince', 'Meyakinkan']);

  const old = sanitizeWords([{ id: 'x', term: 'selasa', meaning: 'tuesday', wordLanguage: 'id', meaningLanguage: 'en' }]);
  assert.deepEqual([old[0].term, old[0].meaning], ['Selasa', 'Tuesday']);
});

test('toTitleCase keeps spaces and length while typing', async () => {
  const { toTitleCase, titleText } = await import('../../lib/text.js');
  assert.equal(toTitleCase('terima kasih '), 'Terima Kasih ');
  assert.equal(toTitleCase('tumbuh subur, berkembang'), 'Tumbuh Subur, Berkembang');
  assert.equal(toTitleCase('l\'eau / "quoted"'), 'L\'eau / "Quoted"');
  assert.equal(toTitleCase('みぎ'), 'みぎ');
  assert.equal(titleText('  café  au   lait '), 'Café Au Lait');
});

test('correct quiz answers count towards Passed at 100; wrong answers and flashcards do not', () => {
  assert.equal(PASSED_LEVEL, 100);
  let w = word('a', 'b');
  for (let i = 0; i < 99; i++) w = applyResult(w, true, 'quiz');
  w = applyResult(w, false, 'quiz'); // a wrong answer does not reset it
  w = applyResult(w, true, 'flashcards'); // flashcards do not count
  assert.equal(w.quizPassed, 99);
  assert.equal(isPassed(w), false);
  assert.equal(w.mastery, 1, 'mastery still resets on the wrong answer');

  w = applyResult(w, true, 'quiz');
  assert.equal(w.quizPassed, 100);
  assert.equal(isPassed(w), true);
  assert.equal(summarizeWords([w, word('c', 'd')]).passed, 1);

  // Reducer, storage and reset.
  let state = vocabularyReducer({ words: [word('x', 'y')] }, { type: 'result/recorded', id: undefined, correct: true });
  const target = state.words[0];
  state = vocabularyReducer(state, { type: 'result/recorded', id: target.id, correct: true, source: 'quiz' });
  assert.equal(state.words[0].quizPassed, 1);
  state = vocabularyReducer(state, { type: 'result/recorded', id: target.id, correct: true });
  assert.equal(state.words[0].quizPassed, 1, 'no source means flashcards');

  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
  saveWords([w], storage);
  assert.equal(JSON.parse(data[STORAGE_KEY]).words[0].quizPassed, 100);
  assert.equal(isPassed(loadWords(storage)[0]), true);
  assert.equal(sanitizeWords([{ term: 'old' }])[0].quizPassed, 0, 'lists saved before the flag start at 0');

  assert.equal(resetProgress(w).quizPassed, 0);
});

test('quizProgressOf sums correct quiz answers, each word counting up to 100', () => {
  const words = [
    word('a', 'b', { quizPassed: 150 }), // counts as 100, passed
    word('c', 'd', { quizPassed: 50 }),
    word('e', 'f'), // no quiz answers yet
    word('g', 'h', { quizPassed: 100 }),
  ];
  assert.deepEqual(quizProgressOf(words), { passed: 2, total: 4, points: 250, max: 400, percent: 62 });
  assert.deepEqual(quizProgressOf([]), { passed: 0, total: 0, points: 0, max: 0, percent: 0 });
});

test('meaning languages never include the word language itself', async () => {
  const { defaultMeaningLanguage, meaningLanguageOptions } = await import('./model.js');
  assert.ok(!meaningLanguageOptions('ja').some((option) => option.value === 'ja'));
  assert.equal(meaningLanguageOptions('ja').length, LANGUAGE_OPTIONS.length - 1);
  // The most used meaning language of the program, else Indonesian, else the first other language.
  assert.equal(defaultMeaningLanguage([word('a', 'b', { meaningLanguage: 'en' })], 'ja'), 'en');
  assert.equal(defaultMeaningLanguage([], 'ja'), 'id');
  assert.equal(defaultMeaningLanguage([], 'id'), 'en');
});
