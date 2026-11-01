import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWord } from '../vocabulary/model.js';
import { createSeededRng } from '../../lib/random.js';
import { checkTypedAnswer, expandAcceptedAnswers } from './checkAnswer.js';
import { generateQuiz } from './generateQuiz.js';
import { createQuizSession, isQuizFinished, quizSessionReducer, summarizeQuiz } from './quizSession.js';

const make = (term, meaning, extra = {}) => ({ ...createWord({ term, meaning }), ...extra });
const WORDS = [
  make('apple', 'apel'),
  make('book', 'buku'),
  make('borrow', 'meminjam (dari orang lain)'),
  make('reluctant', 'enggan, berat hati'),
  make('deadline', 'tenggat waktu'),
  make('agenda', 'agenda'),
];

test('expandAcceptedAnswers handles alternatives and parentheses', () => {
  assert.deepEqual(
    expandAcceptedAnswers('enggan, berat hati').sort(),
    ['berat hati', 'enggan', 'enggan berat hati'].sort(),
  );
  const borrow = expandAcceptedAnswers('meminjam (dari orang lain)');
  assert.ok(borrow.includes('meminjam'));
  assert.ok(borrow.includes('meminjam dari orang lain'));
  assert.deepEqual(expandAcceptedAnswers('???'), ['???']);
  assert.deepEqual(expandAcceptedAnswers(''), []);
});

test('checkTypedAnswer distinguishes correct, close and wrong', () => {
  const accepted = expandAcceptedAnswers('enggan, berat hati');
  assert.equal(checkTypedAnswer('Enggan', accepted), 'correct');
  assert.equal(checkTypedAnswer('  berat   hati ', accepted), 'correct');
  assert.equal(checkTypedAnswer('engan', accepted), 'close');
  assert.equal(checkTypedAnswer('senang', accepted), 'wrong');
  assert.equal(checkTypedAnswer('', accepted), 'wrong');
  // Short answers get no typo tolerance.
  assert.equal(checkTypedAnswer('apal', expandAcceptedAnswers('apel')), 'wrong');
});

test('generateQuiz builds one question per word with a single correct option', () => {
  const quiz = generateQuiz(WORDS, { count: 'all', type: 'choice' }, createSeededRng(1));
  assert.equal(quiz.length, WORDS.length);
  assert.equal(new Set(quiz.map((q) => q.wordId)).size, WORDS.length);
  for (const q of quiz) {
    assert.equal(q.type, 'choice');
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    assert.equal(q.options.find((o) => o.correct).text, q.answer);
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4, 'options are distinct');
  }
});

test('generateQuiz direction decides prompt and answer', () => {
  const [q] = generateQuiz([WORDS[0]], { type: 'typing', direction: 'meaning-to-term' });
  assert.deepEqual([q.prompt, q.answer, q.type], ['Apel', 'Apple', 'typing']);
  const [r] = generateQuiz([WORDS[0]], { type: 'typing', direction: 'term-to-meaning' });
  assert.deepEqual([r.prompt, r.answer], ['Apple', 'Apel']);
});

test('generateQuiz mixed direction and type use both variants', () => {
  const quiz = generateQuiz(WORDS, { count: 'all', direction: 'mixed', type: 'mixed' }, createSeededRng(5));
  assert.ok(new Set(quiz.map((q) => q.direction)).size === 2);
  assert.ok(new Set(quiz.map((q) => q.type)).size === 2);
});

test('generateQuiz respects count and prefers weak words', () => {
  assert.equal(generateQuiz(WORDS, { count: 'all' }).length, WORDS.length);

  const practised = WORDS.map((word, i) => (i < 3 ? { ...word, mastery: 100, attempts: 100 } : word));
  const quiz = generateQuiz(practised, { count: 3, type: 'typing' }, createSeededRng(2));
  assert.equal(quiz.length, 3);
  assert.deepEqual(
    quiz.map((q) => q.prompt).sort(),
    ['Agenda', 'Deadline', 'Reluctant'].sort(),
  );
});

test('choice questions fall back to typing when there are no alternatives', () => {
  const [q] = generateQuiz([WORDS[0]], { type: 'choice' });
  assert.equal(q.type, 'typing');
  assert.equal(q.options, undefined);
});

