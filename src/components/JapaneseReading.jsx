import { useEffect, useState } from 'react';
import { fetchRomaji, japaneseReading, needsRomajiLookup } from '../languages/japanese/romaji.js';

/**
 * The kana reading and romaji under a Japanese word: 右 -> "みぎ · migi",
 * コーヒー -> "koohii". Renders nothing for other languages.
 * A word with kanji and no saved reading is looked up once, and onRomaji(id, romaji)
 * saves the result. Spans only, so it can sit inside a button (the flashcard).
 */
export function JapaneseReading({ word, onRomaji }) {
  const [found, setFound] = useState({ id: null, romaji: '' });
  const romaji = word.romaji || (found.id === word.id ? found.romaji : '');

  useEffect(() => {
    if (!needsRomajiLookup(word)) return undefined;
    let current = true;
    fetchRomaji(word.term)
      .then((value) => {
        if (!current || !value) return;
        setFound({ id: word.id, romaji: value });
        onRomaji?.(word.id, value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
    // Only the fields that decide the lookup; `word` is a new object after every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, word.term, word.wordLanguage, word.romaji]);

  const reading = japaneseReading({ ...word, romaji });
  if (!reading || (!reading.kana && !reading.romaji)) return null;
  return (
    <span className="jp-reading">
      {reading.kana ? <span lang="ja">{reading.kana}</span> : null}
      {reading.kana && reading.romaji ? <span aria-hidden="true"> · </span> : null}
      {reading.romaji ? <span lang="ja-Latn">{reading.romaji}</span> : null}
    </span>
  );
}
