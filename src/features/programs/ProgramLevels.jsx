/** The program's chosen levels as small tags, e.g. [N5] [N4]. */
export function ProgramLevels({ levels }) {
  if (!levels?.length) return null;
  return (
    <span className="d-inline-flex flex-wrap gap-1" aria-label={`Levels: ${levels.join(', ')}`}>
      {levels.map((level) => (
        <span key={level} className="badge rounded-pill border text-body-emphasis bg-body-tertiary">
          {level}
        </span>
      ))}
    </span>
  );
}
