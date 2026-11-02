import { useId } from 'react';
import { useRememberedToggle } from '../hooks/useRememberedToggle.js';

/**
 * A card whose header is the show/hide toggle. The open state is remembered
 * on this device under `storageKey`. Hidden content stays mounted, so typed text is kept.
 */
export function CollapsibleCard({ title, storageKey, defaultOpen = true, className, children }) {
  const [open, toggle] = useRememberedToggle(storageKey, defaultOpen);
  const id = useId();

  return (
    <section className={['card', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-title`}>
      <h2 className="h5 mb-0">
        <button
          id={`${id}-title`}
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
        >
          <span>{title}</span>
          <span className="collapsible-toggle__state">
            {open ? 'Hide' : 'Show'}
            <span className="collapsible-toggle__chevron" aria-hidden="true" />
          </span>
        </button>
      </h2>
      <div id={id} className="card-body pt-0 vstack gap-3" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
