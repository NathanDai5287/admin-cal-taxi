export default function ReimbursementsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading reimbursements">
      <div aria-hidden="true" className="grid gap-2 mb-6">
        <span className="loading-block h-[11px] w-[180px]" />
        <span className="loading-block h-[30px] w-[min(360px,75%)]" />
        <span className="loading-block h-[16px] w-[min(520px,90%)]" />
      </div>
      <section aria-hidden="true" className="card">
        <div className="card-header">
          <span className="loading-block h-[12px] w-[140px]" />
        </div>
        <div className="card-body grid gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              className="loading-block h-[40px]"
              key={index}
              style={{ width: index % 2 ? "88%" : "100%" }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
