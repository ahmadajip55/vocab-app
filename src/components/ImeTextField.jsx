import { useEffect, useId, useMemo, useState } from 'react';
import {
  applyCandidate,
  commitRomaji,
  createCandidateService,
  getComposition,
  previewKana,
} from '../languages/japanese/ime.js';
import '../styles/ime.css';

const SOURCE_LABELS = {
  google: 'Google Input Tools',
  local: 'Offline dictionary',
};

/**
 * Text field with a romaji -> kana/kanji input method (like a desktop IME).
 *
 * Type romaji ("nihon") and a candidate list appears: 日本, にほん, 二本, ニホン...
 *   Space / Down / Up   move through the candidates
 *   Enter or 1-9        choose one (Enter without a list submits the form as usual)
 *   Esc                 close the list
 * Leftover romaji turns into hiragana when the field loses focus.
 *
 * Controlled: pass `value` and `onValueChange(newValue)`.
 * `onComposingChange(boolean)` tells the parent while a word is still being typed.
 * `onReading(prefix, romaji, nextText)` reports the romaji typed for the part
 * that was just converted, so the parent can keep the reading of kanji.
 * `candidateFilter(candidate)` keeps only some candidates (e.g. kana only).
 * `suggestions` (with `suggestionsLabel`) is a list offered while the field has
 * focus and nothing is being typed; ↑↓ then Enter, or a click, puts one in the
 * field and calls `onSuggestion(suggestion)`.
 */
export function ImeTextField({
  label,
  hint,
  error,
  value,
  onValueChange,
  onComposingChange,
  onReading,
  ref,
  onKeyDown,
  onBlur,
  onFocus,
  service,
  candidateFilter,
  suggestions = [],
  suggestionsLabel = 'Suggestions',
  onSuggestion,
  className,
  ...inputProps
}) {
  const id = useId();
  const defaultService = useMemo(() => createCandidateService(), []);
  const candidateService = service ?? defaultService;

  const composition = getComposition(value);
  const romaji = composition ? composition.romaji.toLowerCase() : '';

  const [remote, setRemote] = useState({ romaji: '', candidates: [], source: 'local' });
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1); // -1: none picked, so Enter still submits
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestionsKey = suggestions.join('|');

  // Candidates for the word being typed: instant offline ones, then the online ones.
  useEffect(() => {
    setIndex(0);
    if (!romaji) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await candidateService.get(romaji, controller.signal);
        if (!controller.signal.aborted) setRemote({ romaji, ...result });
      } catch {
        // aborted or unreachable: the offline candidates stay
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [romaji, candidateService]);

  useEffect(() => {
    onComposingChange?.(Boolean(romaji));
  }, [romaji, onComposingChange]);

  // New suggestions are offered again, with none picked yet.
  useEffect(() => {
    setSuggestionIndex(-1);
    setSuggestionsDismissed(false);
  }, [suggestionsKey]);

  const offline = useMemo(() => (romaji ? candidateService.local(romaji) : []), [romaji, candidateService]);
  const online = remote.romaji === romaji ? remote : null;
  const allCandidates = online ? online.candidates : offline;
  const candidates = candidateFilter ? allCandidates.filter(candidateFilter) : allCandidates;
  const source = online ? online.source : 'local';
  const open = Boolean(romaji) && dismissed !== romaji;
  const listOpen = open && candidates.length > 0;
  const listId = `${id}-list`;
  const suggesting = !romaji && focused && !suggestionsDismissed && suggestions.length > 0;

  function choose(candidate) {
    if (!composition || !candidate) return;
    const next = applyCandidate(value, composition, candidate);
    onReading?.(value.slice(0, composition.start), composition.romaji, next);
    onValueChange(next);
    setDismissed('');
  }

  function suggest(suggestion) {
    onValueChange(suggestion);
    onSuggestion?.(suggestion);
    setSuggestionsDismissed(true);
  }

  function handleSuggestionKey(event) {
    const count = suggestions.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestionIndex((current) => (current + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestionIndex((current) => (current <= 0 ? count - 1 : current - 1));
    } else if (event.key === 'Enter' && suggestionIndex >= 0) {
      event.preventDefault();
      suggest(suggestions[suggestionIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestionsDismissed(true);
    }
  }

  function handleKeyDown(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (suggesting) {
      handleSuggestionKey(event);
      return;
    }
    if (!listOpen) return;

    const count = candidates.length;
    if (event.key === 'ArrowDown' || event.key === ' ') {
      event.preventDefault();
      setIndex((current) => (current + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((current) => (current - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(candidates[index]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(romaji);
    } else if (/^[1-9]$/.test(event.key) && Number(event.key) <= count) {
      event.preventDefault();
      choose(candidates[Number(event.key) - 1]);
    }
  }

  function handleBlur(event) {
    onBlur?.(event);
    setFocused(false);
    const committed = commitRomaji(value);
    if (committed === value) return;
    if (composition) onReading?.(value.slice(0, composition.start), composition.romaji, committed);
    onValueChange(committed);
  }

  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="form-label fw-semibold small mb-1">
        {label}
      </label>
      <div className="ime-box">
        <input
          {...inputProps}
          className={`form-control${error ? ' is-invalid' : ''}`}
          id={id}
          ref={ref}
          value={value}
          onChange={(event) => {
            setDismissed('');
            onValueChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={(event) => {
            onFocus?.(event);
            setFocused(true);
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen || suggesting}
          aria-controls={listOpen || suggesting ? listId : undefined}
          aria-activedescendant={
            listOpen ? `${id}-opt-${index}` : suggesting && suggestionIndex >= 0 ? `${id}-opt-${suggestionIndex}` : undefined
          }
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        {open ? (
          <div className="ime" onMouseDown={(event) => event.preventDefault()}>
            <div className="ime__head">
              <span className="ime__kana" lang="ja">{previewKana(romaji)}</span>
              <span>{SOURCE_LABELS[source]}</span>
            </div>
            {candidates.length > 0 ? (
              <ul className="ime__list" id={listId} role="listbox" lang="ja">
                {candidates.map((candidate, position) => (
                  <li
                    key={candidate}
                    id={`${id}-opt-${position}`}
                    role="option"
                    aria-selected={position === index}
                    className="ime__item"
                    onClick={() => choose(candidate)}
                  >
                    <span className="ime__num">{position + 1}</span>
                    <span>{candidate}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : suggesting ? (
          <div className="ime" onMouseDown={(event) => event.preventDefault()}>
            <div className="ime__head">
              <span>{suggestionsLabel}</span>
            </div>
            <ul className="ime__list" id={listId} role="listbox" lang="ja">
              {suggestions.map((suggestion, position) => (
                <li
                  key={suggestion}
                  id={`${id}-opt-${position}`}
                  role="option"
                  aria-selected={position === suggestionIndex}
                  className="ime__item"
                  onClick={() => suggest(suggestion)}
                >
                  <span className="ime__num">{position + 1}</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {hint ? (
        <div className="form-text" id={`${id}-hint`}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="invalid-feedback d-block fw-semibold" id={`${id}-error`} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
