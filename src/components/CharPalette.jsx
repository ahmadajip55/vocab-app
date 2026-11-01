
/** Buttons for letters that are hard to type on some keyboards (ñ, ü, ł...). */
export function CharPalette({ chars, onInsert, label = 'Special characters' }) {
  if (!chars?.length) return null;
  return (
    <div className="d-flex flex-wrap gap-1 mt-2" role="group" aria-label={label}>
      {chars.map((char) => (
        <button
          key={char}
          type="button"
          className="btn btn-outline-secondary btn-sm"
          style={{ minWidth: 36 }}
          // keep focus (and the caret) in the text field
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(char)}
        >
          {char}
        </button>
      ))}
    </div>
  );
}
