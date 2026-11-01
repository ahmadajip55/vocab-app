import { useParams } from 'react-router-dom';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ProgramBar } from '../features/programs/ProgramBar.jsx';
import { ProgramScope } from '../features/vocabulary/VocabularyProvider.jsx';

/** Renders a menu page for the program in the URL, e.g. /quiz/:programId. */
export default function ProgramRoute({ section, children }) {
  const { programId } = useParams();
  return (
    <ProgramScope
      key={programId}
      programId={programId}
      fallback={
        <EmptyState title="Program not found" actions={<ButtonLink to={`/${section}`}>Choose a program</ButtonLink>}>
          This program does not exist, or it was deleted.
        </EmptyState>
      }
    >
      <ProgramBar section={section} />
      {children}
    </ProgramScope>
  );
}
