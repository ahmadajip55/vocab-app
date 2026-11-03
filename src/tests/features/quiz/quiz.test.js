import { describe, expect, it } from '@jest/globals';
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
  it('should accept each alternative and all of them together when the answer has several', () => {
    const meaning = 'enggan, berat hati';

    const accepted = expandAcceptedAnswers(meaning);

    expect([...accepted].sort()).toEqual(['berat hati', 'enggan', 'enggan berat hati'].sort());
  });

  it('should accept the answer with and without it when part of the answer is in parentheses', () => {
    const meaning = 'meminjam (dari orang lain)';

    const accepted = expandAcceptedAnswers(meaning);

    expect(accepted).toEqual(expect.arrayContaining(['meminjam', 'meminjam dari orang lain']));
  });

  it.each([
    ['???', ['???']],
    ['', []],
  ])('should keep %p as it is when it has no alternatives', (meaning, expected) => {
    const accepted = expandAcceptedAnswers(meaning);

    expect(accepted).toEqual(expected);
  });
});

describe('checkTypedAnswer', () => {
  it.each([
    ['Enggan', 'correct'],
    ['  berat   hati ', 'correct'],
    ['engan', 'close'],
    ['senang', 'wrong'],
    ['', 'wrong'],
  ])('should rate the answer %p as %p when it is checked', (typed, expected) => {
    const accepted = expandAcceptedAnswers('enggan, berat hati');

    const result = checkTypedAnswer(typed, accepted);

    expect(result).toBe(expected);
  });

  it('should allow no typo when the answer is short', () => {
    const accepted = expandAcceptedAnswers('apel');

    const result = checkTypedAnswer('apal', accepted);

    expect(result).toBe('wrong');
  });
});

describe('generateQuiz', () => {
  it('should give each option its word when the quiz asks meaning to word', () => {
    const japanese = [
      { ...createWord({ term: '右', meaning: 'kanan', wordLanguage: 'ja' }), romaji: 'migi' },
      { ...createWord({ term: '左', meaning: 'kiri', wordLanguage: 'ja' }), romaji: 'hidari' },
      createWord({ term: 'neko', meaning: 'kucing', wordLanguage: 'ja' }),
      createWord({ term: 'inu', meaning: 'anjing', wordLanguage: 'ja' }),
    ];

    const expectedWord = (text) => {
      const word = japanese.find((item) => item.term === text);
      return { id: word.id, term: word.term, wordLanguage: 'ja', romaji: word.romaji ?? '', kana: word.kana ?? '' };
    };

    const [question] = generateQuiz(japanese, { count: 1, type: 'choice', direction: 'meaning-to-term' }, createSeededRng(2));

    expect(question.options).toHaveLength(4);
    expect(question.options.map((option) => option.word)).toEqual(question.options.map((option) => expectedWord(option.text)));
  });

  it('should give the options no word when the quiz asks word to meaning', () => {
    const settings = { count: 'all', type: 'choice', direction: 'term-to-meaning' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(1));

    expect(quiz.flatMap((question) => question.options).some((option) => 'word' in option)).toBe(false);
  });

  it('should ask one question per word when the count is "all"', () => {
    const settings = { count: 'all', type: 'choice' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(1));

    expect(quiz).toHaveLength(WORDS.length);
    expect(new Set(quiz.map((q) => q.wordId)).size).toBe(WORDS.length);
  });

  it('should give four distinct options with one correct answer when the questions are multiple choice', () => {
    const settings = { count: 'all', type: 'choice' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(1));

    expect(quiz.every((question) => question.type === 'choice')).toBe(true);
    expect(quiz.map((question) => question.options.length)).toEqual(quiz.map(() => 4));
    expect(quiz.map((question) => question.options.filter((option) => option.correct).length)).toEqual(quiz.map(() => 1));
    expect(quiz.map((question) => question.options.find((option) => option.correct).text)).toEqual(quiz.map((question) => question.answer));
    expect(quiz.map((question) => new Set(question.options.map((option) => option.text)).size)).toEqual(quiz.map(() => 4));
  });

  it.each([
    ['meaning-to-term', ['Apel', 'Apple']],
    ['term-to-meaning', ['Apple', 'Apel']],
  ])('should use the matching prompt and answer when the direction is %s', (direction, expected) => {
    const settings = { type: 'typing', direction };

    const [question] = generateQuiz([WORDS[0]], settings);

    expect([question.prompt, question.answer]).toEqual(expected);
  });

  it('should use both variants when the direction and type are mixed', () => {
    const settings = { count: 'all', direction: 'mixed', type: 'mixed' };

    const quiz = generateQuiz(WORDS, settings, createSeededRng(5));

    expect(new Set(quiz.map((q) => q.direction)).size).toBe(2);
    expect(new Set(quiz.map((q) => q.type)).size).toBe(2);
  });

  it('should ask every word when the count is "all"', () => {
    const settings = { count: 'all' };

    const quiz = generateQuiz(WORDS, settings);

    expect(quiz).toHaveLength(WORDS.length);
  });

  it('should prefer weak words when the quiz is shorter than the list', () => {
    const practised = WORDS.map((word, i) => (i < 3 ? { ...word, mastery: 100, attempts: 100 } : word));

    const quiz = generateQuiz(practised, { count: 3, type: 'typing' }, createSeededRng(2));

    expect(quiz.map((q) => q.prompt).sort()).toEqual(['Agenda', 'Deadline', 'Reluctant']);
  });

  it('should ask by typing when there are no alternatives for a choice question', () => {
    const words = [WORDS[0]];

    const [question] = generateQuiz(words, { type: 'choice' });

    expect(question.type).toBe('typing');
    expect(question.options).toBeUndefined();
  });

  it('should never show the same answer twice when options are built', () => {
    const words = [make('a', 'sama'), make('b', 'sama'), make('c', 'sama'), make('d', 'beda')];

    const quiz = generateQuiz(words, { count: 'all', type: 'choice' }, createSeededRng(9));
    const optionTexts = quiz.map((question) => question.options?.map((option) => option.text) ?? []);

    expect(optionTexts.map((texts) => new Set(texts).size)).toEqual(optionTexts.map((texts) => texts.length));
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

    it('should take the wrong options from the chosen language when a meaning language is chosen', () => {
      const settings = { meaningLanguage: 'id', count: 'all', type: 'choice' };

      const quiz = generateQuiz(words, settings, createSeededRng(4));
      const options = quiz.flatMap((q) => q.options.map((option) => option.text));

      expect(quiz).toHaveLength(4);
      expect(quiz.every((q) => q.meaningLanguage === 'id')).toBe(true);
      expect(options).not.toContain('Neko');
      expect(options).not.toContain('Inu');
    });

    it.each([
      ['ja', 2],
      [undefined, 6],
    ])('should ask, for meaning language %p, %p words when the quiz is built', (meaningLanguage, expected) => {
      const settings = { meaningLanguage, count: 'all' };

      const quiz = generateQuiz(words, settings);

      expect(quiz).toHaveLength(expected);
    });
  });
});

