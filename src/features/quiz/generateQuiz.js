import { shuffle } from '../../lib/random.js';
import { normalizeText } from '../../lib/text.js';
import { expandAcceptedAnswers } from './checkAnswer.js';

export const OPTION_COUNT = 4;

function pickSide(word, direction) {
  return direction === 'term-to-meaning'
    ? { prompt: word.term, answer: word.meaning }
    : { prompt: word.meaning, answer: word.term };
}

function buildOptions(word, answer, direction, distractorPool, rng) {
  const answerKey = normalizeText(answer);
  const usedKeys = new Set([answerKey]);
  const distractors = [];

  for (const candidate of shuffle(distractorPool, rng)) {
    if (candidate.id === word.id) continue;
    const text = pickSide(candidate, direction).answer;
    const key = normalizeText(text);
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);
    distractors.push(text);
    if (distractors.length === OPTION_COUNT - 1) break;
  }

  const options = [
    { text: answer, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ];
  return shuffle(options, rng).map((option, index) => ({ id: `o${index}`, ...option }));
}

function buildQuestion(word, { direction, type, distractorPool }, rng) {
  const resolvedDirection =
    direction === 'mixed' ? (rng() < 0.5 ? 'term-to-meaning' : 'meaning-to-term') : direction;
  const { prompt, answer } = pickSide(word, resolvedDirection);

  let questionType = type === 'mixed' ? (rng() < 0.5 ? 'choice' : 'typing') : type;
  let options;
  if (questionType === 'choice') {
    options = buildOptions(word, answer, resolvedDirection, distractorPool, rng);
    // With too few distinct words there are no real alternatives: ask it as typing instead.
    if (options.length < 2) {
      questionType = 'typing';
      options = undefined;
    }
  }

  return {
    id: word.id,
    wordId: word.id,
    direction: resolvedDirection,
    type: questionType,
    prompt,
    answer,
    accepted: expandAcceptedAnswers(answer),
    options,
    termLanguage: word.wordLanguage ?? 'en',
    meaningLanguage: word.meaningLanguage,
    // The word itself, for its kana reading and romaji in a Japanese quiz.
    word: { id: word.id, term: word.term, wordLanguage: word.wordLanguage, romaji: word.romaji ?? '' },
  };
}

/**
 * Build a quiz from the vocabulary.
 *
 * settings: { count (number or 'all'), direction, type, meaningLanguage, distractorPool }
 *   direction: 'term-to-meaning' | 'meaning-to-term' | 'mixed'
 *   type: 'choice' | 'typing' | 'mixed'
 *   meaningLanguage: only entries with this meaning language are asked, and
 *     wrong options come from the same language (empty = every language)
 *
 * Each word appears at most once. When the quiz is shorter than the word list,
 * words with lower mastery are chosen first so weak words get more practice.
 */
export function generateQuiz(words, settings, rng = Math.random) {
  const {
    count = 10,
    direction = 'term-to-meaning',
    type = 'choice',
    meaningLanguage = '',
    distractorPool = words,
  } = settings;

  const inLanguage = (word) => !meaningLanguage || word.meaningLanguage === meaningLanguage;
  const candidates = shuffle(words.filter(inLanguage), rng);
  const pool = distractorPool.filter(inLanguage);
  const limit = Number(count) > 0 ? Number(count) : candidates.length;
  const weakestFirst = [...candidates].sort((a, b) => a.mastery - b.mastery).slice(0, limit);

  return shuffle(weakestFirst, rng).map((word) =>
    buildQuestion(word, { direction, type, distractorPool: pool }, rng),
  );
}
