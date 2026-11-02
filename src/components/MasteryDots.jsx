import { getStatus, STATUS_LABELS } from '../features/vocabulary/model.js';
import { useTargets } from '../hooks/useTargets.js';

/** Bootstrap colour for each learning status. */
export const STATUS_COLORS = { new: 'secondary', weak: 'danger', learning: 'warning', mastered: 'success' };

/**
 * How well a word is known: a small bar filled up to the program's mastery target
 * correct answers in a row, with the count next to it.
 * `showLabel` writes "Mastery" in front of it (the word list, next to the quiz progress).
 */
export function MasteryDots({ word, showLabel = false }) {
  const targets = useTargets();
  const status = getStatus(word, targets);
  const level = Math.min(word.mastery, targets.mastered);
  const label = `${STATUS_LABELS[status]}: ${level} of ${targets.mastered}`;
  return (
    <span className="d-inline-flex align-items-center gap-2 small" title={label}>
      {showLabel ? (
        <span aria-hidden="true" className="text-body-secondary">
          Mastery
        </span>
      ) : null}
      <span aria-hidden="true" className={`progress mini-progress border border-${STATUS_COLORS[status]}`}>
        <span className={`progress-bar bg-${STATUS_COLORS[status]}`} style={{ width: `${(level / targets.mastered) * 100}%` }} />
      </span>
      <span aria-hidden="true" className="mini-count text-body-secondary font-monospace">
        {level}/{targets.mastered}
      </span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
