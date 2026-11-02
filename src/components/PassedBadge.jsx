import { isPassed } from '../features/vocabulary/model.js';
import { useTargets } from '../hooks/useTargets.js';

/** "Passed" tag for a word answered correctly in the quiz as often as the program's target. */
export function PassedBadge({ word }) {
  const targets = useTargets();
  if (!isPassed(word, targets)) return null;
  return (
    <span className="badge rounded-pill text-bg-success" title={`Answered correctly in the quiz ${word.quizPassed} times`}>
      ✓ Passed
    </span>
  );
}
