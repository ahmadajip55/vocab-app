import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  DEFAULT_TARGETS,
  LANGUAGE_OPTIONS,
  applyResult,
  createWord,
  defaultMeaningLanguage,
  detectWordLanguage,
  duplicateWordMessage,
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
  toWordValues,
  validateWordInput,
} from '../../../features/vocabulary/model.js';
import { initialVocabularyState, vocabularyReducer } from '../../../features/vocabulary/reducer.js';
import { decodeStored, loadWords, sanitizeWords, saveWords, STORAGE_KEY } from '../../../features/vocabulary/storage.js';
import { memoryStorage } from '../../helpers/memoryStorage.js';

const word = (term, meaning, extra = {}) => ({ ...createWord({ term, meaning }), ...extra });

/** The word after `times` answers. */
function answered(start, times, correct, source) {
  let result = start;
  for (let i = 0; i < times; i++) result = applyResult(result, correct, source);
  return result;
}

describe('createWord', () => {
  it('should trim the fields, keep the languages and start with no progress when a word is created', () => {
    const input = { term: '  hello  ', meaning: ' halo ', wordLanguage: 'ja', meaningLanguage: 'en' };

    const created = createWord(input);

    expect(created.term).toBe('Hello');
    expect([created.wordLanguage, created.meaningLanguage]).toEqual(['ja', 'en']);
    expect([created.mastery, created.quizPassed, created.attempts, created.correctCount]).toEqual([0, 0, 0, 0]);
    expect(created.id).toBeTruthy();
  });

  it.each([
    ['  persuade ', 'Persuade'],
    ["it's well-known", "It's Well-Known"],
  ])('should write %p as %p when the word is created', (term, expected) => {
    const created = createWord({ term });

    expect(created.term).toBe(expected);
  });

  it.each([
    ['membujuk, MEYAKINKAN', 'Membujuk, Meyakinkan'],
    ['terima kasih (banyak)', 'Terima Kasih (Banyak)'],
  ])('should write the meaning %p as %p when the word is created', (meaning, expected) => {
    const created = createWord({ term: 'x', meaning });

    expect(created.meaning).toBe(expected);
  });

  it.each([
    ['romaji', 'watashi', 'わたし'],
    ['upper-case romaji (not katakana)', 'MIGI', 'みぎ'],
    ['kanji', '日本', '日本'],
    ['katakana', 'コーヒー', 'コーヒー'],
  ])('should keep %s as kana or as typed (%p -> %p) when the word is Japanese', (_, term, expected) => {
    const created = createWord({ term, wordLanguage: 'ja' });

    expect(created.term).toBe(expected);
    expect(created.wordLanguage).toBe('ja');
  });

  it('should read Latin letters as English when no language is given', () => {
    const input = { term: 'agenda', meaning: 'agenda' };

    const created = createWord(input);

    expect([created.term, created.wordLanguage]).toEqual(['Agenda', 'en']);
  });

  it('should recognise kanji when an imported word has no language', () => {
    const input = { term: '日本語', meaning: 'bahasa Jepang' };

    const created = createWord(input);

    expect(created.wordLanguage).toBe('ja');
  });
});

describe('validateWordInput', () => {
  it('should require a word when the word is blank', () => {
    const input = { term: ' ', meaning: 'b' };

    const errors = validateWordInput(input);

    expect(Object.keys(errors)).toEqual(['term']);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
  ])('should require a meaning when the meaning is %s', (_, meaning) => {
    const input = { term: 'a', meaning };

    const errors = validateWordInput(input);

    expect(errors).toEqual({ meaning: 'Isi arti terlebih dahulu.' });
  });

  it('should accept the word when it has a word and a meaning', () => {
    const input = { term: 'a', meaning: 'b' };

    const errors = validateWordInput(input);

    expect(errors).toEqual({});
  });

  it('should refuse it when the meaning is over 400 characters', () => {
    const input = { term: 'a', meaning: 'x'.repeat(401) };

    const errors = validateWordInput(input);

    expect(errors.meaning).toBe('Maksimal 400 karakter.');
  });

  it('should refuse it when the word is over 120 characters', () => {
    const input = { term: 'a'.repeat(121), meaning: 'b' };

    const errors = validateWordInput(input);

    expect(errors.term).toBeTruthy();
  });
});

