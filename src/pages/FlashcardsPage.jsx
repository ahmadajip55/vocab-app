import { useCallback, useState } from 'react';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { useVocabulary } from '../hooks/useVocabulary.js';
import { useProgramPath } from '../hooks/useProgramPath.js';
import { buildDeck } from '../features/flashcards/deck.js';
import { fillMissingMeanings } from '../features/vocabulary/fillMeanings.js';
import { FlashcardSession } from '../features/flashcards/FlashcardSession.jsx';
import { FlashcardSetup } from '../features/flashcards/FlashcardSetup.jsx';
import '../features/flashcards/flashcards.css';

export default function FlashcardsPage() {
  const { words, recordResult, updateWord } = useVocabulary();
  // Romaji looked up for a Japanese word during a session is saved like the word list does.
  const saveRomaji = useCallback((id, romaji) => updateWord(id, { romaji }), [updateWord]);
  const saveMeaning = useCallback((id, meaning) => updateWord(id, { meaning }), [updateWord]);

  // Missing meanings are filled in for the whole deck at once, then saved.
  async function start(settings) {
    setRun({ id: Date.now(), deck: await fillMissingMeanings(buildDeck(words, settings), saveMeaning) });
  }
  const programPath = useProgramPath();
  const [run, setRun] = useState(null); // { id, deck }

  if (words.length === 0) {
    return (
      <>
        <PageHeader title="Study cards" />
        <EmptyState
          title="No words to study yet"
          actions={
            <>
              <ButtonLink variant="primary" to={programPath('import')}>
                Import from Excel
              </ButtonLink>
              <ButtonLink to={programPath('words')}>Add a word</ButtonLink>
            </>
          }
        >
          Add some words first, then come back here.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Study cards">
        Flip the card and mark whether you already know it. Mastered words rise in level, while others return to the start.
      </PageHeader>
      {run ? (
        <FlashcardSession
          key={run.id}
          deck={run.deck}
          onResult={recordResult}
          onRomaji={saveRomaji}
          onRestart={(deck) => setRun((current) => ({ ...current, id: Date.now(), deck }))}
          onExit={() => setRun(null)}
        />
      ) : (
        <FlashcardSetup words={words} onStart={start} />
      )}
    </>
  );
}
