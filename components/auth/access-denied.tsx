type AccessDeniedProps = {
  title?: string;
  message?: string;
  showSubmitLink?: boolean;
};

export function AccessDenied({
  title = "No access",
  message = "Your account doesn't have access to this area. Ask an administrator to invite you.",
  showSubmitLink = false,
}: AccessDeniedProps) {
  return (
    <div className="max-w-[520px] mx-auto px-6 py-16">
      <section className="card">
        <div className="card-header">
          <span className="card-title">{title}</span>
        </div>
        <div className="card-body border-t border-rule pt-5">
          <p className="text-[13.5px] text-muted m-0 leading-relaxed">{message}</p>
          {showSubmitLink ? (
            <a
              className="back-link mt-5 inline-block"
              href="https://reimbursements.cal.taxi"
            >
              Go to the reimbursement form →
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
