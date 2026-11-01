import { useEffect, useMemo, useReducer, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { getLanguage } from '../../languages/index.js';
import { canSpeak, speak } from '../../lib/speech.js';
import { Flashcard } from './Flashcard.jsx';
import {
  createFlashcardSession,
  flashcardSessionReducer,
  isFlashcardSessionFinished,
} from './session.js';

/**
 * Runs one pass through a deck.
 * - deck: word objects in the order to show them (a snapshot taken at the start)
 * - onResult(id, known): record progress in the vocabulary store
 * - onRestart(deckSubset): start a new pass; onExit(): back to settings
 */
export function FlashcardSession({ deck, onResult, onRestart, onExit, onRomaji }) {
  const [session, dispatch] = useReducer(flashcardSessionReducer, deck, (words) =>
    createFlashcardSession(words.map((word) => word.id)),
  );
  const byId = useMemo(() => new Map(deck.map((word) => [word.id, word])), [deck]);
  const [shownMeaning, setShownMeaning] = useState(''); // the meaning on the current card's back
  const finished = isFlashcardSessionFinished(session);
  const current = finished ? null : byId.get(session.queue[session.index]);

  useEffect(() => {
    if (!current) return undefined;

    function answer(known) {
      onResult(current.id, known);
      dispatch({ type: 'answered', known });
    }

    function onKeyDown(event) {
      const target = event.target;
      const typing = target.closest?.('input, textarea, select');
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        answer(true);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        answer(false);
      } else if ((event.key === ' ' || event.key === 'Enter') && !target.closest?.('button, a')) {
        event.preventDefault();
        dispatch({ type: 'flipped' });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, onResult]);

  if (finished) {
    const unknownWords = session.unknown.map((id) => byId.get(id));
    return (
      <section className="card card-body vstack gap-3" aria-live="polite">
        <span className="text-label">Session complete</span>
        <h2 className="h5 mb-0">
          {session.known.length} of {session.queue.length} cards remembered
        </h2>
        <p className="small text-body-secondary mb-0">
          {unknownWords.length > 0
            ? `${unknownWords.length} cards are still not mastered and will appear again more often.`
            : 'All cards in this round were remembered.'}
        </p>
        <div className="d-flex flex-wrap align-items-center gap-2">
          {unknownWords.length > 0 ? (
            <Button variant="primary" onClick={() => onRestart(unknownWords)}>
              Repeat not mastered ({unknownWords.length})
            </Button>
          ) : null}
          <Button onClick={() => onRestart(deck)}>Repeat all</Button>
          <Button variant="ghost" onClick={onExit}>
            Change settings
          </Button>
        </div>
      </section>
    );
  }

  const answer = (known) => {
    onResult(current.id, known);
    dispatch({ type: 'answered', known });
  };

  return (
    <div className="vstack gap-3">
      <div className="d-flex align-items-center gap-3 small text-body-secondary">
        <span>
          Card {session.index + 1} of {session.queue.length}
        </span>
        <ProgressBar value={session.index} max={session.queue.length} label="Session progress" />
        <span>{session.known.length} remembered</span>
      </div>

      <Flashcard
        word={current}
        flipped={session.flipped}
        onFlip={() => dispatch({ type: 'flipped' })}
        onMeaning={setShownMeaning}
        onRomaji={onRomaji}
      />

      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button onClick={() => dispatch({ type: 'flipped' })}>Flip card</Button>
        {canSpeak ? (
          <Button onClick={() => speak(current.term, getLanguage(current.wordLanguage).speech)} aria-label={`Listen to the pronunciation of ${current.term}`}>
            Listen
          </Button>
        ) : null}
        {/* Only once the card is turned over, so it does not give the answer away. */}
        {canSpeak && session.flipped && shownMeaning ? (
          <Button
            onClick={() => speak(shownMeaning, getLanguage(current.meaningLanguage).speech)}
            aria-label={`Listen to the ${getLanguage(current.meaningLanguage).label} meaning: ${shownMeaning}`}
          >
            Listen to meaning ({getLanguage(current.meaningLanguage).label})
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onExit}>
          Stop
        </Button>
      </div>

      <div className="row g-2">
        <div className="col-6">
          <Button variant="danger" className="btn-lg w-100" onClick={() => answer(false)}>
            Not mastered
          </Button>
        </div>
        <div className="col-6">
          <Button variant="primary" className="btn-lg w-100" onClick={() => answer(true)}>
            Mastered
          </Button>
        </div>
      </div>

      <p className="small text-body-secondary d-flex flex-wrap align-items-center gap-1 mb-0">
        <kbd>Space</kbd> flip · <kbd>←</kbd> not mastered · <kbd>→</kbd> mastered
      </p>
    </div>
  );
}
