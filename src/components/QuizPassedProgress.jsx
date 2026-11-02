import { useTargets } from '../hooks/useTargets.js';
import { PassedBadge } from './PassedBadge.jsx';

/** Correct quiz answers so far, e.g. "Quiz 37/100"; at the program's target it becomes the Passed badge. */
export function QuizPassedProgress({ word }) {
  const { passed } = useTargets();
  const count = Math.min(word.quizPassed ?? 0, passed);
  if (count >= passed) return <PassedBadge word={word} />;
  const label = `Quiz: ${count} of ${passed} correct answers to pass`;
  return (
    <span className="d-inline-flex align-items-center gap-2 small" title={label}>
      <span aria-hidden="true" className="text-body-secondary">
        Quiz
      </span>
      <span aria-hidden="true" className="progress mini-progress border border-primary">
        <span className="progress-bar" style={{ width: `${(count / passed) * 100}%` }} />
      </span>
      <span aria-hidden="true" className="mini-count text-body-secondary font-monospace">
        {count}/{passed}
      </span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
