import { useEffect, useState } from 'react';
import { getLanguage } from '../../languages/index.js';
import { JapaneseReading } from '../../components/JapaneseReading.jsx';
import { MasteryDots } from '../../components/MasteryDots.jsx';
import { lookupWordMeaning } from '../vocabulary/aiMeaning.js';
import { loadCardExamples } from './cardExamples.js';

/**
 * One flip card. The whole card is a button so it works with keyboard and touch.
 * The hidden face is aria-hidden so screen readers only read what is showing.
 * onMeaning(text) reports the meaning on the back, including one looked up online.
 * Both sides show 1-3 example sentences: in the word language on the front,
 * translated into the meaning language on the back.
 */
export function Flashcard({ word, flipped, onFlip, onMeaning, onRomaji }) {
  const [meaning, setMeaning] = useState(word.meaning ?? '');
  const [examples, setExamples] = useState({ status: 'loading', list: [] }); // loading | ready | none

  useEffect(() => {
    onMeaning?.(meaning);
  }, [meaning, onMeaning]);

  // A saved meaning is always shown as it is; the network only fills a missing one.
  useEffect(() => {
    setMeaning(word.meaning ?? '');
    if (!word.term || word.meaning) return undefined;

    let current = true;
    lookupWordMeaning(word.term, {
      sourceLanguage: word.wordLanguage ?? 'en',
      targetLanguage: word.meaningLanguage ?? 'id',
    })
      .then((value) => current && setMeaning(value))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [word.id, word.term, word.meaning, word.wordLanguage, word.meaningLanguage]);

  useEffect(() => {
    setExamples({ status: 'loading', list: [] });
    if (!word.term) return undefined;

    let current = true;
    loadCardExamples(word)
      .then((list) => current && setExamples({ status: list.length ? 'ready' : 'none', list }))
      .catch(() => current && setExamples({ status: 'none', list: [] }));
    return () => {
      current = false;
    };
    // Only the fields loadCardExamples reads; `word` changes identity on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, word.term, word.wordLanguage, word.meaningLanguage]);

  // The word is always on the front; its meaning, in the chosen meaning language, on the back.
  const front = { label: getLanguage(word.wordLanguage).label, text: word.term, lang: word.wordLanguage };
  const back = {
    label: `Meaning (${getLanguage(word.meaningLanguage).label})`,
    text: meaning || 'Loading…',
    lang: word.meaningLanguage,
  };

  return (
    <div className="fc-scene">
      <button type="button" className={`fc-card${flipped ? ' is-flipped' : ''}`} onClick={onFlip}>
        <span className="fc-face fc-front" aria-hidden={flipped}>
          <span className="fc-head">
            <span className="text-label">{front.label}</span>
            <MasteryDots word={word} />
          </span>
          <span className="fc-body">
            <span className="fc-word">
              <span className="fc-mark" lang={front.lang}>{front.text}</span>
              <JapaneseReading word={word} onRomaji={onRomaji} />
            </span>
            <CardExamples examples={examples} field="sentence" lang={word.wordLanguage} />
          </span>
          <span className="fc-foot">Click the card to reveal the answer</span>
        </span>

        <span className="fc-face fc-back" aria-hidden={!flipped}>
          <span className="fc-head">
            <span className="text-label">{back.label}</span>
          </span>
          <span className="fc-body">
            <span className="fc-word fc-word--answer" lang={back.lang}>{back.text}</span>
            <CardExamples examples={examples} field="translation" lang={word.meaningLanguage} />
          </span>
          <span className="fc-foot">Remember? Choose Mastery. Not yet? Choose Not mastered.</span>
        </span>
      </button>
    </div>
  );
}

/**
 * The example sentences on one side of the card: `field` is "sentence" (front,
 * word language) or "translation" (back, meaning language). Spans only, since
 * the whole card is a button.
 */
function CardExamples({ examples, field, lang }) {
  if (examples.status === 'loading') return <span className="small text-body-secondary">Loading examples…</span>;
  if (examples.status === 'none') return <span className="small text-body-secondary">No example sentences found.</span>;
  const lines = examples.list.map((example) => example[field]).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <span className="fc-examples">
      <span className="text-label">{lines.length === 1 ? 'Example' : 'Examples'}</span>
      {lines.map((line, index) => (
        <span key={index} className="fc-examples__line" lang={lang}>
          {line}
        </span>
      ))}
    </span>
  );
}
