type PageLoadingSkeletonProps = {
  variant: "admin" | "dashboard";
};

function LoadingHeader() {
  return (
    <header aria-hidden="true" className="app-header loading-header">
      <span className="loading-block loading-brand" />
      <span className="loading-block loading-tabs" />
      <span className="loading-block loading-account" />
    </header>
  );
}

function LoadingPanel({ rows = 4 }: { rows?: number }) {
  return (
    <section aria-hidden="true" className="panel loading-panel">
      <div className="panel-header"><span className="loading-block loading-panel-title" /></div>
      <div className="loading-panel-body">
        {Array.from({ length: rows }, (_, index) => (
          <span className="loading-block loading-row" key={index} />
        ))}
      </div>
    </section>
  );
}

export function PageLoadingSkeleton({ variant }: PageLoadingSkeletonProps) {
  const admin = variant === "admin";

  return (
    <main
      aria-busy="true"
      aria-label={admin ? "Loading administration" : "Loading dashboard"}
      className="app-shell loading-page"
    >
      <LoadingHeader />
      <div className="app-content">
        <div aria-hidden="true" className="loading-heading">
          <span className="loading-block loading-eyebrow" />
          <span className="loading-block loading-title" />
          <span className="loading-block loading-description" />
        </div>

        {admin ? (
          <>
            <div className="admin-invite-grid loading-section">
              <LoadingPanel rows={3} />
              <LoadingPanel rows={3} />
            </div>
            <div className="loading-section"><LoadingPanel rows={5} /></div>
          </>
        ) : (
          <div className="dashboard-grid loading-section">
            <LoadingPanel rows={5} />
            <LoadingPanel rows={4} />
          </div>
        )}
      </div>
    </main>
  );
}
