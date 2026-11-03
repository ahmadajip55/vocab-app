import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { CharPalette } from '../../components/CharPalette.jsx';
import { SelectField, TextField } from '../../components/Fields.jsx';
import { ImeTextField } from '../../components/ImeTextField.jsx';
import { getLanguage } from '../../languages/index.js';
import { extendReadings } from '../../languages/japanese/romaji.js';
import { toTitleCase } from '../../lib/text.js';
import { lookupWordMeaning } from './aiMeaning.js';
import { KanjiWordFields } from './KanjiWordFields.jsx';
import {
  LIMITS,
  defaultMeaningLanguage,
  duplicateWordMessage,
  getWordSuggestions,
  meaningLanguageOptions,
  toWordValues,
  validateWordInput,
} from './model.js';

const EMPTY = { term: '', meaning: '', kana: '' };

const TERM_PLACEHOLDERS = {
  ja: 'type romaji, e.g. nihongo',
  es: 'e.g. mañana',
  de: 'e.g. Straße',
  fr: 'e.g. être',
  pl: 'e.g. książka',
};

/**
 * Add or edit a single word.
 * - findDuplicate(term, meaningLanguage) returns an existing word with the same term and meaning language, if any.
 * - onSubmit(values) is called with valid values.
 * - Pass onCancel when editing; the form then keeps its values after saving.
 *
 * - wordLanguage is the program's word language; every word in it uses that language.
 * - kanjiMode (a Japanese kanji program) asks for the kanji, its kana reading and romaji (see KanjiWordFields).
 * - className replaces the form's own card styling, e.g. when it sits inside another card.
 *
 * Everything that depends on the word language (input method, keyboard hints,
 * special characters) comes from src/languages/<code>.js.
 */
