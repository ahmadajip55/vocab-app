export function PageHeader({ title, children, actions }) {
  return (
    <header className="d-flex flex-wrap align-items-end justify-content-between gap-3">
      <div className="vstack gap-1" style={{ maxWidth: '62ch' }}>
        <h1 className="h2 mb-0">{title}</h1>
        {children ? <p className="text-body-secondary mb-0">{children}</p> : null}
      </div>
      {actions ? <div className="d-flex flex-wrap align-items-center gap-2">{actions}</div> : null}
    </header>
  );
}
