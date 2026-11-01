import { useId } from 'react';

function describedBy(id, hint, error) {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function Hint({ id, hint }) {
  return hint ? (
    <div className="form-text" id={`${id}-hint`}>
      {hint}
    </div>
  ) : null;
}

function Error({ id, error }) {
  return error ? (
    <div className="invalid-feedback d-block fw-semibold" id={`${id}-error`} role="alert">
      {error}
    </div>
  ) : null;
}

/**
 * Labelled Bootstrap text input (or textarea with as="textarea"). `ref` is passed through.
 * `className` goes on the wrapper, e.g. a grid column ("col-md-6") inside a `row`.
 */
export function TextField({ label, hint, error, as: Control = 'input', className, ...props }) {
  const id = useId();
  const controlClass = ['form-control', Control === 'textarea' && 'font-monospace small', error && 'is-invalid']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label fw-semibold small mb-1">
        {label}
      </label>
      <Control
        id={id}
        className={controlClass}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <Hint id={id} hint={hint} />
      <Error id={id} error={error} />
    </div>
  );
}

export function SelectField({ label, hint, children, className, ...props }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label fw-semibold small mb-1">
        {label}
      </label>
      <select id={id} className="form-select" aria-describedby={describedBy(id, hint)} {...props}>
        {children}
      </select>
      <Hint id={id} hint={hint} />
    </div>
  );
}

export function CheckboxField({ label, className, ...props }) {
  const id = useId();
  return (
    <div className={['form-check', className].filter(Boolean).join(' ')}>
      <input id={id} type="checkbox" className="form-check-input" {...props} />
      <label className="form-check-label" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}
