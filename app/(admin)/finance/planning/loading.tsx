export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading planning" className="grid gap-7">
      <div>
        <p className="page-eyebrow">Chapter finances</p>
        <h1 className="page-title">Plan vs actual</h1>
        <p className="page-lede">See the term plan, current results, and the source behind every value.</p>
      </div>
      <section aria-hidden="true" className="grid grid-cols-2 border-y border-rule md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="border-r border-rule bg-surface p-5 last:border-r-0" key={index}>
            <span className="loading-block block h-3 w-24" />
            <span className="loading-block mt-3 block h-8 w-28" />
          </div>
        ))}
      </section>
      <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section className="border-t-[3px] border-brand bg-surface p-5" key={index}>
            <span className="loading-block block h-4 w-36" />
            {Array.from({ length: 4 }, (_, row) => <span className="loading-block mt-5 block h-9 w-full" key={row} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
