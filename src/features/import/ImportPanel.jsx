import { useMemo, useState } from 'react';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { CollapsibleCard } from '../../components/CollapsibleCard.jsx';
import { SelectField, TextField } from '../../components/Fields.jsx';
import { getLanguage } from '../../languages/index.js';
import { downloadFile } from '../../lib/download.js';
import { XLSX_MIME } from '../../lib/xlsx.js';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { useProgramPath } from '../../hooks/useProgramPath.js';
import { ImportPreview } from './ImportPreview.jsx';
import { meaningLanguageOptions } from '../vocabulary/model.js';
import { isKanjiProgram, programLanguageLabel } from '../vocabulary/programs.js';
import { IMPORT_LIMITS, parsePastedText, rowsToWords } from './parseVocabularyRows.js';
import { planImport } from './planImport.js';
import { prepareImport } from './prepareImport.js';
import { ACCEPTED_EXTENSIONS, readFileRows } from './readFileRows.js';
import { buildTemplateXlsx } from './spreadsheetFiles.js';

/**
 * Bulk import of "word, meaning" rows. The meaning language is chosen first
 * and applies to every imported word. Two ways in, one pipeline:
 *   Excel/CSV columns or pasted "word, meaning" lines -> rows -> rowsToWords
 *   -> prepareImport (readings, blank meanings) -> planImport -> preview -> add
 * Blank meanings are looked up while checking, so the preview shows what will be saved.
 * A kanji program reads "kanji, kana, meaning" instead; a missing kanji or kana is
 * looked up too (see prepareImport.js).
 */
