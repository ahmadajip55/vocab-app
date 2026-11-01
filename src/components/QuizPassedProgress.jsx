import { PASSED_LEVEL } from '../features/vocabulary/model.js';
import { PassedBadge } from './PassedBadge.jsx';

/** Correct quiz answers so far, "Quiz 37/100"; at 100 it becomes the Passed badge. */
export function QuizPassedProgress({ word }) {
  const count = Math.min(word.quizPassed ?? 0, PASSED_LEVEL);
  if (count >= PASSED_LEVEL) return <PassedBadge word={word} />;
  const label = `Quiz: ${count} of ${PASSED_LEVEL} correct answers to pass`;
  return (
    <span className="d-inline-flex align-items-center gap-2 small" title={label}>
      <span aria-hidden="true" className="text-body-secondary">
        Quiz
      </span>
      <span aria-hidden="true" className="progress mini-progress border border-primary">
        <span className="progress-bar" style={{ width: `${(count / PASSED_LEVEL) * 100}%` }} />
      </span>
      <span aria-hidden="true" className="mini-count text-body-secondary font-monospace">
        {count}/{PASSED_LEVEL}
      </span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
