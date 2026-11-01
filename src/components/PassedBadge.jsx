import { PASSED_LEVEL } from '../features/vocabulary/model.js';

/** "Passed" tag for a word answered correctly in the quiz PASSED_LEVEL (100) times. */
export function PassedBadge({ word }) {
  if ((word.quizPassed ?? 0) < PASSED_LEVEL) return null;
  return (
    <span className="badge rounded-pill text-bg-success" title={`Answered correctly in the quiz ${word.quizPassed} times`}>
      ✓ Passed
    </span>
  );
}