describe('toWordValues', () => {
  it('should trim the word and leave out kana and romaji when the language is not Japanese', () => {
    const values = { term: '  thrive ', meaning: 'Berkembang', kana: 'x', wordLanguage: 'en', meaningLanguage: 'id' };

    const result = toWordValues(values);

    expect([result.term, result.kana, result.romaji]).toEqual(['thrive', '', '']);
  });

  it('should take the romaji from the kana when a kanji word has its reading', () => {
    const values = { term: '食べる', kana: 'たべる', wordLanguage: 'ja' };

    const result = toWordValues(values);

    expect([result.kana, result.romaji]).toEqual(['たべる', 'taberu']);
  });

  it('should use the romaji typed for the word when it has no kana', () => {
    const values = { term: '日本', kana: '', wordLanguage: 'ja' };

    const result = toWordValues(values, { 日本: 'nihon' });

    expect(result.romaji).toBe('nihon');
  });

  it('should read the romaji from the word itself when the word is kana', () => {
    const values = { term: 'みず', wordLanguage: 'ja' };

    const result = toWordValues(values);

    expect(result.romaji).toBe('mizu');
  });

  it('should turn a romaji reading into hiragana when the kana field holds romaji', () => {
    const values = { term: '水', kana: 'mizu', wordLanguage: 'ja' };

    const result = toWordValues(values);

    expect(result.kana).toBe('みず');
  });
});

describe('duplicateWordMessage', () => {
  it.each([
    [{ term: 'Thrive', meaning: 'Berkembang' }, '"Thrive" already has a Indonesian meaning: "Berkembang". Choose another meaning language or edit that one.'],
    [{ term: 'Thrive', meaning: '' }, '"Thrive" already has a Indonesian entry. Choose another meaning language or edit that one.'],
  ])('should explain the clash when %j is already saved', (duplicate, expected) => {
    const meaningLanguage = 'id';

    const message = duplicateWordMessage(duplicate, meaningLanguage);

    expect(message).toBe(expected);
  });
});

describe('findByTerm', () => {
  const cafe = word('Café', 'kafe');

  it.each([
    ['the term differs only in case and accents', 'cafe', undefined, cafe],
    ['the only match is the word being edited', 'cafe', cafe.id, undefined],
    ['the term is another word', 'tea', undefined, undefined],
  ])('should return the expected word when %s', (_, term, ignoreId, expected) => {
    const words = [cafe];

    const found = findByTerm(words, term, ignoreId);

    expect(found).toBe(expected);
  });

  it('should treat them as different words when the words are mada (まだ) and mata (また)', () => {
    const mata = createWord({ term: 'mata', wordLanguage: 'ja' });
    const words = [mata];

    const found = findByTerm(words, createWord({ term: 'mada', wordLanguage: 'ja' }).term);

    expect(mata.term).toBe('また');
    expect(found).toBeUndefined();
  });

  describe('with one entry per meaning language', () => {
    const indonesian = word('Café', 'kafe', { meaningLanguage: 'id' });
    const english = word('cafe', 'coffee shop', { meaningLanguage: 'en' });

    it.each([
      ['id', undefined, indonesian],
      ['en', undefined, english],
      ['ja', undefined, undefined],
      ['en', english.id, undefined], // editing that entry itself
    ])('should find the matching entry when the meaning language is %p (ignoring %p)', (meaningLanguage, ignoreId, expected) => {
      const words = [indonesian, english];

      const found = findByTerm(words, 'café', ignoreId, meaningLanguage);

      expect(found).toBe(expected);
    });
  });
});

describe('groupByTerm', () => {
  it('should show one row per term with every meaning inside when a term has several entries', () => {
    const book = word('book', 'buku', { meaningLanguage: 'id' });
    const pen = word('pen', 'pena', { meaningLanguage: 'id' });
    const livre = word('Book', 'livre', { meaningLanguage: 'fr' });

    const groups = groupByTerm([book, pen, livre]);

    expect(groups.map((group) => group.term)).toEqual(['Book', 'Pen']);
    expect(groups[0].words).toEqual([book, livre]);
  });

  it('should return an empty list when there are no words', () => {
    const words = [];

    const groups = groupByTerm(words);

    expect(groups).toEqual([]);
  });
});

describe('detectWordLanguage', () => {
  it.each([
    ['日本語', undefined, 'ja'],
    ['コーヒー', undefined, 'ja'],
    ['にほん', undefined, 'ja'],
    ['agenda', undefined, 'en'], // Latin letters never turn into Japanese by accident
    ['watashi', undefined, 'en'],
    ['hello', 'es', 'es'],
  ])('should read the script of %p (fallback %p) as %p when the language is detected', (term, fallback, expected) => {
    const language = detectWordLanguage(term, fallback);

    expect(language).toBe(expected);
  });
});

