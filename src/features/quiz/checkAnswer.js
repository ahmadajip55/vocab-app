import { levenshtein, normalizeText } from '../../lib/text.js';

/**
 * All normalised answers that should be accepted for a stored answer.
 * "meminjam (dari orang lain)" accepts the full text, "meminjam", and
 * "dari orang lain" is ignored. "enggan, berat hati" accepts "enggan",
 * "berat hati", or the whole phrase.
 */
export function expandAcceptedAnswers(answer) {
  const raw = String(answer ?? '');
  const withoutParentheses = raw.replace(/\([^)]*\)/g, ' ');
  const candidates = [raw, withoutParentheses, ...withoutParentheses.split(/[;,/]/)];

  const accepted = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) accepted.add(normalized);
  }
  if (accepted.size === 0 && raw.trim()) accepted.add(raw.trim().toLowerCase());
  return [...accepted];
}

/**
 * Grade a typed answer.
 * 'correct': matches an accepted answer after normalisation.
 * 'close': one typo away from an accepted answer of 5+ letters. Counts as correct.
 * 'wrong': anything else, including empty input.
 */
export function checkTypedAnswer(input, accepted) {
  const typed = normalizeText(input);
  if (!typed) return 'wrong';
  if (accepted.includes(typed)) return 'correct';
  const closeEnough = accepted.some(
    (candidate) => candidate.length >= 5 && levenshtein(typed, candidate) <= 1,
  );
  return closeEnough ? 'close' : 'wrong';
}
