import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_TARGETS,
  LANGUAGE_OPTIONS,
  applyResult,
  createWord,
  defaultMeaningLanguage,
  detectWordLanguage,
  findByTerm,
  getStatus,
  getWordSuggestions,
  groupByTerm,
  isPassed,
  meaningLanguageOptions,
  quizProgressOf,
  resetProgress,
  sanitizeTarget,
  summarizeWords,
  targetsOf,
  termKey,
  toJapaneseReading,
  validateWordInput,
} from '../../../features/vocabulary/model.js';
import { initialVocabularyState, vocabularyReducer } from '../../../features/vocabulary/reducer.js';
import { loadWords, sanitizeWords, saveWords, STORAGE_KEY } from '../../../features/vocabulary/storage.js';

const word = (term, meaning, extra = {}) => ({ ...createWord({ term, meaning }), ...extra });

/** The word after `times` answers. */
function answered(start, times, correct, source) {
  let result = start;
  for (let i = 0; i < times; i++) result = applyResult(result, correct, source);
  return result;
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('createWord', () => {
  test('trims the fields, keeps the languages and starts with no progress', () => {
    const input = { term: '  hello  ', meaning: ' halo ', wordLanguage: 'ja', meaningLanguage: 'en' };

    const created = createWord(input);

    expect(created.term).toBe('Hello');
    expect([created.wordLanguage, created.meaningLanguage]).toEqual(['ja', 'en']);
    expect([created.mastery, created.quizPassed, created.attempts, created.correctCount]).toEqual([0, 0, 0, 0]);
    expect(created.id).toBeTruthy();
  });

  test.each([
    ['  persuade ', 'Persuade'],
    ["it's well-known", "It's Well-Known"],
  ])('writes the word %p in Title Case: %p', (term, expected) => {
    const created = createWord({ term });

    expect(created.term).toBe(expected);
  });

  test.each([
    ['membujuk, MEYAKINKAN', 'Membujuk, Meyakinkan'],
    ['terima kasih (banyak)', 'Terima Kasih (Banyak)'],
  ])('writes the meaning %p in Title Case: %p', (meaning, expected) => {
    const created = createWord({ term: 'x', meaning });

    expect(created.meaning).toBe(expected);
  });

  test.each([
    ['romaji', 'watashi', 'わたし'],
    ['upper-case romaji (not katakana)', 'MIGI', 'みぎ'],
    ['kanji', '日本', '日本'],
    ['katakana', 'コーヒー', 'コーヒー'],
  ])('in Japanese, keeps %s as kana or as typed: %p -> %p', (_, term, expected) => {
    const created = createWord({ term, wordLanguage: 'ja' });

    expect(created.term).toBe(expected);
    expect(created.wordLanguage).toBe('ja');
  });

  test('reads Latin letters as English unless told otherwise', () => {
    const input = { term: 'agenda', meaning: 'agenda' };

    const created = createWord(input);

    expect([created.term, created.wordLanguage]).toEqual(['Agenda', 'en']);
  });

  test('recognises imported kanji without a language column', () => {
    const input = { term: '日本語', meaning: 'bahasa Jepang' };

    const created = createWord(input);

    expect(created.wordLanguage).toBe('ja');
  });
});

describe('validateWordInput', () => {
  test('requires a word', () => {
    const input = { term: ' ', meaning: '' };

    const errors = validateWordInput(input);

    expect(Object.keys(errors)).toEqual(['term']);
  });

  test('allows a blank meaning', () => {
    const input = { term: 'a', meaning: '' };

    const errors = validateWordInput(input);

    expect(errors).toEqual({});
  });

  test('limits the meaning to 400 characters', () => {
    const input = { term: 'a', meaning: 'x'.repeat(401) };

    const errors = validateWordInput(input);

    expect(errors.meaning).toBe('Maksimal 400 karakter.');
  });

  test('limits the word to 120 characters', () => {
    const input = { term: 'a'.repeat(121), meaning: 'b' };

    const errors = validateWordInput(input);

    expect(errors.term).toBeTruthy();
  });
});

describe('findByTerm', () => {
  const cafe = word('Café', 'kafe');

  test.each([
    ['ignores case and accents', 'cafe', undefined, cafe],
    ['skips the word being edited', 'cafe', cafe.id, undefined],
    ['finds nothing for another word', 'tea', undefined, undefined],
  ])('%s', (_, term, ignoreId, expected) => {
    const words = [cafe];

    const found = findByTerm(words, term, ignoreId);

    expect(found).toBe(expected);
  });

  describe('with one entry per meaning language', () => {
    const indonesian = word('Café', 'kafe', { meaningLanguage: 'id' });
    const english = word('cafe', 'coffee shop', { meaningLanguage: 'en' });

    test.each([
      ['id', undefined, indonesian],
      ['en', undefined, english],
      ['ja', undefined, undefined],
      ['en', english.id, undefined], // editing that entry itself
    ])('meaning language %p (ignoring %p) finds the matching entry', (meaningLanguage, ignoreId, expected) => {
      const words = [indonesian, english];

      const found = findByTerm(words, 'café', ignoreId, meaningLanguage);

      expect(found).toBe(expected);
    });
  });
});

describe('groupByTerm', () => {
  test('shows one row per term with every meaning entry inside', () => {
    const book = word('book', 'buku', { meaningLanguage: 'id' });
    const pen = word('pen', 'pena', { meaningLanguage: 'id' });
    const livre = word('Book', 'livre', { meaningLanguage: 'fr' });

    const groups = groupByTerm([book, pen, livre]);

    expect(groups.map((group) => group.term)).toEqual(['Book', 'Pen']);
    expect(groups[0].words).toEqual([book, livre]);
  });

  test('is empty for no words', () => {
    const words = [];

    const groups = groupByTerm(words);

    expect(groups).toEqual([]);
  });
});

describe('detectWordLanguage', () => {
  test.each([
    ['日本語', undefined, 'ja'],
    ['コーヒー', undefined, 'ja'],
    ['にほん', undefined, 'ja'],
    ['agenda', undefined, 'en'], // Latin letters never turn into Japanese by accident
    ['watashi', undefined, 'en'],
    ['hello', 'es', 'es'],
  ])('reads the script of %p (fallback %p): %p', (term, fallback, expected) => {
    const language = detectWordLanguage(term, fallback);

    expect(language).toBe(expected);
  });
});

describe('toJapaneseReading', () => {
  test.each([
    ['watashi', 'わたし'],
    ['konnichiwa', 'こんにちわ'],
    ['nomimono', 'のみもの'],
    ['こんばんは', 'こんばんは'],
    ['hello', 'hello'], // not fully convertible: kept as it is
  ])('%p reads as %p', (text, expected) => {
    const reading = toJapaneseReading(text);

    expect(reading).toBe(expected);
  });
});

describe('getWordSuggestions', () => {
  const words = [
    word('watashi', 'I', { wordLanguage: 'ja' }),
    word('arigatou', 'thank you', { wordLanguage: 'ja' }),
    word('apple', 'apel', { wordLanguage: 'en' }),
  ];

  test.each([
    ['wa', 'ja', ['わたし']],
    ['ar', 'ja', ['ありがとう']],
    ['ap', 'en', ['Apple']],
  ])('%p in %s suggests %j', (query, language, expected) => {
    const suggestions = getWordSuggestions(words, query, language);

    expect(suggestions).toEqual(expected);
  });
});

describe('mastery', () => {
  test('the default mastered target is 100', () => {
    const targets = targetsOf(undefined);

    expect(targets.mastered).toBe(100);
    expect(DEFAULT_TARGETS.mastered).toBe(100);
  });

  test('99 correct answers in a row are one short of mastered', () => {
    const start = word('a', 'b');

    const result = answered(start, 99, true);

    expect(result.mastery).toBe(99);
    expect(getStatus(result)).toBe('learning');
  });

  test('stops at 100 and counts every attempt', () => {
    const start = word('a', 'b');

    const result = answered(start, 104, true);

    expect(result.mastery).toBe(100);
    expect(result.attempts).toBe(104);
    expect(getStatus(result)).toBe('mastered');
  });

  test('a wrong answer resets mastery to 0, keeping the correct count', () => {
    const mastered = answered(word('a', 'b'), 104, true);

    const result = applyResult(mastered, false);

    expect(result.mastery).toBe(0);
    expect(result.correctCount).toBe(104);
    expect(getStatus(result)).toBe('weak');
  });

  test('summarizeWords counts each status', () => {
    const words = [
      word('a', 'b'),
      word('c', 'd', { attempts: 2, mastery: 1 }),
      word('e', 'f', { attempts: 100, mastery: DEFAULT_TARGETS.mastered }),
      word('g', 'h', { attempts: 1, mastery: 0 }),
    ];

    const summary = summarizeWords(words);

    expect(summary).toEqual({ total: 4, new: 1, learning: 1, mastered: 1, weak: 1, passed: 0 });
  });
});

describe('learning targets', () => {
  test.each([
    [5, 5],
    ['20', 20],
    [0, 1],
    [5000, 100],
    [2.5, 100],
    ['abc', 100],
    [undefined, 100],
  ])('sanitizeTarget(%p) is %p', (value, expected) => {
    expect(sanitizeTarget(value)).toBe(expected);
  });

  test('targetsOf reads the program targets', () => {
    const targets = targetsOf({ masteredLevel: 10, passedLevel: 3 });

    expect(targets).toEqual({ mastered: 10, passed: 3 });
  });

  test('mastery stops at a custom mastered target', () => {
    const targets = { mastered: 5, passed: 3 };

    const custom = [...Array(8)].reduce((current) => applyResult(current, true, 'flashcards', targets), word('a', 'b'));

    expect(custom.mastery).toBe(5);
    expect(getStatus(custom, targets)).toBe('mastered');
    expect(getStatus(custom)).toBe('learning');
  });

  test('a custom passed target passes the word sooner', () => {
    const targets = { mastered: 5, passed: 3 };
    const start = answered(word('a', 'b'), 3, true, 'quiz');

    const summary = summarizeWords([start], targets);

    expect(isPassed(start, targets)).toBe(true);
    expect(isPassed(start)).toBe(false);
    expect(summary.passed).toBe(1);
    expect(quizProgressOf([start, word('c', 'd')], targets)).toMatchObject({ points: 3, max: 6, passed: 1, percent: 50 });
  });
});

describe('Passed flag', () => {
  test('the default passed target is 100', () => {
    const targets = targetsOf({});

    expect(targets.passed).toBe(100);
    expect(DEFAULT_TARGETS.passed).toBe(100);
  });

  test('wrong quiz answers and flashcard answers do not count towards it', () => {
    const start = answered(word('a', 'b'), 99, true, 'quiz');

    const result = applyResult(applyResult(start, false, 'quiz'), true, 'flashcards');

    expect(result.quizPassed).toBe(99);
    expect(isPassed(result)).toBe(false);
    expect(result.mastery).toBe(1); // mastery still resets on the wrong answer
  });

  test('the 100th correct quiz answer passes the word', () => {
    const start = answered(word('a', 'b'), 99, true, 'quiz');

    const result = applyResult(start, true, 'quiz');

    expect(result.quizPassed).toBe(100);
    expect(isPassed(result)).toBe(true);
    expect(summarizeWords([result, word('c', 'd')]).passed).toBe(1);
  });

  test('resetting progress clears it', () => {
    const passed = word('a', 'b', { quizPassed: 100 });

    const result = resetProgress(passed);

    expect(result.quizPassed).toBe(0);
  });

  test('quizProgressOf sums correct quiz answers, each word counting up to 100', () => {
    const words = [
      word('a', 'b', { quizPassed: 150 }), // counts as 100, passed
      word('c', 'd', { quizPassed: 50 }),
      word('e', 'f'), // no quiz answers yet
      word('g', 'h', { quizPassed: 100 }),
    ];

    const progress = quizProgressOf(words);

    expect(progress).toEqual({ passed: 2, total: 4, points: 250, max: 400, percent: 62 });
  });

  test('quizProgressOf is zero for no words', () => {
    const words = [];

    const progress = quizProgressOf(words);

    expect(progress).toEqual({ passed: 0, total: 0, points: 0, max: 0, percent: 0 });
  });
});

describe('meaning languages', () => {
  test('never include the word language itself', () => {
    const wordLanguage = 'ja';

    const options = meaningLanguageOptions(wordLanguage);

    expect(options.some((option) => option.value === 'ja')).toBe(false);
    expect(options).toHaveLength(LANGUAGE_OPTIONS.length - 1);
  });

  test.each([
    ['the most used one in the program', [word('a', 'b', { meaningLanguage: 'en' })], 'ja', 'en'],
    ['otherwise Indonesian', [], 'ja', 'id'],
    ['or another language for an Indonesian program', [], 'id', 'en'],
  ])('the default is %s', (_, words, wordLanguage, expected) => {
    const language = defaultMeaningLanguage(words, wordLanguage);

    expect(language).toBe(expected);
  });
});

describe('vocabularyReducer', () => {
  /** State holding two words. */
  function twoWords() {
    const a = word('a', 'b');
    const b = word('c', 'd');
    return { a, b, state: vocabularyReducer(initialVocabularyState, { type: 'words/added', words: [a, b] }) };
  }

  test('adds words', () => {
    const words = [word('a', 'b'), word('c', 'd')];

    const state = vocabularyReducer(initialVocabularyState, { type: 'words/added', words });

    expect(state.words).toHaveLength(2);
  });

  test('updates the editable fields in Title Case, not the progress', () => {
    const { a, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'word/updated', id: a.id, changes: { term: 'convince', meaning: '  MEYAKINKAN ', mastery: 3 } });

    expect([after.words[0].term, after.words[0].meaning]).toEqual(['Convince', 'Meyakinkan']);
    expect(after.words[0].mastery).toBe(0);
  });

  test('records a flashcard answer', () => {
    const { b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true });

    expect(after.words[1].mastery).toBe(1);
    expect(after.words[1].quizPassed).toBe(0); // no source means flashcards
  });

  test('records a quiz answer towards Passed', () => {
    const { b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true, source: 'quiz' });

    expect(after.words[1].quizPassed).toBe(1);
  });

  test('resets the progress of every word', () => {
    const { b, state } = twoWords();
    const practised = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true });

    const after = vocabularyReducer(practised, { type: 'progress/reset' });

    expect(after.words[1].mastery).toBe(0);
  });

  test('removes a word', () => {
    const { a, b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'word/removed', id: a.id });

    expect(after.words.map((w) => w.id)).toEqual([b.id]);
  });

  test('clears the list', () => {
    const { state } = twoWords();

    const after = vocabularyReducer(state, { type: 'words/cleared' });

    expect(after.words).toEqual([]);
  });

  test('skipDuplicates drops terms that already exist or repeat', () => {
    const state = { words: [word('Hello', 'halo')] };

    const after = vocabularyReducer(state, { type: 'words/added', skipDuplicates: true, words: [word('hello', 'x'), word('new', 'baru'), word('NEW', 'y')] });

    expect(after.words.map((w) => w.term)).toEqual(['Hello', 'New']);
  });

  test('ignores unknown actions', () => {
    const state = { words: [word('Hello', 'halo')] };

    const after = vocabularyReducer(state, { type: 'unexpected' });

    expect(after).toBe(state);
  });
});

