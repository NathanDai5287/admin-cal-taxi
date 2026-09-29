export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading reimbursements" className="payable-page grid gap-6">
      <div>
        <p className="page-eyebrow">Chapter finances</p>
        <h1 className="page-title">Reimbursements to pay</h1>
        <p className="page-lede">Review requests, approve or deny them, and record approved payouts here.</p>
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
