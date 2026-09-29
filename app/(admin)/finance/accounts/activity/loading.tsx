export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading transactions" className="grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter finances</p>
        <h1 className="page-title">Other transactions</h1>
        <p className="page-lede">Use this page for money that is not already recorded through dues or reimbursements.</p>
      </div>
      <section aria-hidden="true" className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <span className="loading-block block h-24 w-full" key={index} />)}
      </section>
      <section aria-hidden="true" className="card p-6">
        <span className="loading-block block h-5 w-48" />
        {Array.from({ length: 4 }, (_, index) => <span className="loading-block mt-4 block h-10 w-full" key={index} />)}
      </section>
    </div>
  );
}
