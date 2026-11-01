import { useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { ImeTextField } from '../../components/ImeTextField.jsx';
import { JapaneseReading } from '../../components/JapaneseReading.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { getLanguage } from '../../languages/index.js';
import { checkTypedAnswer } from './checkAnswer.js';
import { createQuizSession, isQuizFinished, quizSessionReducer, summarizeQuiz } from './quizSession.js';
import { QuizResult } from './QuizResult.jsx';

const DIRECTION_LABELS = {
  'term-to-meaning': (meaningLabel) => `What does this word mean in ${meaningLabel}?`,
  'meaning-to-term': () => 'What is the word?',
};

const FEEDBACK = {
  correct: 'Correct!',
  close: 'Almost right, check the spelling.',
  wrong: 'Not quite.',
};

/**
 * Runs one quiz.
 * - questions: from generateQuiz
 * - onResult(wordId, correct): record progress in the vocabulary store
 */
export function QuizSession({ questions, onResult, onRetryMissed, onNewQuiz, onRomaji }) {
  const [session, dispatch] = useReducer(quizSessionReducer, questions, createQuizSession);
  const [typed, setTyped] = useState('');
  const [pickedId, setPickedId] = useState(null);
  const inputRef = useRef(null);
  const nextRef = useRef(null);

  const finished = isQuizFinished(session);
  const question = finished ? null : session.questions[session.index];
  const feedback = session.awaitingNext ? session.answers[session.answers.length - 1] : null;

  useEffect(() => {
    if (!question) return;
    if (session.awaitingNext) nextRef.current?.focus();
    else if (question.type === 'typing') inputRef.current?.focus();
  }, [question, session.awaitingNext]);

  useEffect(() => {
    if (!question || question.type !== 'choice' || session.awaitingNext) return undefined;

    function pickAnswer(option) {
      setPickedId(option.id);
      const result = option.correct ? 'correct' : 'wrong';
      onResult(question.wordId, option.correct);
      dispatch({ type: 'answered', given: option.text, result });
    }

    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const option = question.options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        pickAnswer(option);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [question, session.awaitingNext, onResult]);

  if (finished) {
    return (
      <QuizResult summary={summarizeQuiz(session)} onRetryMissed={onRetryMissed} onNewQuiz={onNewQuiz} />
    );
  }

  function chooseOption(option) {
    if (session.awaitingNext) return;
    setPickedId(option.id);
    onResult(question.wordId, option.correct);
    dispatch({ type: 'answered', given: option.text, result: option.correct ? 'correct' : 'wrong' });
  }

  function submitTyped(event) {
    event.preventDefault();
    if (session.awaitingNext) return;
    const given = answersTerm ? answerLanguage.normalizeTerm(typed).trim() : typed.trim();
    const result = checkTypedAnswer(given, question.accepted);
    onResult(question.wordId, result !== 'wrong');
    dispatch({ type: 'answered', given, result });
  }

  function goNext() {
    setTyped('');
    setPickedId(null);
    dispatch({ type: 'next' });
  }

  const answerLanguage = getLanguage(question.termLanguage);
  const answersTerm = question.direction === 'meaning-to-term';
  const useIme = answersTerm && answerLanguage.ime;
  const isLast = session.index === session.questions.length - 1;

  return (
    <div className="vstack gap-3">
      <div className="d-flex align-items-center gap-3 small text-body-secondary">
        <span>
          Question {session.index + 1} of {session.questions.length}
        </span>
        <ProgressBar value={session.index} max={session.questions.length} label="Quiz progress" />
        <span>{session.answers.filter((a) => a.result !== 'wrong').length} correct</span>
      </div>

      <section className="card card-body vstack gap-3" aria-labelledby="quiz-prompt">
        <span className="text-label">{DIRECTION_LABELS[question.direction](getLanguage(question.meaningLanguage).label)}</span>
        <p id="quiz-prompt" className="quiz-prompt font-display fw-bold mb-0" lang={answersTerm ? question.meaningLanguage : answerLanguage.code}>
          {question.prompt}
          {/* Under the word only when the word is the question; otherwise it would give the answer away. */}
          {!answersTerm ? <JapaneseReading word={question.word} onRomaji={onRomaji} /> : null}
        </p>

        {question.type === 'choice' ? (
          <ul className="row row-cols-1 row-cols-md-2 g-2 list-unstyled mb-0">
            {question.options.map((option, index) => {
              // After answering: the right option turns green, a wrong pick red.
              let state = 'btn-outline-secondary';
              if (feedback) {
                if (option.correct) state = 'btn-success opacity-100';
                else if (option.id === pickedId) state = 'btn-danger opacity-100';
              }
              return (
                <li key={option.id} className="col">
                  <button
                    type="button"
                    className={`btn ${state} w-100 h-100 d-flex align-items-start gap-3 py-3 text-start text-break`}
                    onClick={() => chooseOption(option)}
                    disabled={session.awaitingNext}
                  >
                    <kbd aria-hidden="true">{index + 1}</kbd>
                    <span>{option.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <form className="d-flex flex-wrap align-items-start gap-2" onSubmit={submitTyped}>
            {useIme ? null : (
              <label htmlFor="quiz-answer" className="visually-hidden">
                Your answer
              </label>
            )}
            {useIme ? (
              <ImeTextField
                className="flex-grow-1"
                label="Your answer"
                ref={inputRef}
                value={typed}
                onValueChange={setTyped}
                disabled={session.awaitingNext}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Type romaji, pick the word from the list"
              />
            ) : (
              <input
                id="quiz-answer"
                className="form-control form-control-lg flex-grow-1"
                style={{ flexBasis: 240, width: 'auto' }}
                ref={inputRef}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                disabled={session.awaitingNext}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Type your answer and press Enter"
              />
            )}
            <Button variant="primary" type="submit" disabled={session.awaitingNext || typed.trim() === ''}>
              Check
            </Button>
          </form>
        )}

        {feedback ? (
          <div
            className={`alert alert-${feedback.result === 'wrong' ? 'danger' : 'success'} vstack gap-2 align-items-start mb-0`}
            role="status"
          >
            <p className="fw-bold mb-0">{FEEDBACK[feedback.result]}</p>
            {feedback.result !== 'correct' ? (
              <p className="mb-0">
                Correct answer: <strong>{question.answer}</strong>
              </p>
            ) : null}
            {answersTerm ? (
              <p className="mb-0">
                <strong lang="ja">{question.word.term}</strong>
                <JapaneseReading word={question.word} onRomaji={onRomaji} />
              </p>
            ) : null}
            <Button variant="primary" ref={nextRef} onClick={goNext}>
              {isLast ? 'See results' : 'Next question'}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
