import { useCallback, useState } from 'react';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { useVocabulary } from '../hooks/useVocabulary.js';
import { useProgramPath } from '../hooks/useProgramPath.js';
import { generateQuiz } from '../features/quiz/generateQuiz.js';
import { QuizSession } from '../features/quiz/QuizSession.jsx';
import { QuizSetup } from '../features/quiz/QuizSetup.jsx';
import { fillMissingMeanings } from '../features/vocabulary/fillMeanings.js';

export default function QuizPage() {
  const { words, recordResult, updateWord } = useVocabulary();
  // Romaji looked up for a Japanese word during a session is saved like the word list does.
  const saveRomaji = useCallback((id, romaji) => updateWord(id, { romaji }), [updateWord]);
  const saveMeaning = useCallback((id, meaning) => updateWord(id, { meaning }), [updateWord]);
  const programPath = useProgramPath();
  const [run, setRun] = useState(null); // { id, settings, questions }
  // Quiz answers also count towards the Passed flag.
  const recordQuizResult = useCallback((id, correct) => recordResult(id, correct, 'quiz'), [recordResult]);

  if (words.length === 0) {
    return (
      <>
        <PageHeader title="Quiz" />
        <EmptyState
          title="No words to quiz yet"
          actions={
            <>
              <ButtonLink variant="primary" to={programPath('import')}>
                Import from Excel
              </ButtonLink>
              <ButtonLink to={programPath('words')}>Add words</ButtonLink>
            </>
          }
        >
          The quiz is built from your vocabulary list. Add a few words first.
        </EmptyState>
      </>
    );
  }

  async function start(settings) {
    // Only the chosen meaning language is quizzed, so only those meanings are filled in.
    const resolved = await fillMissingMeanings(
      words.filter((word) => word.meaningLanguage === settings.meaningLanguage),
      saveMeaning,
    );
    setRun({
      id: Date.now(),
      settings,
      questions: generateQuiz(resolved, { ...settings, distractorPool: resolved }),
    });
  }

  async function retryMissed(wordIds) {
    const missed = new Set(wordIds);
    const subset = words.filter((word) => missed.has(word.id));
    const resolved = await fillMissingMeanings(subset, saveMeaning);
    setRun((current) => ({
      id: Date.now(),
      settings: current.settings,
      questions: generateQuiz(resolved, {
        ...current.settings,
        count: 'all',
        distractorPool: words,
      }),
    }));
  }

  return (
    <>
      <PageHeader title="Quiz">Test recall with multiple-choice or typed answers.</PageHeader>
      {run ? (
        <QuizSession
          key={run.id}
          questions={run.questions}
          onResult={recordQuizResult}
          onRomaji={saveRomaji}
          onRetryMissed={retryMissed}
          onNewQuiz={() => setRun(null)}
        />
      ) : (
        <QuizSetup words={words} onStart={start} />
      )}
    </>
  );
}
