import { describe, expect, test } from '@jest/globals';
import { createWord } from '../../../features/vocabulary/model.js';
import { createSeededRng } from '../../../lib/random.js';
import { checkTypedAnswer, expandAcceptedAnswers } from '../../../features/quiz/checkAnswer.js';
import { generateQuiz } from '../../../features/quiz/generateQuiz.js';
import { createQuizSession, isQuizFinished, quizSessionReducer, summarizeQuiz } from '../../../features/quiz/quizSession.js';

const make = (term, meaning, extra = {}) => ({ ...createWord({ term, meaning }), ...extra });
const WORDS = [
  make('apple', 'apel'),
  make('book', 'buku'),
  make('borrow', 'meminjam (dari orang lain)'),
  make('reluctant', 'enggan, berat hati'),
  make('deadline', 'tenggat waktu'),
  make('agenda', 'agenda'),
];

/** A typing quiz of `count` words, after the given actions. */
function sessionAfter(actions, count = 3) {
  const questions = generateQuiz(WORDS.slice(0, count), { count: 'all', type: 'typing' }, createSeededRng(4));
  const session = actions.reduce(quizSessionReducer, createQuizSession(questions));
  return { questions, session };
}
const answer = (result, given = 'x') => ({ type: 'answered', given, result });
const next = { type: 'next' };
const THREE_ANSWERS = [answer('correct'), next, answer('wrong', 'z'), next, answer('close', 'w')];

describe('expandAcceptedAnswers', () => {
  test('accepts each alternative and all of them together', () => {
    const meaning = 'enggan, berat hati';

    const accepted = expandAcceptedAnswers(meaning);

    expect([...accepted].sort()).toEqual(['berat hati', 'enggan', 'enggan berat hati'].sort());
  });

  test('accepts the answer with and without the part in parentheses', () => {
    const meaning = 'meminjam (dari orang lain)';

    const accepted = expandAcceptedAnswers(meaning);

    expect(accepted).toEqual(expect.arrayContaining(['meminjam', 'meminjam dari orang lain']));
  });

  test.each([
    ['???', ['???']],
    ['', []],
  ])('keeps %p as it is', (meaning, expected) => {
    const accepted = expandAcceptedAnswers(meaning);

    expect(accepted).toEqual(expected);
  });
});

describe('checkTypedAnswer', () => {
  test.each([
    ['Enggan', 'correct'],
    ['  berat   hati ', 'correct'],
    ['engan', 'close'],
    ['senang', 'wrong'],
    ['', 'wrong'],
  ])('%p is %p', (typed, expected) => {
    const accepted = expandAcceptedAnswers('enggan, berat hati');

    const result = checkTypedAnswer(typed, accepted);

    expect(result).toBe(expected);
  });

  test('gives short answers no typo tolerance', () => {
    const accepted = expandAcceptedAnswers('apel');

    const result = checkTypedAnswer('apal', accepted);

    expect(result).toBe('wrong');
  });
});