describe('termKey', () => {
  test.each([
    ['', ''],
    ['  ', ''],
    ['!!!', '!!!'],
  ])('falls back cleanly for %p', (text, expected) => {
    const key = termKey(text);

    expect(key).toBe(expected);
  });
});

describe('saving and loading words', () => {
  const words = [
    { id: 'w1', term: 'thrive', meaning: 'tumbuh subur', wordLanguage: 'en', meaningLanguage: 'id', mastery: 2, attempts: 5, correctCount: 4, createdAt: 123 },
    { id: 'w2', term: 'swift', meaning: 'cepat', wordLanguage: 'en', meaningLanguage: 'id', mastery: 0, attempts: 1, correctCount: 0, createdAt: 456 },
  ];

  test('saveWords stores the term, meaning, languages and progress', () => {
    const storage = fakeStorage();

    const saved = saveWords(words, storage);

    expect(saved).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).words).toEqual([
      { id: 'w1', term: 'thrive', wordLanguage: 'en', meaningLanguage: 'id', mastery: 2, quizPassed: 0, attempts: 5, correctCount: 4, createdAt: 123, meaning: 'tumbuh subur' },
      { id: 'w2', term: 'swift', wordLanguage: 'en', meaningLanguage: 'id', mastery: 0, quizPassed: 0, attempts: 1, correctCount: 0, createdAt: 456, meaning: 'cepat' },
    ]);
  });

  test('loadWords restores the clean shape, in Title Case', () => {
    const storage = fakeStorage();
    saveWords(words, storage);

    const loaded = loadWords(storage);

    expect(loaded.map(({ id, term, meaning, mastery, attempts, correctCount, createdAt }) => [id, term, meaning, mastery, attempts, correctCount, createdAt])).toEqual([
      ['w1', 'Thrive', 'Tumbuh Subur', 2, 5, 4, 123],
      ['w2', 'Swift', 'Cepat', 0, 1, 0, 456],
    ]);
  });

  test('the Passed count survives a reload', () => {
    const storage = fakeStorage();
    saveWords([word('a', 'b', { quizPassed: 100 })], storage);

    const [loaded] = loadWords(storage);

    expect(isPassed(loaded)).toBe(true);
  });

  test.each([
    ['corrupt data', fakeStorage({ [STORAGE_KEY]: '{not json' })],
    ['no storage', null],
    ['an empty value', { getItem: () => '' }],
    ['a blocked storage', { getItem() { throw new Error('blocked'); } }],
  ])('loadWords survives %s', (_, storage) => {
    const loaded = loadWords(storage);

    expect(loaded).toEqual([]);
  });

  test.each([
    ['no storage', null],
    ['a full storage', { setItem() { throw new Error('quota'); } }],
  ])('saveWords reports failure with %s', (_, storage) => {
    const saved = saveWords([], storage);

    expect(saved).toBe(false);
  });

  test('falls back safely when the browser blocks localStorage itself', () => {
    // Keep the descriptor rather than the value, so Node's built-in localStorage getter is not read.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });

    try {
      const loaded = loadWords();
      const saved = saveWords([], undefined);

      expect(loaded).toEqual([]);
      expect(saved).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    }
  });
});

