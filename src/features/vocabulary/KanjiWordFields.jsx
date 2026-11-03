import { useEffect, useRef, useState } from 'react';
import { TextField } from '../../components/Fields.jsx';
import { ImeTextField } from '../../components/ImeTextField.jsx';
import { getLanguage } from '../../languages/index.js';
import { kanjiCandidates, readingCandidates } from '../../languages/japanese/kanji.js';
import { extendReadings, isKanaOnly, kanaToRomaji, toKanaReading } from '../../languages/japanese/romaji.js';

const japanese = getLanguage('ja');
const LOOKUP_DELAY_MS = 400;

/**
 * The word fields of a kanji program: Kanji, Hiragana/Katakana and Romaji.
 *
 * - Kanji (romaji input method): picking 勉強 for "benkyou" fills the kana with
 *   べんきょう; a kanji typed or pasted another way gets its reading looked up.
 *   While the kana field has a reading, the kanji field suggests spellings for it.
 * - Hiragana/Katakana (romaji turns into kana): filling it first fills an empty
 *   kanji field with the usual spelling. While the kanji field has a word, the
 *   kana field suggests its readings, in hiragana and katakana.
 * - Romaji is read from the kana and cannot be edited.
 *
 * A field is only filled automatically while it is empty or still holds what was
 * filled in automatically, so nothing the user typed or picked is replaced.
 * `readingsRef` maps a kanji spelling to the romaji typed or picked for it (shared with WordForm).
 */
export function KanjiWordFields({ kanji, kana, error, kanjiRef, autoFocus, readingsRef, onKanjiChange, onKanaChange, onComposingChange }) {
  const [kanjiComposing, setKanjiComposing] = useState(false);
  const [kanaComposing, setKanaComposing] = useState(false);
  const [readingSuggestions, setReadingSuggestions] = useState([]);
  const [kanjiSuggestions, setKanjiSuggestions] = useState([]);

  // What was last filled in automatically, and the current values and handlers for
  // async callbacks (the parent's handlers change on every render).
  const autoKanaRef = useRef('');
  const autoKanjiRef = useRef('');
  const latest = useRef({ kanji, kana, onKanjiChange, onKanaChange });
  latest.current = { kanji, kana, onKanjiChange, onKanaChange };

  useEffect(() => {
    onComposingChange(kanjiComposing || kanaComposing);
  }, [kanjiComposing, kanaComposing, onComposingChange]);

  const settledKanji = kanjiComposing ? '' : japanese.normalizeTerm(kanji).trim();
  const settledKana = kanaComposing ? '' : toKanaReading(kana);
  const romaji = kanaToRomaji(settledKana) || readingsRef.current[settledKanji] || '';

  function fillKana(next) {
    const current = latest.current.kana;
    if (current && current !== autoKanaRef.current) return; // typed or picked by the user
    autoKanaRef.current = next;
    if (next !== current) latest.current.onKanaChange(next);
  }

  // Kanji -> its reading (filled in) and the readings to suggest.
  useEffect(() => {
    if (!settledKanji) {
      setReadingSuggestions([]);
      fillKana('');
      return undefined;
    }
    const known = toKanaReading(readingsRef.current[settledKanji] ?? '');
    if (known) fillKana(known);
    else if (isKanaOnly(settledKanji)) fillKana(settledKanji);

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const readings = await readingCandidates(settledKanji, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReadingSuggestions(readings);
        if (!known && !isKanaOnly(settledKanji) && readings[0]) fillKana(readings[0]);
      } catch {
        // aborted: a newer word is being looked up
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // fillKana reads the latest values through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKanji]);

  // Kana -> kanji spellings to suggest, and the usual one for an empty kanji field.
  useEffect(() => {
    if (!settledKana) {
      setKanjiSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const spellings = await kanjiCandidates(settledKana, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setKanjiSuggestions(spellings);
        const current = latest.current.kanji;
        if (spellings[0] && (!current || current === autoKanjiRef.current)) {
          autoKanjiRef.current = spellings[0];
          readingsRef.current = { ...readingsRef.current, [spellings[0]]: kanaToRomaji(settledKana) };
          latest.current.onKanjiChange(spellings[0]);
        }
      } catch {
        // aborted: a newer reading is being looked up
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [settledKana, readingsRef]);

  return (
    <div className="row g-3">
      <ImeTextField
        className="col-md-4"
        label="Kanji"
        ref={kanjiRef}
        value={kanji}
        error={error}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="type romaji, e.g. benkyou"
        onValueChange={(next) => onKanjiChange(next.toLowerCase())}
        onComposingChange={setKanjiComposing}
        onReading={(prefix, typed, next) => {
          readingsRef.current = extendReadings(readingsRef.current, prefix, typed, next);
        }}
        suggestions={kanjiSuggestions.filter((spelling) => spelling !== kanji)}
        suggestionsLabel={`Kanji for ${settledKana}`}
        onSuggestion={(spelling) => {
          readingsRef.current = { ...readingsRef.current, [spelling]: kanaToRomaji(settledKana) };
        }}
        hint="Pick the kanji from the list, or let it fill in from the kana."
      />
      <ImeTextField
        className="col-md-4"
        label="Hiragana / Katakana"
        value={kana}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="e.g. べんきょう"
        candidateFilter={isKanaOnly}
        onValueChange={(next) => onKanaChange(next.toLowerCase())}
        onComposingChange={setKanaComposing}
        suggestions={readingSuggestions.filter((reading) => reading !== kana)}
        suggestionsLabel={settledKanji ? `Readings of ${settledKanji}` : 'Readings'}
        hint="The reading. Type romaji for hiragana, or pick katakana from the list."
      />
      <TextField
        className="col-md-4"
        label="Romaji"
        value={romaji}
        disabled
        readOnly
        placeholder="filled in from the kana"
        hint="Filled in from the reading."
      />
    </div>
  );
}
