import { Button } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { usePrograms } from '../hooks/usePrograms.js';
import { ProgramCard } from '../features/programs/ProgramCard.jsx';
import { ProgramForm } from '../features/programs/ProgramForm.jsx';
import { useOpenPrograms } from '../features/programs/useOpenPrograms.js';

export default function HomePage() {
  const { programs, wordsByProgram, removeProgram } = usePrograms();
  const { openIds, toggle, setAll } = useOpenPrograms();
  const allOpen = programs.length > 0 && programs.every((program) => openIds.has(program.id));

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
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h2 id="programs-title" className="h4 mb-0">Programs</h2>
            <Button
              size="small"
              variant="ghost"
              onClick={() => setAll(programs.map((program) => program.id), !allOpen)}
            >
              {allOpen ? 'Hide all' : 'Show all'}
            </Button>
          </div>
          <ul className="list-unstyled vstack gap-3 mb-0">
            {programs.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                words={wordsByProgram[program.id] ?? []}
                open={openIds.has(program.id)}
                onToggle={() => toggle(program.id)}
                onRemove={() => removeProgram(program.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
