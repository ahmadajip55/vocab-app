import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWord, MASTERED_LEVEL } from '../vocabulary/model.js';
import { createSeededRng } from '../../lib/random.js';
import { buildDeck, meaningLanguagesOf, selectWords } from './deck.js';
import { clearCardExamples, loadCardExamples } from './cardExamples.js';
import { createFlashcardSession, flashcardSessionReducer, isFlashcardSessionFinished } from './session.js';

const w = (term, extra = {}) => ({ ...createWord({ term, meaning: `arti ${term}` }), ...extra });

test('selectWords keeps list order and can skip mastered words', () => {
  const words = [w('a'), w('b', { mastery: MASTERED_LEVEL }), w('c', { mastery: 1 })];
  // Words are stored in Title Case.
  assert.deepEqual(selectWords(words, {}).map((x) => x.term), ['A', 'B', 'C']);
  assert.deepEqual(selectWords(words, { onlyUnmastered: true }).map((x) => x.term), ['A', 'C']);
});

test('cards can be limited to one meaning language, listed most-used first', () => {
  const words = [
    w('A', { meaningLanguage: 'id' }),
    w('A', { meaningLanguage: 'en' }),
    w('B', { meaningLanguage: 'id', mastery: MASTERED_LEVEL }),
  ];
  assert.deepEqual(meaningLanguagesOf(words), [
    { code: 'id', count: 2 },
    { code: 'en', count: 1 },
  ]);
  assert.deepEqual(selectWords(words, { meaningLanguage: 'id' }).map((x) => x.term), ['A', 'B']);
  assert.deepEqual(selectWords(words, { meaningLanguage: 'en' }).map((x) => x.meaningLanguage), ['en']);
  assert.deepEqual(selectWords(words, { meaningLanguage: 'id', onlyUnmastered: true }).map((x) => x.term), ['A']);
  assert.equal(selectWords(words, { meaningLanguage: 'ja' }).length, 0);
  assert.deepEqual(meaningLanguagesOf([]), []);
});

test('buildDeck shuffles only when asked', () => {
  const terms = ['A', 'B', 'C', 'D', 'E', 'F'];
  const words = terms.map((t) => w(t));
  assert.deepEqual(buildDeck(words, { shuffle: false }).map((x) => x.term), terms);
  const shuffled = buildDeck(words, { shuffle: true }, createSeededRng(3));
  assert.deepEqual(shuffled.map((x) => x.term).sort(), terms);
  assert.notDeepEqual(shuffled.map((x) => x.term), terms);
});

test('session flips, records answers and finishes', () => {
  let s = createFlashcardSession(['1', '2', '3']);
  assert.equal(isFlashcardSessionFinished(s), false);

  s = flashcardSessionReducer(s, { type: 'flipped' });
  assert.equal(s.flipped, true);

  s = flashcardSessionReducer(s, { type: 'answered', known: true });
  assert.deepEqual([s.index, s.flipped, s.known], [1, false, ['1']]);

  s = flashcardSessionReducer(s, { type: 'answered', known: false });
  s = flashcardSessionReducer(s, { type: 'answered', known: true });
  assert.equal(isFlashcardSessionFinished(s), true);
  assert.deepEqual([s.known, s.unknown], [['1', '3'], ['2']]);

  const after = flashcardSessionReducer(s, { type: 'answered', known: true });
  assert.equal(after, s, 'finished sessions ignore further actions');
});

test('an empty session is finished immediately', () => {
  assert.equal(isFlashcardSessionFinished(createFlashcardSession([])), true);
});

test('unknown flashcard actions are ignored', () => {
  const session = createFlashcardSession(['1']);
  assert.deepEqual(flashcardSessionReducer(session, { type: 'unknown' }), session);
});

test('card examples keep human translations, machine-translate the rest, and are cached', async () => {
  clearCardExamples();
  let requests = 0;
  const fetchImpl = async (url) => {
    requests += 1;
    const parsed = new URL(url);
    if (parsed.hostname === 'clients5.google.com') {
      // Sentences keep their own capitalisation (no Title Case).
      return { ok: true, json: async () => parsed.searchParams.getAll('q').map((q) => `mesin: ${q.toLowerCase()}`) };
    }
    const translated = parsed.searchParams.has('to');
    const results = translated
      ? [{ text: '猫が好きです。', lang: 'jpn', translations: [[{ text: 'Saya suka kucing.', lang: 'ind' }]] }]
      : [
          { text: '猫が好きです。', lang: 'jpn', translations: [] },
          { text: 'あの猫は黒い。', lang: 'jpn', translations: [] },
        ];
    return { ok: true, json: async () => ({ results }) };
  };
  const word = { term: '猫', wordLanguage: 'ja', meaningLanguage: 'id' };
  const examples = await loadCardExamples(word, { fetchImpl });
  assert.deepEqual(examples, [
    { sentence: '猫が好きです。', translation: 'Saya suka kucing.' },
    { sentence: 'あの猫は黒い。', translation: 'mesin: あの猫は黒い。' },
  ]);
  const before = requests;
  assert.equal(await loadCardExamples(word, { fetchImpl }), await loadCardExamples(word, { fetchImpl }));
  assert.equal(requests, before, 'cached for the session');
});