describe('quiz session', () => {
  it('should not move on when the question is unanswered', () => {
    const { session } = sessionAfter([]);

    const after = quizSessionReducer(session, next);

    expect(after.index).toBe(0);
    expect(after.awaitingNext).toBe(false);
  });

  it('should ignore the second answer when a question is answered twice', () => {
    const { session } = sessionAfter([answer('correct')]);

    const after = quizSessionReducer(session, answer('wrong', 'y'));

    expect(after.answers).toHaveLength(1);
  });

  it('should move on when "next" follows an answer', () => {
    const { session } = sessionAfter([answer('correct')], 2);

    const after = quizSessionReducer(session, next);

    expect(after.index).toBe(1);
    expect(after.awaitingNext).toBe(false);
  });

  it('should not be finished when the last answer waits for "next"', () => {
    const actions = THREE_ANSWERS;

    const { session } = sessionAfter(actions);

    expect(isQuizFinished(session)).toBe(false);
  });

  it('should be finished when "next" follows the last answer', () => {
    const { session } = sessionAfter(THREE_ANSWERS);

    const after = quizSessionReducer(session, next);

    expect(isQuizFinished(after)).toBe(true);
  });

  it('should ignore the action when it is unknown', () => {
    const { session } = sessionAfter([answer('correct')]);

    const after = quizSessionReducer(session, { type: 'unknown' });

    expect(after).toBe(session);
  });

  it.each([answer('wrong'), next])('should ignore %j when the quiz is finished', (action) => {
    const finished = createQuizSession([]);

    const after = quizSessionReducer(finished, action);

    expect(after).toBe(finished);
  });
});

describe('summarizeQuiz', () => {
  it('should count a close answer as correct when the results are counted', () => {
    const { session } = sessionAfter([...THREE_ANSWERS, next]);

    const summary = summarizeQuiz(session);

    expect([summary.total, summary.correct, summary.close, summary.wrong, summary.score, summary.percent]).toEqual([
      3, 1, 1, 1, 2, 67,
    ]);
  });

  it('should list the missed words with the given answer when some answers are wrong', () => {
    const { questions, session } = sessionAfter([...THREE_ANSWERS, next]);

    const { missed } = summarizeQuiz(session);

    expect(missed).toHaveLength(1);
    expect(missed[0].wordId).toBe(questions[1].id);
    expect(missed[0].given).toBe('z');
  });

  it('should return zero counts when the quiz is empty', () => {
    const session = createQuizSession([]);

    const summary = summarizeQuiz(session);

    expect(summary.percent).toBe(0);
  });
});