test('duplicate answer texts never appear twice as options', () => {
  const words = [make('a', 'sama'), make('b', 'sama'), make('c', 'sama'), make('d', 'beda')];
  for (const q of generateQuiz(words, { count: 'all', type: 'choice' }, createSeededRng(9))) {
    const texts = q.options?.map((o) => o.text) ?? [];
    assert.equal(new Set(texts).size, texts.length);
  }
});

test('quiz session records answers, waits for next, and summarises', () => {
  const questions = generateQuiz(WORDS.slice(0, 3), { count: 'all', type: 'typing' }, createSeededRng(4));
  let s = createQuizSession(questions);

  s = quizSessionReducer(s, { type: 'next' });
  assert.equal(s.index, 0, 'cannot skip an unanswered question');

  s = quizSessionReducer(s, { type: 'answered', given: 'x', result: 'correct' });
  s = quizSessionReducer(s, { type: 'answered', given: 'y', result: 'wrong' });
  assert.equal(s.answers.length, 1, 'second answer for the same question is ignored');

  s = quizSessionReducer(s, { type: 'next' });
  s = quizSessionReducer(s, { type: 'answered', given: 'z', result: 'wrong' });
  s = quizSessionReducer(s, { type: 'next' });
  s = quizSessionReducer(s, { type: 'answered', given: 'w', result: 'close' });
  assert.equal(isQuizFinished(s), false);
  s = quizSessionReducer(s, { type: 'next' });
  assert.equal(isQuizFinished(s), true);

  const summary = summarizeQuiz(s);
  assert.deepEqual(
    [summary.total, summary.correct, summary.close, summary.wrong, summary.score, summary.percent],
    [3, 1, 1, 1, 2, 67],
  );
  assert.equal(summary.missed.length, 1);
  assert.equal(summary.missed[0].wordId, questions[1].id);
  assert.equal(summary.missed[0].given, 'z');
});

test('summarizeQuiz handles an empty quiz', () => {
  assert.equal(summarizeQuiz(createQuizSession([])).percent, 0);
});

test('quiz session rejects invalid transitions and unknown actions', () => {
  const questions = generateQuiz(WORDS.slice(0, 2), { count: 'all', type: 'typing' }, createSeededRng(4));
  let s = createQuizSession(questions);

  s = quizSessionReducer(s, { type: 'next' });
  assert.equal(s.index, 0);
  assert.equal(s.awaitingNext, false);

  s = quizSessionReducer(s, { type: 'answered', given: 'a', result: 'correct' });
  assert.equal(quizSessionReducer(s, { type: 'unknown' }), s);
  assert.equal(quizSessionReducer(s, { type: 'next' }).awaitingNext, false);
  assert.equal(quizSessionReducer(s, { type: 'next' }).index, 1);

  const finished = createQuizSession([]);
  assert.equal(quizSessionReducer(finished, { type: 'answered', given: 'x', result: 'wrong' }), finished);
  assert.equal(quizSessionReducer(finished, { type: 'next' }), finished);
});

test('generateQuiz asks only the chosen meaning language and takes wrong options from it', () => {
  const words = [
    make('cat', 'kucing', { meaningLanguage: 'id' }),
    make('dog', 'anjing', { meaningLanguage: 'id' }),
    make('bird', 'burung', { meaningLanguage: 'id' }),
    make('fish', 'ikan', { meaningLanguage: 'id' }),
    make('cat', 'neko', { meaningLanguage: 'ja' }),
    make('dog', 'inu', { meaningLanguage: 'ja' }),
  ];
  const quiz = generateQuiz(words, { meaningLanguage: 'id', count: 'all', type: 'choice' }, createSeededRng(4));
  assert.equal(quiz.length, 4);
  assert.ok(quiz.every((q) => q.meaningLanguage === 'id'));
  const options = quiz.flatMap((q) => q.options.map((o) => o.text));
  assert.ok(!options.includes('Neko') && !options.includes('Inu'), 'no options from another language');

  assert.equal(generateQuiz(words, { meaningLanguage: 'ja', count: 'all' }).length, 2);
  assert.equal(generateQuiz(words, { count: 'all' }).length, 6, 'no language given: every entry');
});
