import { useId } from 'react';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { ConfirmButton } from '../../components/ConfirmButton.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { getLanguage } from '../../languages/index.js';
import { quizProgressOf, summarizeWords, targetsOf } from '../vocabulary/model.js';
import { ProgramLevels } from './ProgramLevels.jsx';
import { ProgramProgress } from './ProgramProgress.jsx';

/** One program on Home: its name and totals, with progress, targets and actions that can be shown or hidden. */
export function ProgramCard({ program, words, open, onToggle, onRemove }) {
  const detailsId = useId();
  const targets = targetsOf(program);
  const summary = summarizeWords(words, targets);
  const quiz = quizProgressOf(words, targets);

  return (
    <li className="card card-body vstack gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <h3 className="h5 mb-0">{program.name}</h3>
          <ProgramLevels levels={program.levels} />
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
          <span className="small text-body-secondary">
            {getLanguage(program.wordLanguage).label} · {summary.total} words, {summary.mastered} mastered
            {summary.passed > 0 ? (
              <>
                {' '}
                · <span className="badge rounded-pill text-bg-success">✓ {summary.passed} passed</span>
              </>
            ) : null}
          </span>
          <Button
            size="small"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? 'Hide' : 'Show'} ${program.name}`}
            onClick={onToggle}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      <div id={detailsId} className="vstack gap-3" hidden={!open}>
        {summary.total > 0 ? (
          <>
            <ProgramProgress summary={summary} />
            <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 small">
              <span className="fw-semibold">Quiz progress</span>
              <ProgressBar value={quiz.points} max={quiz.max} label={`Quiz progress for ${program.name}: ${quiz.percent}%`} />
              <span className="text-body-secondary">
                {quiz.passed} of {quiz.total} words passed · {quiz.percent}%
              </span>
            </div>
          </>
        ) : (
          <p className="small text-body-secondary mb-0">No words yet. Add them one by one or import a spreadsheet.</p>
        )}
        <p className="small text-body-secondary mb-0">
          Mastered after {targets.mastered} correct answers in a row · passed after {targets.passed} correct quiz answers.
        </p>
        <div className="d-flex flex-wrap align-items-center gap-2">
          {summary.total > 0 ? (
            <>
              <ButtonLink variant="primary" size="small" to={`/flashcards/${program.id}`}>
                Flashcards
              </ButtonLink>
              <ButtonLink size="small" to={`/quiz/${program.id}`}>
                Quiz
              </ButtonLink>
            </>
          ) : null}
          <ButtonLink size="small" to={`/words/${program.id}`}>
            Words
          </ButtonLink>
          <ButtonLink size="small" to={`/import/${program.id}`}>
            Import
          </ButtonLink>
          <ConfirmButton
            size="small"
            prompt={`Delete "${program.name}" and its ${summary.total} words?`}
            confirmLabel="Yes, delete"
            onConfirm={onRemove}
          >
            Delete
          </ConfirmButton>
        </div>
      </div>
    </li>
  );
}
