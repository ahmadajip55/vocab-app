import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ProgramLevels } from '../features/programs/ProgramLevels.jsx';
import { getLanguage } from '../languages/index.js';
import { summarizeWords } from '../features/vocabulary/model.js';
import { usePrograms } from '../hooks/usePrograms.js';

/** Shown every time a menu is opened: the user picks which program to work on. */
export default function ProgramPickerPage({ section }) {
  const { programs, wordsByProgram } = usePrograms();

  return (
    <>
      <PageHeader title={`${section.label}: choose a program`}>
        Pick the program you want to {section.action}.
      </PageHeader>

      {programs.length === 0 ? (
        <EmptyState title="No programs yet" actions={<ButtonLink variant="primary" to="/">Add a program on Home</ButtonLink>}>
          Programs are created on the Home page. Add one there first.
        </EmptyState>
      ) : (
        <ul className="list-group" aria-label="Programs">
          {programs.map((program) => {
            const summary = summarizeWords(wordsByProgram[program.id] ?? []);
            return (
              <li key={program.id} className="list-group-item p-0">
                <Link
                  className="list-group-item-action d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-3 text-decoration-none text-body rounded"
                  to={`/${section.path}/${program.id}`}
                >
                  <strong className="fs-5">{program.name}</strong>
                  <ProgramLevels levels={program.levels} />
                  <span className="small text-body-secondary">
                    {getLanguage(program.wordLanguage).label} · {summary.total} words · {summary.mastered} mastered
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
