import { beforeEach, describe, expect, test } from '@jest/globals';
import { createWord, MASTERED_LEVEL } from '../../../features/vocabulary/model.js';
import { createSeededRng } from '../../../lib/random.js';
import { buildDeck, meaningLanguagesOf, selectWords } from '../../../features/flashcards/deck.js';
import { clearCardExamples, loadCardExamples } from '../../../features/flashcards/cardExamples.js';
import { createFlashcardSession, flashcardSessionReducer, isFlashcardSessionFinished } from '../../../features/flashcards/session.js';

const word = (term, extra = {}) => ({ ...createWord({ term, meaning: `arti ${term}` }), ...extra });

/** A session after the given answers (true = known). */
function sessionAfter(ids, answers) {
  return answers.reduce(
    (session, known) => flashcardSessionReducer(session, { type: 'answered', known }),
    createFlashcardSession(ids),
  );
}

describe('selectWords', () => {
  test('keeps the list order (words are stored in Title Case)', () => {
    const words = [word('a'), word('b', { mastery: MASTERED_LEVEL }), word('c', { mastery: 1 })];

    const selected = selectWords(words, {});

    expect(selected.map((w) => w.term)).toEqual(['A', 'B', 'C']);
  });

  test('can skip mastered words', () => {
    const words = [word('a'), word('b', { mastery: MASTERED_LEVEL }), word('c', { mastery: 1 })];

    const selected = selectWords(words, { onlyUnmastered: true });

    expect(selected.map((w) => w.term)).toEqual(['A', 'C']);
  });

  describe('by meaning language', () => {
    const words = [
      word('A', { meaningLanguage: 'id' }),
      word('A', { meaningLanguage: 'en' }),
      word('B', { meaningLanguage: 'id', mastery: MASTERED_LEVEL }),
    ];

    test.each([
      [{ meaningLanguage: 'id' }, ['A/id', 'B/id']],
      [{ meaningLanguage: 'en' }, ['A/en']],
      [{ meaningLanguage: 'id', onlyUnmastered: true }, ['A/id']],
      [{ meaningLanguage: 'ja' }, []],
    ])('settings %j select %j', (settings, expected) => {
      const selected = selectWords(words, settings);

      expect(selected.map((w) => `${w.term}/${w.meaningLanguage}`)).toEqual(expected);
    });
  });
});

describe('meaningLanguagesOf', () => {
  test('lists the meaning languages, most-used first', () => {
    const words = [
      word('A', { meaningLanguage: 'id' }),
      word('A', { meaningLanguage: 'en' }),
      word('B', { meaningLanguage: 'id' }),
    ];

    const languages = meaningLanguagesOf(words);

    expect(languages).toEqual([
      { code: 'id', count: 2 },
      { code: 'en', count: 1 },
    ]);
  });

  test('is empty for no words', () => {
    const words = [];

    const languages = meaningLanguagesOf(words);

    expect(languages).toEqual([]);
  });
});

describe('buildDeck', () => {
  const terms = ['A', 'B', 'C', 'D', 'E', 'F'];

  test('keeps the order when shuffle is off', () => {
    const words = terms.map((term) => word(term));

    const deck = buildDeck(words, { shuffle: false });

    expect(deck.map((w) => w.term)).toEqual(terms);
  });

  test('changes the order, but not the cards, when shuffle is on', () => {
    const words = terms.map((term) => word(term));

    const deck = buildDeck(words, { shuffle: true }, createSeededRng(3));

    expect(deck.map((w) => w.term).sort()).toEqual(terms);
    expect(deck.map((w) => w.term)).not.toEqual(terms);
  });
});

describe('flashcard session', () => {
  test('a new session is not finished', () => {
    const ids = ['1', '2', '3'];

    const session = createFlashcardSession(ids);

    expect(isFlashcardSessionFinished(session)).toBe(false);
  });

  test('an empty session is finished immediately', () => {
    const ids = [];

    const session = createFlashcardSession(ids);

    expect(isFlashcardSessionFinished(session)).toBe(true);
  });

  test('flipping turns the card over', () => {
    const session = createFlashcardSession(['1', '2', '3']);

    const next = flashcardSessionReducer(session, { type: 'flipped' });

    expect(next.flipped).toBe(true);
  });

  test('an answer moves to the next card face down and records it', () => {
    const session = flashcardSessionReducer(createFlashcardSession(['1', '2', '3']), { type: 'flipped' });

    const next = flashcardSessionReducer(session, { type: 'answered', known: true });

    expect([next.index, next.flipped, next.known]).toEqual([1, false, ['1']]);
  });

  test('the last answer finishes the session and splits known from unknown', () => {
    const session = sessionAfter(['1', '2', '3'], [true, false]);

    const finished = flashcardSessionReducer(session, { type: 'answered', known: true });

    expect(isFlashcardSessionFinished(finished)).toBe(true);
    expect([finished.known, finished.unknown]).toEqual([['1', '3'], ['2']]);
  });

  test('a finished session ignores further answers', () => {
    const finished = sessionAfter(['1'], [true]);

    const after = flashcardSessionReducer(finished, { type: 'answered', known: true });

    expect(after).toBe(finished);
  });

  test('unknown actions are ignored', () => {
    const session = createFlashcardSession(['1']);

    const after = flashcardSessionReducer(session, { type: 'unknown' });

    expect(after).toEqual(session);
  });
});

describe('loadCardExamples', () => {
  /** Fake Tatoeba (one sentence with a human translation) and Google (machine translation). */
  function fakeServices() {
    let requests = 0;
    const fetchImpl = async (url) => {
      requests += 1;
      const parsed = new URL(url);
      if (parsed.hostname === 'clients5.google.com') {
        return { ok: true, json: async () => parsed.searchParams.getAll('q').map((q) => `mesin: ${q.toLowerCase()}`) };
      }
      const results = parsed.searchParams.has('to')
        ? [{ text: '猫が好きです。', lang: 'jpn', translations: [[{ text: 'Saya suka kucing.', lang: 'ind' }]] }]
        : [
            { text: '猫が好きです。', lang: 'jpn', translations: [] },
            { text: 'あの猫は黒い。', lang: 'jpn', translations: [] },
          ];
      return { ok: true, json: async () => ({ results }) };
    };
    return { fetchImpl, requests: () => requests };
  }

  const cat = { term: '猫', wordLanguage: 'ja', meaningLanguage: 'id' };

  beforeEach(() => {
    clearCardExamples();
  });

  test('keeps human translations and machine-translates the rest (sentences keep their case)', async () => {
    const { fetchImpl } = fakeServices();

    const examples = await loadCardExamples(cat, { fetchImpl });

    expect(examples).toEqual([
      { sentence: '猫が好きです。', translation: 'Saya suka kucing.' },
      { sentence: 'あの猫は黒い。', translation: 'mesin: あの猫は黒い。' },
    ]);
  });

  test('is cached for the session', async () => {
    const services = fakeServices();
    const first = await loadCardExamples(cat, { fetchImpl: services.fetchImpl });
    const requestsBefore = services.requests();

    const second = await loadCardExamples(cat, { fetchImpl: services.fetchImpl });

    expect(second).toBe(first);
    expect(services.requests()).toBe(requestsBefore);
  });
});
