import { Link } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { getLanguage } from '../../languages/index.js';
import { ProgramLevels } from './ProgramLevels.jsx';

/** Names the program the page is working on, with a way back to the picker. */
export function ProgramBar({ section }) {
  const { program } = useVocabulary();
  return (
    <p className="d-flex flex-wrap align-items-baseline gap-2 text-body-secondary mb-0">
      Program: <strong className="text-body">{program.name}</strong>
      <span>{getLanguage(program.wordLanguage).label}</span>
      <ProgramLevels levels={program.levels} />
      <Link to={`/${section}`}>Change program</Link>
    </p>
  );
}
