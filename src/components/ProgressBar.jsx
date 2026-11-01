/** Thin Bootstrap progress bar. */
export function ProgressBar({ value, max, label }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      className="progress flex-grow-1"
      style={{ height: 6 }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}