export function WordForm({
  initialValues = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
  findDuplicate,
  wordSuggestions = [],
  wordLanguage,
  kanjiMode = false,
  className = 'card card-body vstack gap-3',
}) {
  // A new word starts with the meaning language most of the program's words use.
  const [values, setValues] = useState(() => ({
    meaningLanguage: defaultMeaningLanguage(wordSuggestions, wordLanguage),
    ...EMPTY,
    ...initialValues,
    wordLanguage,
  }));
  const [errors, setErrors] = useState({});
  // Japanese only: text in the word field -> the romaji typed for it, so kanji keep their reading.
  const readingsRef = useRef(initialValues.romaji ? { [initialValues.term]: initialValues.romaji } : {});
  const [aiStatus, setAiStatus] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [composing, setComposing] = useState(false);

  const language = getLanguage(wordLanguage);
  const meaningOptions = meaningLanguageOptions(wordLanguage);
  const suggestionsId = useId();
  const suggestions = useMemo(
    () => (language.ime ? [] : getWordSuggestions(wordSuggestions, values.term, wordLanguage)),
    [language.ime, values.term, wordLanguage, wordSuggestions],
  );

  const termRef = useRef(null);
  const meaningRef = useRef(null);
  // True once the user types a meaning; then a new word does not replace it.
  // Saved and auto-filled meanings follow the word and the meaning language.
  const manualMeaningRef = useRef(false);
  const lookupIdRef = useRef(0); // only the newest lookup may fill the field

  /** A typed meaning stays when only the word changes; any other meaning is cleared for a new lookup. */
  function resetAutoFill({ keepManual = false } = {}) {
    if (keepManual && manualMeaningRef.current) return;
    manualMeaningRef.current = false;
    lookupIdRef.current += 1; // a lookup still running is now out of date
    setAiLoading(false);
    setValues((current) => (current.meaning ? { ...current, meaning: '' } : current));
  }

  function setTerm(term) {
    setValues((current) => ({ ...current, term }));
    setErrors((current) => (current.term ? { ...current, term: undefined } : current));
    setAiStatus('');
    resetAutoFill({ keepManual: true });
  }

  function setKana(kana) {
    setValues((current) => ({ ...current, kana }));
  }

  const change = (field) => (event) => {
    const value = toTitleKeepingCaret(event.target, field);

    if (field === 'term') {
      setTerm(value);
      return;
    }

    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setAiStatus('');

    // A meaning in the old language is no use, so it is always looked up again.
    if (field === 'meaningLanguage') resetAutoFill();
    if (field === 'meaning') {
      // Clearing the field hands it back to the translator.
      manualMeaningRef.current = value.trim() !== '';
      lookupIdRef.current += 1;
      setAiLoading(false);
    }
  };

  function insertChar(char) {
    const input = termRef.current;
    const start = input?.selectionStart ?? values.term.length;
    const end = input?.selectionEnd ?? start;
    setTerm(values.term.slice(0, start) + char + values.term.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + char.length, start + char.length);
    });
  }

  /** Puts a looked-up meaning into the field. */
  const showMeaning = useCallback((meaning) => {
    setValues((current) => ({ ...current, meaning }));
    setErrors((current) => ({ ...current, meaning: undefined }));
    setAiStatus('Meaning filled automatically (free translator, no API key).');
  }, []);

  /** The word as it will be saved, but only once the user is done typing it. */
  const settledTerm = language.ime && composing ? '' : language.normalizeTerm(values.term).trim();
  const languagePair = `${wordLanguage}>${values.meaningLanguage}`;

  // Fill the meaning as the word is typed and when the meaning language changes.
  // `values.meaning` is not a dependency on purpose: the field is cleared when a
  // new lookup is due (see resetAutoFill), and typing a meaning must not restart it.
  const meaningIsEmpty = !values.meaning.trim();
  useEffect(() => {
    if (!settledTerm || !meaningIsEmpty || manualMeaningRef.current) return undefined;

    const id = (lookupIdRef.current += 1);
    const isCurrent = () => lookupIdRef.current === id && !manualMeaningRef.current;
    const timer = setTimeout(async () => {
      setAiLoading(true);
      setAiStatus(`Translating into ${getLanguage(values.meaningLanguage).label}…`);
      try {
        const meaning = await lookupWordMeaning(settledTerm, { sourceLanguage: wordLanguage, targetLanguage: values.meaningLanguage });
        if (isCurrent()) showMeaning(meaning);
      } catch (error) {
        if (isCurrent()) setAiStatus(error.message || 'Failed to translate this word.');
      } finally {
        if (lookupIdRef.current === id) setAiLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [settledTerm, languagePair, meaningIsEmpty, wordLanguage, values.meaningLanguage, showMeaning]);

  function requireTerm() {
    if (settledTerm) return true;
    setErrors((current) => ({ ...current, term: 'Enter a word first.' }));
    termRef.current?.focus();
    return false;
  }

  async function handleMeaningLookup() {
    if (!requireTerm()) return;
    lookupIdRef.current += 1; // the button's answer wins over an automatic one still running
    setAiLoading(true);
    setAiStatus('');
    try {
      const meaning = await lookupWordMeaning(settledTerm, { sourceLanguage: wordLanguage, targetLanguage: values.meaningLanguage });
      manualMeaningRef.current = false;
      showMeaning(meaning);
    } catch (error) {
      setAiStatus(error.message || 'Failed to translate this word.');
    } finally {
      setAiLoading(false);
      meaningRef.current?.focus();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const normalizedValues = toWordValues(values, readingsRef.current);
    const nextErrors = validateWordInput(normalizedValues);
    if (nextErrors.meaning && aiLoading) nextErrors.meaning = 'The meaning is still being looked up. Wait a moment, then try again.';
    const duplicate = nextErrors.term ? null : findDuplicate?.(normalizedValues.term, normalizedValues.meaningLanguage);
    if (duplicate) nextErrors.term = duplicateWordMessage(duplicate, normalizedValues.meaningLanguage);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      (nextErrors.term ? termRef : meaningRef).current?.focus();
      return;
    }
    onSubmit(normalizedValues);
    if (!onCancel) {
      resetAutoFill();
      readingsRef.current = {};
      setValues({ ...EMPTY, wordLanguage, meaningLanguage: values.meaningLanguage });
      setErrors({});
      setAiStatus('');
      termRef.current?.focus();
    }
  }

  const termProps = {
    label: 'Word',
    value: values.term,
    error: errors.term,
    maxLength: LIMITS.term + 20,
    autoComplete: 'off',
    autoFocus: Boolean(onCancel),
    ref: termRef,
    placeholder: TERM_PLACEHOLDERS[language.code] ?? 'e.g. persuade',
    ...language.inputProps,
    // Words are kept in Title Case; romaji for Japanese is typed in lower case.
    autoCapitalize: language.ime ? 'none' : 'words',
  };

  return (
    <form className={className} onSubmit={handleSubmit} noValidate>
      <div className="row g-3">
        <TextField
          className="col-md-6"
          label="Word language"
          value={kanjiMode ? `${language.label} (Kanji)` : language.label}
          readOnly
          hint="Set by the program."
        />
        <SelectField className="col-md-6" label="Meaning language" value={values.meaningLanguage} onChange={change('meaningLanguage')}>
          {meaningOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <div className="col-12">
          {kanjiMode ? (
            <KanjiWordFields
              kanji={values.term}
              kana={values.kana}
              error={errors.term}
              kanjiRef={termRef}
              autoFocus={Boolean(onCancel)}
              readingsRef={readingsRef}
              onKanjiChange={setTerm}
              onKanaChange={setKana}
              onComposingChange={setComposing}
            />
          ) : language.ime ? (
            <ImeTextField
              key="ime"
              {...termProps}
              onValueChange={(next) => setTerm(next.toLowerCase())}
              onComposingChange={setComposing}
              onReading={(prefix, romaji, next) => {
                readingsRef.current = extendReadings(readingsRef.current, prefix, romaji, next);
              }}
              hint="Type romaji (e.g. nihon) and pick 日本 from the list. Space or ↑↓ to move, Enter or 1-9 to choose."
            />
          ) : (
            <TextField
              key="plain"
              {...termProps}
              onChange={change('term')}
              list={suggestions.length ? suggestionsId : undefined}
            />
          )}
          {suggestions.length ? (
            <datalist id={suggestionsId}>
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          ) : null}
          {kanjiMode ? null : <CharPalette chars={language.chars} onInsert={insertChar} label={`${language.label} characters`} />}
        </div>

        <div className="col-12">
          <TextField
            label="Meaning"
            ref={meaningRef}
            autoCapitalize="words"
            value={values.meaning}
            onChange={change('meaning')}
            error={errors.meaning}
            hint="Required. Type it, or wait for it to be filled in automatically with a free translator."
            autoComplete="off"
            placeholder="e.g. persuade, convince"
          />
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <Button type="button" variant="ghost" size="small" onClick={handleMeaningLookup} disabled={aiLoading || !values.term.trim()}>
              {aiLoading ? 'Working…' : 'Search meaning'}
            </Button>
          </div>
        </div>

        {aiStatus ? (
          <p className="col-12 small text-body-secondary mb-0" aria-live="polite">
            {aiStatus}
          </p>
        ) : null}
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button variant="primary" type="submit">
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/**
 * The word and its meaning are typed in Title Case ("Terima Kasih").
 * Converting in place moves the caret to the end, so its position is put back
 * after React re-renders.
 */
function toTitleKeepingCaret(input, field) {
  const { value } = input;
  if (field !== 'term' && field !== 'meaning') return value;
  const titled = toTitleCase(value);
  if (titled !== value && typeof input.selectionStart === 'number') {
    const { selectionStart, selectionEnd } = input;
    requestAnimationFrame(() => input.setSelectionRange?.(selectionStart, selectionEnd));
  }
  return titled;
}