describe('generateQuiz', () => {
  test('builds one question per word', () => {
    const settings = { count: 'all', type: 'choice' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(1));

    expect(quiz).toHaveLength(WORDS.length);
    expect(new Set(quiz.map((q) => q.wordId)).size).toBe(WORDS.length);
  });

  test('gives every choice question four distinct options with one correct answer', () => {
    const settings = { count: 'all', type: 'choice' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(1));

    for (const question of quiz) {
      expect(question.type).toBe('choice');
      expect(question.options).toHaveLength(4);
      expect(question.options.filter((option) => option.correct)).toHaveLength(1);
      expect(question.options.find((option) => option.correct).text).toBe(question.answer);
      expect(new Set(question.options.map((option) => option.text)).size).toBe(4);
    }
  });

  test.each([
    ['meaning-to-term', ['Apel', 'Apple']],
    ['term-to-meaning', ['Apple', 'Apel']],
  ])('direction %s decides the prompt and the answer', (direction, expected) => {
    const settings = { type: 'typing', direction };

    const [question] = generateQuiz([WORDS[0]], settings);

    expect([question.prompt, question.answer]).toEqual(expected);
  });

  test('mixed direction and type use both variants', () => {
    const settings = { count: 'all', direction: 'mixed', type: 'mixed' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(5));

    expect(new Set(quiz.map((q) => q.direction)).size).toBe(2);
    expect(new Set(quiz.map((q) => q.type)).size).toBe(2);
  });

  test('count "all" asks every word', () => {
    const settings = { count: 'all' };

    const quiz = generateQuiz(WORDS, settings);

    expect(quiz).toHaveLength(WORDS.length);
  });

  test('a shorter quiz prefers weak words', () => {
    const practised = WORDS.map((word, i) => (i < 3 ? { ...word, mastery: 100, attempts: 100 } : word));

    const quiz = generateQuiz(practised, { count: 3, type: 'typing' }, createSeededRng(2));

    expect(quiz.map((q) => q.prompt).sort()).toEqual(['Agenda', 'Deadline', 'Reluctant']);
  });

  test('a choice question falls back to typing when there are no alternatives', () => {
    const words = [WORDS[0]];

    const [question] = generateQuiz(words, { type: 'choice' });

    expect(question.type).toBe('typing');
    expect(question.options).toBeUndefined();
  });

  test('never shows the same answer text twice as options', () => {
    const words = [make('a', 'sama'), make('b', 'sama'), make('c', 'sama'), make('d', 'beda')];

    const quiz = generateQuiz(words, { count: 'all', type: 'choice' }, createSeededRng(9));

    for (const question of quiz) {
      const texts = question.options?.map((option) => option.text) ?? [];
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  describe('by meaning language', () => {
    const words = [
      make('cat', 'kucing', { meaningLanguage: 'id' }),
      make('dog', 'anjing', { meaningLanguage: 'id' }),
      make('bird', 'burung', { meaningLanguage: 'id' }),
      make('fish', 'ikan', { meaningLanguage: 'id' }),
      make('cat', 'neko', { meaningLanguage: 'ja' }),
      make('dog', 'inu', { meaningLanguage: 'ja' }),
    ];

    test('asks only the chosen language and takes the wrong options from it', () => {
      const settings = { meaningLanguage: 'id', count: 'all', type: 'choice' };

      const quiz = generateQuiz(words, settings, createSeededRng(4));

      expect(quiz).toHaveLength(4);
      expect(quiz.every((q) => q.meaningLanguage === 'id')).toBe(true);
      const options = quiz.flatMap((q) => q.options.map((option) => option.text));
      expect(options).not.toContain('Neko');
      expect(options).not.toContain('Inu');
    });

    test.each([
      ['ja', 2],
      [undefined, 6],
    ])('meaning language %p asks %p words', (meaningLanguage, expected) => {
      const settings = { meaningLanguage, count: 'all' };

      const quiz = generateQuiz(words, settings);

      expect(quiz).toHaveLength(expected);
    });
  });
});

describe('quiz session', () => {
  test('cannot skip an unanswered question', () => {
    const { session } = sessionAfter([]);

    const after = quizSessionReducer(session, next);

    expect(after.index).toBe(0);
    expect(after.awaitingNext).toBe(false);
  });

  test('ignores a second answer to the same question', () => {
    const { session } = sessionAfter([answer('correct')]);

    const after = quizSessionReducer(session, answer('wrong', 'y'));

    expect(after.answers).toHaveLength(1);
  });

  test('"next" moves on after an answer', () => {
    const { session } = sessionAfter([answer('correct')], 2);

    const after = quizSessionReducer(session, next);

    expect(after.index).toBe(1);
    expect(after.awaitingNext).toBe(false);
  });

  test('is not finished while the last answer waits for "next"', () => {
    const actions = THREE_ANSWERS;

    const { session } = sessionAfter(actions);

    expect(isQuizFinished(session)).toBe(false);
  });

  test('is finished after "next" on the last question', () => {
    const { session } = sessionAfter(THREE_ANSWERS);

    const after = quizSessionReducer(session, next);

    expect(isQuizFinished(after)).toBe(true);
  });

  test('ignores unknown actions', () => {
    const { session } = sessionAfter([answer('correct')]);

    const after = quizSessionReducer(session, { type: 'unknown' });

    expect(after).toBe(session);
  });

  test.each([answer('wrong'), next])('a finished quiz ignores %j', (action) => {
    const finished = createQuizSession([]);

    const after = quizSessionReducer(finished, action);

    expect(after).toBe(finished);
  });
});

describe('summarizeQuiz', () => {
  test('counts the results; a close answer counts as correct', () => {
    const { session } = sessionAfter([...THREE_ANSWERS, next]);

    const summary = summarizeQuiz(session);

    expect([summary.total, summary.correct, summary.close, summary.wrong, summary.score, summary.percent]).toEqual([
      3, 1, 1, 1, 2, 67,
    ]);
  });

  test('lists the missed words with the given answer', () => {
    const { questions, session } = sessionAfter([...THREE_ANSWERS, next]);

    const { missed } = summarizeQuiz(session);

    expect(missed).toHaveLength(1);
    expect(missed[0].wordId).toBe(questions[1].id);
    expect(missed[0].given).toBe('z');
  });

  test('handles an empty quiz', () => {
    const session = createQuizSession([]);

    const summary = summarizeQuiz(session);

    expect(summary.percent).toBe(0);
  });
});
