"use client";

import { siteOrigins } from "@/components/auth/site-origins";

type AccessDeniedProps = {
  title?: string;
  message?: string;
  showSubmitLink?: boolean;
};

// Client component so the submit-site link points at the right origin in
// local development (reimbursements.localhost) as well as production.
export function SubmitSiteLink({ className }: { className?: string }) {
  return (
    <a className={className ?? "back-link"} href={siteOrigins().submitOrigin}>
      Go to the reimbursement form →
    </a>
  );
}

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
            <SubmitSiteLink className="back-link mt-5 inline-block" />
          ) : null}
        </div>
      </section>
    </div>
  );
}
