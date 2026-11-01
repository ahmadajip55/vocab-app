import { STATUS_COLORS } from '../../components/MasteryDots.jsx';
import { summarizeWords } from '../vocabulary/model.js';

const SEGMENTS = [
  { key: 'mastered', label: 'Mastered' },
  { key: 'learning', label: 'In progress' },
  { key: 'weak', label: 'Not mastered' },
  { key: 'new', label: 'New' },
];

/** Bootstrap stacked progress bar with a legend for one word list. */
export function ProgramProgress({ words, summary = summarizeWords(words) }) {
  return (
    <div className="vstack gap-2">
      <div
        className="progress-stacked"
        style={{ height: 12 }}
        role="img"
        aria-label={SEGMENTS.map((s) => `${s.label}: ${summary[s.key]}`).join(', ')}
      >
        {SEGMENTS.map((segment) =>
          summary[segment.key] > 0 ? (
            <div key={segment.key} className="progress" style={{ width: `${(summary[segment.key] / summary.total) * 100}%` }}>
              <div className={`progress-bar bg-${STATUS_COLORS[segment.key]}`} />
            </div>
          ) : null,
        )}
      </div>
      <ul className="list-inline small text-body-secondary mb-0">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="list-inline-item d-inline-flex align-items-center gap-2 me-3">
            <i className={`legend-swatch d-inline-block rounded-1 bg-${STATUS_COLORS[segment.key]}`} />
            {segment.label} <strong className="text-body">{summary[segment.key]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
