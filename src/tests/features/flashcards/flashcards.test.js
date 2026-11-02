import { beforeEach, describe, expect, it } from '@jest/globals';
import { createWord, DEFAULT_TARGETS } from '../../../features/vocabulary/model.js';
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
  it('should keep the list order when no setting filters the words', () => {
    const words = [word('a'), word('b', { mastery: DEFAULT_TARGETS.mastered }), word('c', { mastery: 1 })];

    const selected = selectWords(words, {});

    expect(selected.map((w) => w.term)).toEqual(['A', 'B', 'C']);
  });

  it('should skip mastered words when only unmastered words are asked for', () => {
    const words = [word('a'), word('b', { mastery: DEFAULT_TARGETS.mastered }), word('c', { mastery: 1 })];

    const selected = selectWords(words, { onlyUnmastered: true });

    expect(selected.map((w) => w.term)).toEqual(['A', 'C']);
  });

  it('should use the custom target when deciding which words are mastered', () => {
    const words = [word('a', { mastery: 5 }), word('b', { mastery: 4 })];

    const selected = selectWords(words, { onlyUnmastered: true, targets: { mastered: 5, passed: 100 } });

    expect(selected.map((w) => w.term)).toEqual(['B']);
  });

  describe('by meaning language', () => {
    const words = [
      word('A', { meaningLanguage: 'id' }),
      word('A', { meaningLanguage: 'en' }),
      word('B', { meaningLanguage: 'id', mastery: DEFAULT_TARGETS.mastered }),
    ];

    it.each([
      [{ meaningLanguage: 'id' }, ['A/id', 'B/id']],
      [{ meaningLanguage: 'en' }, ['A/en']],
      [{ meaningLanguage: 'id', onlyUnmastered: true }, ['A/id']],
      [{ meaningLanguage: 'ja' }, []],
    ])('should turn settings %j into the selection %j when words are selected', (settings, expected) => {
      const selected = selectWords(words, settings);

      expect(selected.map((w) => `${w.term}/${w.meaningLanguage}`)).toEqual(expected);
    });
  });
});

describe('meaningLanguagesOf', () => {
  it('should list the most-used meaning language first when words have several', () => {
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

  it('should return an empty list when there are no words', () => {
    const words = [];

    const languages = meaningLanguagesOf(words);

    expect(languages).toEqual([]);
  });
});

describe('buildDeck', () => {
  const terms = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('should keep the order when shuffle is off', () => {
    const words = terms.map((term) => word(term));

    const deck = buildDeck(words, { shuffle: false });

    expect(deck.map((w) => w.term)).toEqual(terms);
  });

  it('should change the order but not the cards when shuffle is on', () => {
    const words = terms.map((term) => word(term));

    const deck = buildDeck(words, { shuffle: true }, createSeededRng(3));

    expect(deck.map((w) => w.term).sort()).toEqual(terms);
    expect(deck.map((w) => w.term)).not.toEqual(terms);
  });
});

describe('flashcard session', () => {
  it('should not be finished when the session is new', () => {
    const ids = ['1', '2', '3'];

    const session = createFlashcardSession(ids);

    expect(isFlashcardSessionFinished(session)).toBe(false);
  });

  it('should be finished at once when there are no cards', () => {
    const ids = [];

    const session = createFlashcardSession(ids);

    expect(isFlashcardSessionFinished(session)).toBe(true);
  });

  it('should turn the card over when it is flipped', () => {
    const session = createFlashcardSession(['1', '2', '3']);

    const next = flashcardSessionReducer(session, { type: 'flipped' });

    expect(next.flipped).toBe(true);
  });

  it('should record the answer and show the next card face down when a card is answered', () => {
    const session = flashcardSessionReducer(createFlashcardSession(['1', '2', '3']), { type: 'flipped' });

    const next = flashcardSessionReducer(session, { type: 'answered', known: true });

    expect([next.index, next.flipped, next.known]).toEqual([1, false, ['1']]);
  });

  it('should finish and split known from unknown when the last card is answered', () => {
    const session = sessionAfter(['1', '2', '3'], [true, false]);

    const finished = flashcardSessionReducer(session, { type: 'answered', known: true });

    expect(isFlashcardSessionFinished(finished)).toBe(true);
    expect([finished.known, finished.unknown]).toEqual([['1', '3'], ['2']]);
  });

  it('should ignore further answers when the session is finished', () => {
    const finished = sessionAfter(['1'], [true]);

    const after = flashcardSessionReducer(finished, { type: 'answered', known: true });

    expect(after).toBe(finished);
  });

  it('should ignore the action when it is unknown', () => {
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

  it('should keep human translations and machine-translate the rest when examples are loaded', async () => {
    const { fetchImpl } = fakeServices();

    const examples = await loadCardExamples(cat, { fetchImpl });

    expect(examples).toEqual([
      { sentence: '猫が好きです。', translation: 'Saya suka kucing.' },
      { sentence: 'あの猫は黒い。', translation: 'mesin: あの猫は黒い。' },
    ]);
  });

  it('should use the cache when the same card is loaded again', async () => {
    const services = fakeServices();
    const first = await loadCardExamples(cat, { fetchImpl: services.fetchImpl });
    const requestsBefore = services.requests();

    const second = await loadCardExamples(cat, { fetchImpl: services.fetchImpl });

    expect(second).toBe(first);
    expect(services.requests()).toBe(requestsBefore);
  });
});
