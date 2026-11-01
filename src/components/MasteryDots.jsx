import { getStatus, MASTERED_LEVEL, STATUS_LABELS } from '../features/vocabulary/model.js';

/** Bootstrap colour for each learning status. */
export const STATUS_COLORS = { new: 'secondary', weak: 'danger', learning: 'warning', mastered: 'success' };

/**
 * How well a word is known: a small bar filled up to MASTERED_LEVEL (100)
 * correct answers in a row, with the count next to it.
 * `showLabel` writes "Mastery" in front of it (the word list, next to the quiz progress).
 */
export function MasteryDots({ word, showLabel = false }) {
  const status = getStatus(word);
  const level = Math.min(word.mastery, MASTERED_LEVEL);
  const label = `${STATUS_LABELS[status]}: ${level} of ${MASTERED_LEVEL}`;
  return (
    <span className="d-inline-flex align-items-center gap-2 small" title={label}>
      {showLabel ? (
        <span aria-hidden="true" className="text-body-secondary">
          Mastery
        </span>
      ) : null}
      <span aria-hidden="true" className={`progress mini-progress border border-${STATUS_COLORS[status]}`}>
        <span className={`progress-bar bg-${STATUS_COLORS[status]}`} style={{ width: `${(level / MASTERED_LEVEL) * 100}%` }} />
      </span>
      <span aria-hidden="true" className="mini-count text-body-secondary font-monospace">
        {level}/{MASTERED_LEVEL}
      </span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
