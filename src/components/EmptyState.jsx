export function EmptyState({ title, children, actions }) {
  return (
    <section className="vstack gap-3 align-items-start p-4 border border-2 border-dashed rounded-3">
      <h2 className="h5 mb-0">{title}</h2>
      {children ? <p className="text-body-secondary mb-0">{children}</p> : null}
      {actions ? <div className="d-flex flex-wrap align-items-center gap-2">{actions}</div> : null}
    </section>
  );
}
