import { useCallback, useMemo, useState } from 'react';
import { Button, ButtonLink } from '../components/Button.jsx';
import { CollapsibleCard } from '../components/CollapsibleCard.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { TextField } from '../components/Fields.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { useVocabulary } from '../hooks/useVocabulary.js';
import { useProgramPath } from '../hooks/useProgramPath.js';
import { buildWordsXlsx } from '../features/import/spreadsheetFiles.js';
import { findByTerm, groupByTerm } from '../features/vocabulary/model.js';
import { isKanjiProgram } from '../features/vocabulary/programs.js';
import { WordForm } from '../features/vocabulary/WordForm.jsx';
import { SampleWordsForm } from '../features/vocabulary/SampleWordsForm.jsx';
import { WordList } from '../features/vocabulary/WordList.jsx';
import { downloadFile } from '../lib/download.js';
import { romajiForWord } from '../languages/japanese/romaji.js';
import { normalizeText } from '../lib/text.js';
import { XLSX_MIME } from '../lib/xlsx.js';

export default function WordsPage() {
  const { program, words, addWord, updateWord, removeWord, resetProgress, clearAll } = useVocabulary();
  const programPath = useProgramPath();
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  const editing = words.find((word) => word.id === editingId) ?? null;

  const visibleWords = useMemo(() => {
    const needle = normalizeText(query);
    return words.filter(
      (word) => !needle || normalizeText(`${word.term} ${word.kana ?? ''} ${romajiForWord(word)} ${word.meaning}`).includes(needle),
    );
  }, [words, query]);

  // One row per term; entries with other meaning languages are shown inside it.
  const allGroups = useMemo(() => groupByTerm(words), [words]);
  const visibleGroups = useMemo(() => groupByTerm(visibleWords), [visibleWords]);

  const saveRomaji = useCallback(
    (ids, romaji) => {
      for (const id of ids) updateWord(id, { romaji });
    },
    [updateWord],
  );

  function handleAdd(values) {
    addWord(values);
    setNotice(`"${values.term.trim()}" added.`);
  }

  function handleUpdate(values) {
    updateWord(editing.id, values);
    setEditingId(null);
    setNotice(`"${values.term.trim()}" updated.`);
  }

  function handleRemove(id) {
    const word = words.find((item) => item.id === id);
    removeWord(id);
    if (id === editingId) setEditingId(null);
    setNotice(word ? `"${word.term}" deleted.` : '');
  }

  return (
    <>
      <PageHeader
        title="Word list"
        actions={<ButtonLink to={programPath('import')}>Import from Excel</ButtonLink>}
      >
        Add words one by one here. For many words at once, use import.
      </PageHeader>

      {editing ? (
        <section aria-label="Edit word">
          <WordForm
            key={editing.id}
            initialValues={editing}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditingId(null)}
            wordSuggestions={words}
            wordLanguage={program.wordLanguage}
            kanjiMode={isKanjiProgram(program)}
            findDuplicate={(term, meaningLanguage) => findByTerm(words, term, editing.id, meaningLanguage)}
          />
        </section>
      ) : (
        <CollapsibleCard title="Add word" storageKey="vocab-app:add-word-open">
          <WordForm
            key="new"
            className="vstack gap-3"
            submitLabel="Add word"
            onSubmit={handleAdd}
            wordSuggestions={words}
            wordLanguage={program.wordLanguage}
            kanjiMode={isKanjiProgram(program)}
            findDuplicate={(term, meaningLanguage) => findByTerm(words, term, undefined, meaningLanguage)}
          />
        </CollapsibleCard>
      )}

      <p className="small fw-semibold text-success mb-0" role="status" style={{ minHeight: '1.5em' }}>
        {notice}
      </p>

      <SampleWordsForm />

      {words.length === 0 ? (
        <EmptyState title="List is empty">Words you add or load as samples will appear here.</EmptyState>
      ) : (
        <section className="vstack gap-3" aria-labelledby="list-title">
          <div className="d-flex flex-wrap align-items-end justify-content-between gap-3">
            <h2 id="list-title" className="h4 mb-0">
              {visibleGroups.length === allGroups.length
                ? `${allGroups.length} words`
                : `${visibleGroups.length} of ${allGroups.length} words`}
            </h2>
            <div style={{ width: 'min(100%, 280px)' }}>
              <TextField
                label="Search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={program.wordLanguage === 'ja' ? 'word, kana, romaji, or meaning' : 'word or meaning'}
              />
            </div>
          </div>

          {visibleWords.length > 0 ? (
            <WordList
              key={query}
              groups={visibleGroups}
              editingId={editingId}
              onEdit={setEditingId}
              onRemove={handleRemove}
              onRomaji={saveRomaji}
            />
          ) : (
            <p className="small text-body-secondary mb-0">No words match this search.</p>
          )}

          <div className="d-flex flex-wrap align-items-center gap-2 pt-2">
            <Button onClick={() => downloadFile(`${exportFileName(program.name)}.xlsx`, buildWordsXlsx(words, { kanji: isKanjiProgram(program) }), XLSX_MIME)}>
              Export to Excel
            </Button>
            <ConfirmButton
              prompt="All progress resets to zero."
              confirmLabel="Yes, reset"
              onConfirm={() => {
                resetProgress();
                setNotice('Learning progress reset.');
              }}
            >
              Reset progress
            </ConfirmButton>
            <ConfirmButton
              prompt={`Delete all ${words.length} words?`}
              confirmLabel="Yes, delete all"
              onConfirm={() => {
                clearAll();
                setEditingId(null);
                setNotice('All words deleted.');
              }}
            >
              Delete all
            </ConfirmButton>
          </div>
        </section>
      )}
    </>
  );
}

/** "JLPT N5" -> "JLPT-N5"; falls back to "vocabulary" for names with no safe characters. */
function exportFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'vocabulary';
}
