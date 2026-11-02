/**
 * Loading indicator: three small vocabulary cards dealt one after another.
 * Pure CSS (src/styles/app.css). index.html shows the same markup while the
 * app's JavaScript loads, so keep the two alike.
 */
export function AppLoader({ label = 'Loading your cards…' }) {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <div className="app-loader__cards" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className="app-loader__label">{label}</span>
    </div>
  );
}
