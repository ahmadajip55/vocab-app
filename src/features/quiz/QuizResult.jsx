import { Button } from '../../components/Button.jsx';

function verdict(percent) {
  if (percent === 100) return 'Perfect';
  if (percent >= 80) return 'Excellent';
  if (percent >= 50) return 'Good work, keep practicing';
  return 'More practice needed';
}

export function QuizResult({ summary, onRetryMissed, onNewQuiz }) {
  const { total, correct, close, wrong, score, percent, missed } = summary;

  return (
    <section className="card card-body vstack gap-3" aria-live="polite">
      <span className="text-label">Quiz results</span>
      <h2 className="display-6 d-flex flex-wrap align-items-baseline gap-3 mb-0">
        {score} of {total} correct <span className="fs-5 font-monospace text-body-secondary">{percent}%</span>
      </h2>
      <p className="small text-body-secondary mb-0">{verdict(percent)}</p>

      <ul className="list-unstyled d-flex flex-wrap gap-2 mb-0" aria-label="Breakdown">
        <li className="border border-success text-success rounded px-3 py-2 bg-body">
          <strong>{correct}</strong> correct
        </li>
        {close > 0 ? (
          <li className="border rounded px-3 py-2 bg-body">
            <strong>{close}</strong> almost correct
          </li>
        ) : null}
        <li className={`border rounded px-3 py-2 bg-body${wrong ? ' border-danger text-danger' : ''}`}>
          <strong>{wrong}</strong> wrong
        </li>
      </ul>

      {missed.length > 0 ? (
        <div className="vstack gap-3">
          <h3 className="h5 mb-0">Needs review</h3>
          <ul className="list-group">
            {missed.map((item) => (
              <li key={item.wordId} className="list-group-item d-flex flex-wrap align-items-baseline column-gap-3 row-gap-1">
                <span className="fw-bold text-break">{item.prompt}</span>
                <span className="text-success text-break">{item.answer}</span>
                {item.given ? <span className="w-100 small text-body-secondary">Your answer: {item.given}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="d-flex flex-wrap align-items-center gap-2">
        {missed.length > 0 ? (
          <Button variant="primary" onClick={() => onRetryMissed(missed.map((item) => item.wordId))}>
            Retry missed ({missed.length})
          </Button>
        ) : null}
        <Button variant={missed.length > 0 ? 'default' : 'primary'} onClick={onNewQuiz}>
          New quiz
        </Button>
      </div>
    </section>
  );
}
