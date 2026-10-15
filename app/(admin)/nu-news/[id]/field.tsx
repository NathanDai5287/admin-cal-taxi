export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={title.toLowerCase().replaceAll(" ", "-")} className="card nu-news-section">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-body grid gap-4 border-t border-rule pt-5">{children}</div>
    </section>
  );
}
