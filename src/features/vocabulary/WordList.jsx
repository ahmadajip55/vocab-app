import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { ConfirmButton } from '../../components/ConfirmButton.jsx';
import { MasteryDots } from '../../components/MasteryDots.jsx';
import { QuizPassedProgress } from '../../components/QuizPassedProgress.jsx';
import { getLanguage } from '../../languages/index.js';
import { fetchRomaji, needsRomajiLookup, romajiForWord } from '../../languages/japanese/romaji.js';
import { clampPage, pageCount, pageItems } from '../../lib/pagination.js';

export const PAGE_SIZE = 10;

/** Romaji for a row: any entry's saved reading, or one worked out from kana. */
function groupRomaji(group) {
  for (const word of group.words) {
    const romaji = romajiForWord(word);
    if (romaji) return romaji;
  }
  return '';
}

/**
 * Looks up romaji for the shown Japanese rows that have kanji but no saved
 * reading, one at a time, and hands each result to onRomaji(ids, romaji) so
 * every entry of the row saves it. Each row is tried once per visit, so an
 * offline list does not keep retrying.
 */
function useRomajiLookup(shown, onRomaji) {
  const triedRef = useRef(new Set());
  const pending = shown.filter(
    (group) => needsRomajiLookup(group.words[0]) && !groupRomaji(group) && !triedRef.current.has(group.key),
  );
  const pendingKey = pending.map((group) => group.key).join('|');

  useEffect(() => {
    if (!pendingKey || !onRomaji) return undefined;
    const controller = new AbortController();
    (async () => {
      for (const group of pending) {
        if (controller.signal.aborted) return;
        triedRef.current.add(group.key);
        try {
          const romaji = await fetchRomaji(group.term, { signal: controller.signal });
          if (romaji && !controller.signal.aborted) onRomaji(group.words.map((word) => word.id), romaji);
        } catch {
          // offline or blocked: the word is shown without romaji
        }
      }
    })();
    return () => controller.abort();
    // `pending` is derived from pendingKey; listing it would restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, onRomaji]);
}

/**
 * Renders words grouped by term (see groupByTerm), 10 rows per page. A row
 * lists one meaning per meaning language, each with its own progress and
 * actions. Remount it (change its key) to go back to page 1.
 */
export function WordList({ groups, editingId, onEdit, onRemove, onRomaji }) {
  const [requestedPage, setPage] = useState(1);
  const pages = pageCount(groups.length, PAGE_SIZE);
  const page = clampPage(requestedPage, pages); // deleting the last word of a page moves back one
  const start = (page - 1) * PAGE_SIZE;
  const shown = groups.slice(start, start + PAGE_SIZE);
  useRomajiLookup(shown, onRomaji);

  return (
    <div className="vstack gap-3">
      <ul className="list-group">
        {shown.map((group) => {
          const romaji = groupRomaji(group);
          return (
            <li
              key={group.key}
              className={`list-group-item vstack gap-2 py-3${
                group.words.some((word) => word.id === editingId) ? ' bg-body-tertiary border-start border-4 border-primary' : ''
              }`}
            >
              <p className="d-flex flex-wrap align-items-center gap-2 mb-0 fs-5 font-display text-break">
                <strong>{group.term}</strong>
                {romaji ? (
                  <span className="fs-6 fw-normal text-body-secondary" lang="ja-Latn">
                    {romaji}
                  </span>
                ) : null}
              </p>
              <ul className="list-unstyled vstack gap-2 mb-0">
                {group.words.map((word) => {
                  const language = getLanguage(word.meaningLanguage);
                  return (
                    <li
                      key={word.id}
                      className={`d-flex flex-wrap align-items-center justify-content-between gap-2 ps-2 border-start border-2${
                        word.id === editingId ? ' border-primary' : ''
                      }`}
                    >
                      <div className="d-flex flex-wrap align-items-baseline gap-2 flex-grow-1 text-break" style={{ minWidth: 0, flexBasis: 240 }}>
                        <span className="badge text-bg-secondary font-monospace" title={language.label}>
                          {language.code.toUpperCase()}
                        </span>
                        {word.meaning ? (
                          <span lang={language.code}>
                            {word.meaning}
                          </span>
                        ) : (
                          <span className="fst-italic text-body-secondary">No meaning yet</span>
                        )}
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-3">
                        <MasteryDots word={word} showLabel />
                        <QuizPassedProgress word={word} />
                        <div className="d-flex flex-wrap align-items-center gap-1">
                          <Button
                            size="small"
                            onClick={() => onEdit(word.id)}
                            aria-label={`Edit ${word.term} (${language.label} meaning)`}
                          >
                            Edit
                          </Button>
                          <ConfirmButton
                            size="small"
                            prompt="Delete?"
                            confirmLabel="Yes"
                            onConfirm={() => onRemove(word.id)}
                            aria-label={`Delete ${word.term} (${language.label} meaning)`}
                          >
                            Delete
                          </ConfirmButton>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      {pages > 1 ? (
        <nav className="d-flex flex-wrap align-items-center justify-content-between gap-2" aria-label="Word list pages">
          <p className="small text-body-secondary mb-0">
            Showing {start + 1}–{start + shown.length} of {groups.length} words
          </p>
          <ul className="pagination pagination-sm flex-wrap mb-0">
            <li className={`page-item${page === 1 ? ' disabled' : ''}`}>
              <button type="button" className="page-link" onClick={() => setPage(page - 1)} disabled={page === 1}>
                Previous
              </button>
            </li>
            {pageItems(page, pages).map((item, index) =>
              item === '…' ? (
                <li key={`gap-${index}`} className="page-item disabled" aria-hidden="true">
                  <span className="page-link">…</span>
                </li>
              ) : (
                <li key={item} className={`page-item${item === page ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="page-link"
                    aria-current={item === page ? 'page' : undefined}
                    aria-label={`Page ${item}`}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
            <li className={`page-item${page === pages ? ' disabled' : ''}`}>
              <button type="button" className="page-link" onClick={() => setPage(page + 1)} disabled={page === pages}>
                Next
              </button>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