describe('toJapaneseReading', () => {
  it.each([
    ['watashi', 'わたし'],
    ['konnichiwa', 'こんにちわ'],
    ['nomimono', 'のみもの'],
    ['こんばんは', 'こんばんは'],
    ['hello', 'hello'], // not fully convertible: kept as it is
  ])('should read %p as %p when it is converted', (text, expected) => {
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

  it.each([
    ['wa', 'ja', ['わたし']],
    ['ar', 'ja', ['ありがとう']],
    ['ap', 'en', ['Apple']],
  ])('should turn %p in %s into the suggestions %j when the user types', (query, language, expected) => {
    const suggestions = getWordSuggestions(words, query, language);

    expect(suggestions).toEqual(expected);
  });
});

describe('mastery', () => {
  it('should be 100 when the program has no mastered target', () => {
    const targets = targetsOf(undefined);

    expect(targets.mastered).toBe(100);
    expect(DEFAULT_TARGETS.mastered).toBe(100);
  });

  it('should not be mastered when 99 answers in a row are correct', () => {
    const start = word('a', 'b');

    const result = answered(start, 99, true);

    expect(result.mastery).toBe(99);
    expect(getStatus(result)).toBe('learning');
  });

  it('should stop at 100 and count every attempt when answers keep being correct', () => {
    const start = word('a', 'b');

    const result = answered(start, 104, true);

    expect(result.mastery).toBe(100);
    expect(result.attempts).toBe(104);
    expect(getStatus(result)).toBe('mastered');
  });

  it('should reset mastery to 0 and keep the correct count when an answer is wrong', () => {
    const mastered = answered(word('a', 'b'), 104, true);

    const result = applyResult(mastered, false);

    expect(result.mastery).toBe(0);
    expect(result.correctCount).toBe(104);
    expect(getStatus(result)).toBe('weak');
  });

  it('should count each status when words are summarized', () => {
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
  it.each([
    [5, 5],
    ['20', 20],
    [0, 1],
    [5000, 100],
    [2.5, 100],
    ['abc', 100],
    [undefined, 100],
  ])('should turn %p into %p when a target is sanitized', (value, expected) => {
    const target = sanitizeTarget(value);

    expect(target).toBe(expected);
  });

  it('should read the program targets when they are set', () => {
    const targets = targetsOf({ masteredLevel: 10, passedLevel: 3 });

    expect(targets).toEqual({ mastered: 10, passed: 3 });
  });

  it('should stop at the target when the mastered target is custom', () => {
    const targets = { mastered: 5, passed: 3 };

    const custom = [...Array(8)].reduce((current) => applyResult(current, true, 'flashcards', targets), word('a', 'b'));

    expect(custom.mastery).toBe(5);
    expect(getStatus(custom, targets)).toBe('mastered');
    expect(getStatus(custom)).toBe('learning');
  });

  it('should pass the word sooner when the passed target is lower', () => {
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
  it('should be 100 when the program has no passed target', () => {
    const targets = targetsOf({});

    expect(targets.passed).toBe(100);
    expect(DEFAULT_TARGETS.passed).toBe(100);
  });

  it('should not count towards Passed when the answer is wrong or from flashcards', () => {
    const start = answered(word('a', 'b'), 99, true, 'quiz');

    const result = applyResult(applyResult(start, false, 'quiz'), true, 'flashcards');

    expect(result.quizPassed).toBe(99);
    expect(isPassed(result)).toBe(false);
    expect(result.mastery).toBe(1); // mastery still resets on the wrong answer
  });

  it('should pass the word when the 100th quiz answer is correct', () => {
    const start = answered(word('a', 'b'), 99, true, 'quiz');

    const result = applyResult(start, true, 'quiz');

    expect(result.quizPassed).toBe(100);
    expect(isPassed(result)).toBe(true);
    expect(summarizeWords([result, word('c', 'd')]).passed).toBe(1);
  });

  it('should clear the Passed count when progress is reset', () => {
    const passed = word('a', 'b', { quizPassed: 100 });

    const result = resetProgress(passed);

    expect(result.quizPassed).toBe(0);
  });

  it('should sum correct quiz answers up to 100 per word when quiz progress is counted', () => {
    const words = [
      word('a', 'b', { quizPassed: 150 }), // counts as 100, passed
      word('c', 'd', { quizPassed: 50 }),
      word('e', 'f'), // no quiz answers yet
      word('g', 'h', { quizPassed: 100 }),
    ];

    const progress = quizProgressOf(words);

    expect(progress).toEqual({ passed: 2, total: 4, points: 250, max: 400, percent: 62 });
  });

  it('should be zero when there are no words', () => {
    const words = [];

    const progress = quizProgressOf(words);

    expect(progress).toEqual({ passed: 0, total: 0, points: 0, max: 0, percent: 0 });
  });
});

describe('meaning languages', () => {
  it('should never include the word language when meaning languages are offered', () => {
    const wordLanguage = 'ja';

    const options = meaningLanguageOptions(wordLanguage);

    expect(options.some((option) => option.value === 'ja')).toBe(false);
    expect(options).toHaveLength(LANGUAGE_OPTIONS.length - 1);
  });

  it.each([
    ['the most used one in the program', [word('a', 'b', { meaningLanguage: 'en' })], 'ja', 'en'],
    ['otherwise Indonesian', [], 'ja', 'id'],
    ['or another language for an Indonesian program', [], 'id', 'en'],
  ])('should pick %s when a default meaning language is chosen', (_, words, wordLanguage, expected) => {
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

  it('should add them when words are added', () => {
    const words = [word('a', 'b'), word('c', 'd')];

    const state = vocabularyReducer(initialVocabularyState, { type: 'words/added', words });

    expect(state.words).toHaveLength(2);
  });

  it('should update the fields in Title Case but not the progress when a word is edited', () => {
    const { a, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'word/updated', id: a.id, changes: { term: 'convince', meaning: '  MEYAKINKAN ', mastery: 3 } });

    expect([after.words[0].term, after.words[0].meaning]).toEqual(['Convince', 'Meyakinkan']);
    expect(after.words[0].mastery).toBe(0);
  });

  it('should update the progress when a flashcard answer is recorded', () => {
    const { b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true });

    expect(after.words[1].mastery).toBe(1);
    expect(after.words[1].quizPassed).toBe(0); // no source means flashcards
  });

  it('should count towards Passed when a quiz answer is recorded', () => {
    const { b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true, source: 'quiz' });

    expect(after.words[1].quizPassed).toBe(1);
  });

  it('should reset every word when progress is reset', () => {
    const { b, state } = twoWords();
    const practised = vocabularyReducer(state, { type: 'result/recorded', id: b.id, correct: true });

    const after = vocabularyReducer(practised, { type: 'progress/reset' });

    expect(after.words[1].mastery).toBe(0);
  });

  it('should remove the word when it is deleted', () => {
    const { a, b, state } = twoWords();

    const after = vocabularyReducer(state, { type: 'word/removed', id: a.id });

    expect(after.words.map((w) => w.id)).toEqual([b.id]);
  });

  it('should empty the list when it is cleared', () => {
    const { state } = twoWords();

    const after = vocabularyReducer(state, { type: 'words/cleared' });

    expect(after.words).toEqual([]);
  });

  it('should drop existing and repeated terms when skipDuplicates is set', () => {
    const state = { words: [word('Hello', 'halo')] };

    const after = vocabularyReducer(state, { type: 'words/added', skipDuplicates: true, words: [word('hello', 'x'), word('new', 'baru'), word('NEW', 'y')] });

    expect(after.words.map((w) => w.term)).toEqual(['Hello', 'New']);
  });

  it('should ignore the action when it is unknown', () => {
    const state = { words: [word('Hello', 'halo')] };

    const after = vocabularyReducer(state, { type: 'unexpected' });

    expect(after).toBe(state);
  });
});

describe('termKey', () => {
  it.each([
    ['', ''],
    ['  ', ''],
    ['!!!', '!!!'],
  ])('should fall back cleanly when the term is %p', (text, expected) => {
    const key = termKey(text);

    expect(key).toBe(expected);
  });
});

describe('saving and loading words', () => {
  const words = [
    { id: 'w1', term: 'thrive', meaning: 'tumbuh subur', wordLanguage: 'en', meaningLanguage: 'id', mastery: 2, attempts: 5, correctCount: 4, createdAt: 123 },
    { id: 'w2', term: 'swift', meaning: 'cepat', wordLanguage: 'en', meaningLanguage: 'id', mastery: 0, attempts: 1, correctCount: 0, createdAt: 456 },
  ];

  it('should store the term, meaning, languages and progress when words are saved', () => {
    const storage = memoryStorage();

    const saved = saveWords(words, storage);

    expect(saved).toBe(true);
    expect(JSON.parse(decodeStored(storage.getItem(STORAGE_KEY))).words).toEqual([
      { id: 'w1', term: 'thrive', wordLanguage: 'en', meaningLanguage: 'id', mastery: 2, quizPassed: 0, attempts: 5, correctCount: 4, createdAt: 123, meaning: 'tumbuh subur' },
      { id: 'w2', term: 'swift', wordLanguage: 'en', meaningLanguage: 'id', mastery: 0, quizPassed: 0, attempts: 1, correctCount: 0, createdAt: 456, meaning: 'cepat' },
    ]);
  });

  it('should compress the list when words are saved', () => {
    const storage = memoryStorage();
    const many = Array.from({ length: 200 }, (_, i) => ({ ...words[i % 2], id: `w${i}`, term: `word ${i}` }));

    saveWords(many, storage);
    const stored = storage.getItem(STORAGE_KEY);

    expect(stored.startsWith('lz:')).toBe(true);
    expect(stored.length).toBeLessThan(decodeStored(stored).length / 3);
    expect(loadWords(storage)).toHaveLength(200);
  });

  it('should read the list when it was saved as plain JSON', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, words }));

    const loaded = loadWords(storage);

    expect(loaded.map((word) => word.term)).toEqual(['Thrive', 'Swift']);
  });

  it('should return an empty list when the compressed data is damaged', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, 'lz:\u0001garbage');

    const loaded = loadWords(storage);

    expect(loaded).toEqual([]);
  });

  it('should restore the clean shape in Title Case when words are loaded', () => {
    const storage = memoryStorage();
    saveWords(words, storage);

    const loaded = loadWords(storage);

    expect(loaded.map(({ id, term, meaning, mastery, attempts, correctCount, createdAt }) => [id, term, meaning, mastery, attempts, correctCount, createdAt])).toEqual([
      ['w1', 'Thrive', 'Tumbuh Subur', 2, 5, 4, 123],
      ['w2', 'Swift', 'Cepat', 0, 1, 0, 456],
    ]);
  });

  it('should keep the Passed count when the page is reloaded', () => {
    const storage = memoryStorage();
    saveWords([word('a', 'b', { quizPassed: 100 })], storage);

    const [loaded] = loadWords(storage);

    expect(isPassed(loaded)).toBe(true);
  });

  it.each([
    ['corrupt data', memoryStorage({ [STORAGE_KEY]: '{not json' })],
    ['no storage', null],
    ['an empty value', { getItem: () => '' }],
    ['a blocked storage', { getItem() { throw new Error('blocked'); } }],
  ])('should not crash when loadWords meets %s', (_, storage) => {
    const loaded = loadWords(storage);

    expect(loaded).toEqual([]);
  });

  it.each([
    ['no storage', null],
    ['a full storage', { setItem() { throw new Error('quota'); } }],
  ])('should report failure when saveWords meets %s', (_, storage) => {
    const saved = saveWords([], storage);

    expect(saved).toBe(false);
  });

  describe('with localStorage blocked by the browser', () => {
    // Keep the descriptor rather than the value, so Node's built-in localStorage getter is not read.
    let original;

    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
        configurable: true,
      });
    });

    afterEach(() => {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    });

    it('should fall back safely when the browser blocks localStorage itself', () => {
      const loaded = loadWords();
      const saved = saveWords([], undefined);

      expect(loaded).toEqual([]);
      expect(saved).toBe(false);
    });
  });
});

describe('sanitizeWords', () => {
  it('should drop junk and repair fields when the list is damaged', () => {
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

  it('should return an empty list when the data is not a list', () => {
    const raw = 'nope';

    const words = sanitizeWords(raw);

    expect(words).toEqual([]);
  });

  it('should give a real creation time when it is missing', () => {
    const raw = [{ term: 'ok', meaning: 'fine', createdAt: Number.NaN }];

    const [repaired] = sanitizeWords(raw);

    expect(Number.isFinite(repaired.createdAt)).toBe(true);
  });

  it('should convert the list when it was saved before Title Case and the Passed flag', () => {
    const raw = [{ id: 'x', term: 'selasa', meaning: 'tuesday', wordLanguage: 'id', meaningLanguage: 'en' }];

    const [converted] = sanitizeWords(raw);

    expect([converted.term, converted.meaning]).toEqual(['Selasa', 'Tuesday']);
    expect(converted.quizPassed).toBe(0);
  });
});
