/**
 * Quiz session state: one question at a time. After answering, the session waits
 * (awaitingNext) so the learner can read the feedback before moving on.
 * Pure and framework-free so it can be unit tested.
 */
export function createQuizSession(questions) {
  return { questions, index: 0, answers: [], awaitingNext: false };
}

export function isQuizFinished(state) {
  return state.index >= state.questions.length;
}

export function quizSessionReducer(state, action) {
  if (isQuizFinished(state)) return state;

  switch (action.type) {
    case 'answered': {
      if (state.awaitingNext) return state;
      const question = state.questions[state.index];
      return {
        ...state,
        awaitingNext: true,
        answers: [...state.answers, { questionId: question.id, given: action.given, result: action.result }],
      };
    }
    case 'next':
      if (!state.awaitingNext) return state;
      return { ...state, index: state.index + 1, awaitingNext: false };
    default:
      return state;
  }
}

/** Score summary. A 'close' answer (one typo) counts toward the score. */
export function summarizeQuiz(state) {
  const total = state.questions.length;
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  let correct = 0;
  let close = 0;
  const missed = [];

  for (const answer of state.answers) {
    if (answer.result === 'correct') correct++;
    else if (answer.result === 'close') close++;
    else {
      const question = byId.get(answer.questionId);
      missed.push({
        wordId: answer.questionId,
        prompt: question.prompt,
        answer: question.answer,
        given: answer.given,
      });
    }
  }

  const score = correct + close;
  return {
    total,
    correct,
    close,
    wrong: missed.length,
    score,
    percent: total === 0 ? 0 : Math.round((score / total) * 100),
    missed,
  };
}
