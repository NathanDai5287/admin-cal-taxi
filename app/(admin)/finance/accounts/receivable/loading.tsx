export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dues" className="grid gap-7">
      <div>
        <p className="page-eyebrow">Chapter finances</p>
        <h1 className="page-title">Dues to collect</h1>
        <p className="page-lede">See what members owe, record payments, and add new dues when needed.</p>
      </div>
      <section aria-hidden="true" className="dues-summary">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index}><span className="loading-block block h-3 w-28" /><span className="loading-block mt-3 block h-8 w-32" /></div>
        ))}
      </section>
      <section aria-hidden="true" className="card p-6">
        <span className="loading-block block h-5 w-40" />
        {Array.from({ length: 5 }, (_, index) => <span className="loading-block mt-4 block h-10 w-full" key={index} />)}
      </section>
    </div>
  );
}
