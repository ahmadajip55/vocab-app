import { useState } from 'react';
import { Button } from './Button.jsx';

/**
 * A destructive action that asks "are you sure?" inline instead of using
 * window.confirm. First click shows Yes/Cancel; Yes runs onConfirm.
 */
export function ConfirmButton({ children, prompt = 'Are you sure?', confirmLabel = 'Yes, delete', onConfirm, size, ...props }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button variant="danger" size={size} onClick={() => setAsking(true)} {...props}>
        {children}
      </Button>
    );
  }
  return (
    <span className="d-inline-flex flex-wrap align-items-center gap-2" role="group" aria-label="Confirmation">
      <span className="small fw-semibold text-danger">{prompt}</span>
      <Button
        variant="danger-solid"
        size="small"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button size="small" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}
