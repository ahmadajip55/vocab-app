import { ButtonLink } from '../components/Button.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ProgressBar } from '../components/ProgressBar.jsx';
import { usePrograms } from '../hooks/usePrograms.js';
import { ProgramForm } from '../features/programs/ProgramForm.jsx';
import { ProgramLevels } from '../features/programs/ProgramLevels.jsx';
import { ProgramProgress } from '../features/programs/ProgramProgress.jsx';
import { getLanguage } from '../languages/index.js';
import { PASSED_LEVEL, quizProgressOf, summarizeWords } from '../features/vocabulary/model.js';

export default function HomePage() {
  const { programs, wordsByProgram, removeProgram } = usePrograms();

  return (
    <>
      <PageHeader title="Vocab Cards">
        Group your vocabulary into programs and practice each one with study cards and quizzes.
      </PageHeader>

      <ProgramForm />

      {programs.length === 0 ? (
        <EmptyState title="No programs yet">
          Add a program above, for example the course or exam you are studying for. Then add or import its words.
        </EmptyState>
      ) : (
        <section className="vstack gap-3" aria-labelledby="programs-title">
          <h2 id="programs-title" className="h4 mb-0">Programs</h2>
          <ul className="list-unstyled vstack gap-3 mb-0">
            {programs.map((program) => {
              const words = wordsByProgram[program.id] ?? [];
              const summary = summarizeWords(words);
              const quiz = quizProgressOf(words);
              return (
                <li key={program.id} className="card card-body vstack gap-3">
                  <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <h3 className="h5 mb-0">{program.name}</h3>
                      <ProgramLevels levels={program.levels} />
                    </div>
                    <span className="small text-body-secondary">
                      {getLanguage(program.wordLanguage).label} · {summary.total} words, {summary.mastered} mastered
                      {summary.passed > 0 ? (
                        <>
                          {' '}
                          · <span className="badge rounded-pill text-bg-success">✓ {summary.passed} passed</span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  {summary.total > 0 ? (
                    <>
                      <ProgramProgress words={words} summary={summary} />
                      <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 small">
                        <span className="fw-semibold">Quiz progress</span>
                        <ProgressBar
                          value={quiz.points}
                          max={quiz.max}
                          label={`Quiz progress for ${program.name}: ${quiz.percent}%`}
                        />
                        <span className="text-body-secondary">
                          {quiz.passed} of {quiz.total} words passed · {quiz.percent}%
                        </span>
                      </div>
                      <p className="small text-body-secondary mb-0">A word is passed after {PASSED_LEVEL} correct answers in the quiz.</p>
                    </>
                  ) : (
                    <p className="small text-body-secondary mb-0">No words yet. Add them one by one or import a spreadsheet.</p>
                  )}
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
                      onConfirm={() => removeProgram(program.id)}
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