describe('sanitizeWords', () => {
  test('discards junk and repairs fields', () => {
    const raw = [
      null,
      'x',
      { term: 'ok', meaning: 'fine', mastery: 250, attempts: -3, id: 'same' },
      { term: 'dup id', meaning: 'm', id: 'same' },
      { term: '', meaning: 'no term' },
    ];

    const words = sanitizeWords(raw);

    expect(words).toHaveLength(2);
    expect(words[0].mastery).toBe(100); // capped at the largest target
    expect(words[0].attempts).toBe(0);
    expect(words[0].id).not.toBe(words[1].id);
  });

  test('reads only a list', () => {
    const raw = 'nope';

    const words = sanitizeWords(raw);

    expect(words).toEqual([]);
  });

  test('gives a missing creation time a real one', () => {
    const raw = [{ term: 'ok', meaning: 'fine', createdAt: Number.NaN }];

    const [repaired] = sanitizeWords(raw);

    expect(Number.isFinite(repaired.createdAt)).toBe(true);
  });

  test('converts lists saved before Title Case and before the Passed flag', () => {
    const raw = [{ id: 'x', term: 'selasa', meaning: 'tuesday', wordLanguage: 'id', meaningLanguage: 'en' }];

    const [converted] = sanitizeWords(raw);

    expect([converted.term, converted.meaning]).toEqual(['Selasa', 'Tuesday']);
    expect(converted.quizPassed).toBe(0);
  });
});
