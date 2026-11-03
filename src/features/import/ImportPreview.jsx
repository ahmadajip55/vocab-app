import { getLanguage } from '../../languages/index.js';

const PREVIEW_ROWS = 50;
const LIST_ROWS = 20;

/** Shows what an import will do before anything is saved. */
export function ImportPreview({ draft, meaningLanguage }) {
  const { parsed, plan } = draft;
  const hiddenRows = Math.max(0, plan.toAdd.length - PREVIEW_ROWS);

  return (
    <div className="vstack gap-3">
      <ul className="list-unstyled d-flex flex-wrap gap-2 mb-0" aria-label="Import summary">
        <li className="border border-success text-success rounded px-3 py-2 bg-body">
          <strong>{plan.toAdd.length}</strong> words ready to add
        </li>
        <li className="border rounded px-3 py-2 bg-body">
          <strong>{plan.duplicates.length}</strong> duplicates skipped
        </li>
        {plan.toAdd.some((word) => word.translated) ? (
          <li className="border rounded px-3 py-2 bg-body">
            <strong>{plan.toAdd.filter((word) => word.translated).length}</strong> meanings found online
          </li>
        ) : null}
        {plan.toAdd.some((word) => !word.meaning) ? (
          <li className="border border-danger text-danger rounded px-3 py-2 bg-body">
            <strong>{plan.toAdd.filter((word) => !word.meaning).length}</strong> without a meaning
          </li>
        ) : null}
        <li className={`border rounded px-3 py-2 bg-body${parsed.issues.length ? ' border-danger text-danger' : ''}`}>
          <strong>{parsed.issues.length}</strong> problematic rows
        </li>
      </ul>

      {draft.translation?.error && plan.toAdd.some((word) => !word.meaning) ? (
        <p className="alert alert-warning mb-0">
          Some meanings could not be found online ({draft.translation.error}). Those words are added without a meaning;
          use "Search meaning" when editing them, or check again later.
        </p>
      ) : null}

      {!parsed.hasHeader ? (
        <p className="alert alert-secondary mb-0">
          The header row was not recognised, so column A is treated as the word and column B as its meaning.
        </p>
      ) : null}

      {plan.toAdd.length > 0 ? (
        <div className="table-responsive border rounded">
          <table className="table table-sm align-top mb-0">
            <caption className="visually-hidden">Words to be added</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Word</th>
                <th scope="col">Meaning ({getLanguage(meaningLanguage).label})</th>
              </tr>
            </thead>
            <tbody>
              {plan.toAdd.slice(0, PREVIEW_ROWS).map((word) => (
                <tr key={word.row}>
                  <td className="text-body-secondary">{word.row}</td>
                  <td>
                    <strong lang={word.reading ? 'ja' : undefined}>{word.term}</strong>
                    {word.reading ? (
                      <span className="ms-2 small text-body-secondary" lang="ja">
                        {word.reading}
                      </span>
                    ) : null}
                    {word.romaji ? (
                      <span className="ms-2 small text-body-secondary" lang="ja-Latn">
                        {word.romaji}
                      </span>
                    ) : null}
                  </td>
                  <td lang={meaningLanguage}>{word.meaning ? (
                      <>
                        {word.meaning}
                        {word.translated ? <span className="badge text-bg-light border ms-2 text-uppercase">translated</span> : null}
                      </>
                    ) : (
                      <span className="small text-body-secondary">No meaning found</span>
                    )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hiddenRows > 0 ? <p className="small text-body-secondary mb-0">and {hiddenRows} more words.</p> : null}

      {parsed.issues.length > 0 ? (
        <details className="border rounded p-3 bg-body" open>
          <summary>Rows skipped because they were problematic ({parsed.issues.length})</summary>
          <ul className="mt-2 mb-0 small vstack gap-1">
            {parsed.issues.slice(0, LIST_ROWS).map((issue) => (
              <li key={issue.row}>
                Row {issue.row}: {issue.reason}
              </li>
            ))}
          </ul>
          {parsed.issues.length > LIST_ROWS ? <p className="small text-body-secondary mb-0">and {parsed.issues.length - LIST_ROWS} more.</p> : null}
        </details>
      ) : null}

      {plan.duplicates.length > 0 ? (
        <details className="border rounded p-3 bg-body">
          <summary>Duplicates skipped ({plan.duplicates.length})</summary>
          <ul className="mt-2 mb-0 small vstack gap-1">
            {plan.duplicates.slice(0, LIST_ROWS).map((word) => (
              <li key={word.row}>
                Row {word.row}: "{word.term}". {word.reason}.
              </li>
            ))}
          </ul>
          {plan.duplicates.length > LIST_ROWS ? <p className="small text-body-secondary mb-0">and {plan.duplicates.length - LIST_ROWS} more.</p> : null}
        </details>
      ) : null}
    </div>
  );
}