export function ImportPanel() {
  const { program, words, addWords } = useVocabulary();
  const kanji = isKanjiProgram(program);
  const [meaningLanguage, setMeaningLanguage] = useState('');
  const programPath = useProgramPath();
  const [pasted, setPasted] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | reading | translating | ready | done
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [progress, setProgress] = useState(''); // what is happening while reading or translating
  const [untranslatedCount, setUntranslatedCount] = useState(0);

  /** Parse the rows, then fill blank meanings of the words that will be added. */
  async function showRows(rows, source, limits) {
    const language = meaningLanguage;
    setStatus('translating');
    const result = await prepareImport(rowsToWords(rows, { ...limits, kanji }), {
      program,
      existing: words,
      meaningLanguage: language,
      onProgress: setProgress,
    });
    setProgress('');
    if (result.fatal) {
      setDraft(null);
      setStatus('idle');
      setError(result.fatal);
      return;
    }
    setError('');
    setDraft({ source, meaningLanguage: language, ...result });
    setStatus('ready');
  }

  // Duplicates are re-checked as the word list changes; meanings belong to the draft's language.
  const plan = useMemo(
    () => (draft ? planImport(draft.parsed.words, words, draft.meaningLanguage) : null),
    [draft, words],
  );
  const languageChosen = Boolean(meaningLanguage);
  const busy = status === 'reading' || status === 'translating';

  function changeMeaningLanguage(value) {
    setMeaningLanguage(value);
    if (draft) {
      // Looked-up meanings are in the old language, so the text has to be checked again.
      setDraft(null);
      setStatus('idle');
      setError('');
      setProgress('Meaning language changed. Check the text or choose the file again.');
    }
  }
  const meaningOptions = meaningLanguageOptions(program.wordLanguage);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('reading');
    setProgress('Reading file…');
    setError('');
    setDraft(null);
    try {
      await showRows(await readFileRows(file), file.name);
    } catch (readError) {
      setStatus('idle');
      setProgress('');
      setError(readError.message);
    } finally {
      setFileInputKey((key) => key + 1); // lets the same file be chosen again
    }
  }

  async function handlePaste(event) {
    event.preventDefault();
    if (!pasted.trim()) {
      setError('Paste text first.');
      return;
    }
    setDraft(null);
    await showRows(parsePastedText(pasted, { kanji }), 'pasted text', {
      maxRows: IMPORT_LIMITS.maxPastedRows,
      source: 'Teks ini',
    });
  }

  function handleConfirm() {
    const created = addWords(
      plan.toAdd.map(({ term, meaning, romaji, kana }) => ({
        term,
        meaning,
        romaji,
        kana,
        meaningLanguage: draft.meaningLanguage,
      })),
    );
    setAddedCount(created.length);
    setUntranslatedCount(plan.toAdd.filter((word) => !word.meaning).length);
    setDraft(null);
    setPasted('');
    setStatus('done');
  }

  function reset() {
    setDraft(null);
    setError('');
    setProgress('');
    setStatus('idle');
  }

  return (
    <div className="vstack gap-4">
      {status === 'done' ? (
        <section className="alert alert-success mb-0" role="status">
          <h2 className="h5 mb-0">{addedCount} words added</h2>
          {untranslatedCount > 0 ? (
            <p className="small text-body-secondary mb-0">
              {untranslatedCount} words were added without a meaning because no translation was found. Use "Search
              meaning" when editing them.
            </p>
          ) : null}
          <div className="d-flex flex-wrap align-items-center gap-2">
            <ButtonLink variant="primary" to={programPath('flashcards')}>
              Study with flashcards
            </ButtonLink>
            <ButtonLink to={programPath('quiz')}>Try the quiz</ButtonLink>
            <ButtonLink to={programPath('words')}>View word list</ButtonLink>
            <Button variant="ghost" onClick={reset}>
              Import again
            </Button>
          </div>
        </section>
      ) : null}

      <section className="card card-body vstack gap-3" aria-labelledby="meaning-language-title">
        <h2 id="meaning-language-title" className="h5 mb-0">1. Choose the meaning language</h2>
        <SelectField
          label="Meaning language"
          value={meaningLanguage}
          onChange={(event) => changeMeaningLanguage(event.target.value)}
          disabled={busy}
          hint={`The language of the meanings in your file. Every imported word gets it; ${programLanguageLabel(program)} is the word language of this program.`}
        >
          <option value="" disabled>
            Choose a language…
          </option>
          {meaningOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </section>

      {!languageChosen ? <p className="small text-body-secondary mb-0">Choose the meaning language first to upload a file or paste text.</p> : null}

      <div className="row g-4 align-items-start">
        <div className="col-md-6">
          <CollapsibleCard title="2. Upload a file" storageKey="vocab-app:import-upload-open">
            {kanji ? (
              <p className="small text-body-secondary mb-0">
                Excel (.xlsx) or CSV with the columns <strong>Kanji</strong>, <strong>Kana</strong> (hiragana or katakana)
                and <strong>Meaning</strong>. Without a header row, the columns are read in that order. A missing kanji,
                kana or meaning is looked up online when the file is read; romaji comes from the kana.
              </p>
            ) : (
              <p className="small text-body-secondary mb-0">
                Excel (.xlsx) or CSV with one column per field: <strong>Word</strong> and <strong>Meaning</strong>. Without
                a header row, column A is the word and column B its meaning. Empty meanings are looked up online when the
                file is read.
              </p>
            )}
            <div>
              <label htmlFor="import-file" className="form-label fw-semibold small mb-1">
                Choose file
              </label>
              <input
                key={fileInputKey}
                id="import-file"
                className="form-control"
                type="file"
                accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                onChange={handleFile}
                disabled={busy || !languageChosen}
              />
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <Button size="small" onClick={() => downloadFile('vocabulary-template.xlsx', buildTemplateXlsx({ kanji }), XLSX_MIME)}>
                Download Excel template
              </Button>
            </div>
          </CollapsibleCard>
        </div>

        <div className="col-md-6">
          <CollapsibleCard title="2. Or paste text" storageKey="vocab-app:import-paste-open">
            <form className="vstack gap-3" onSubmit={handlePaste} aria-label="Paste text">
              <TextField
                as="textarea"
                label="Text"
                rows={6}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                hint={
                  kanji
                    ? `One word per line: kanji, kana, meaning. Commas after the second one stay in the meaning. Leave out the kana or the meaning ("日本, , Japan" or "日本, にほん") to have it looked up when you check. Up to ${IMPORT_LIMITS.maxPastedRows} words.`
                    : `One word per line: the word, a comma, then its meaning. Commas after the first one stay in the meaning. Leave the meaning out to have it translated when you check. Up to ${IMPORT_LIMITS.maxPastedRows} words.`
                }
                placeholder={kanji ? '勉強, べんきょう, study\n先生, せんせい\nコーヒー, , coffee\n, みず, water' : 'persuade, membujuk\nthrive, tumbuh subur, berkembang\ndeadline'}
                spellCheck={false}
                disabled={!languageChosen || busy}
              />
              <div className="d-flex flex-wrap align-items-center gap-2">
                <Button type="submit" disabled={!languageChosen || busy}>
                  {status === 'translating' ? 'Checking…' : 'Check text'}
                </Button>
              </div>
            </form>
          </CollapsibleCard>
        </div>
      </div>

      {progress ? (
        <p className="small text-body-secondary mb-0" role="status">
          {progress}
        </p>
      ) : null}

      {error ? (
        <p className="alert alert-danger fw-semibold mb-0" role="alert">
          {error}
        </p>
      ) : null}

      {draft && plan ? (
        <section className="card card-body vstack gap-3" aria-labelledby="preview-title">
          <h2 id="preview-title" className="h5 mb-0">Preview from {draft.source}</h2>
          <ImportPreview draft={{ ...draft, plan }} meaningLanguage={draft.meaningLanguage} />
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Button variant="primary" onClick={handleConfirm} disabled={plan.toAdd.length === 0}>
              Add {plan.toAdd.length} words with {getLanguage(draft.meaningLanguage).label} meanings
            </Button>
            <Button onClick={reset}>Cancel</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
