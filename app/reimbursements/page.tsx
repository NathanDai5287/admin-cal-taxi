import Link from "next/link";

import { ReimbursementBrand } from "@/components/reimbursements/reimbursement-brand";
import { ThemeToggle } from "@/components/reimbursements/theme-toggle";
import { hasSupabaseConfig } from "@/lib/reimbursements/supabase/config";
import { createClient } from "@/lib/reimbursements/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = hasSupabaseConfig();
  let signedIn = false;

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  const accountHref = signedIn ? "/reimbursements/dashboard" : "/reimbursements/login";

  return (
    <main className="landing-shell">
      <nav className="site-nav">
        <ReimbursementBrand href="/reimbursements" />
        <div className="site-nav-actions">
          <ThemeToggle />
          <Link className="button button-secondary" href={accountHref}>
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">Fraternity finance</p>
        <h1>Receipts in. Reimbursements handled.</h1>
        <p className="hero-copy">
          Submit chapter expenses, keep the receipt attached, and follow every
          reimbursement from review to approval.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href={accountHref}>
            {signedIn ? "Open dashboard" : "Submit an expense"}
          </Link>
          <span className="helper-text">Access is limited to invited members.</span>
        </div>
      </section>

      {!configured && (
        <aside className="setup-notice">
          <strong>Local setup is ready.</strong>
          <span>
            Add Supabase credentials to <code>.env.local</code> to enable
            sign-in and submissions.
          </span>
        </aside>
      )}

      <section className="feature-grid" aria-label="How reimbursements work">
        <article>
          <span className="step-number">01</span>
          <h2>Submit once</h2>
          <p>Add the expense details and upload a photo of the receipt.</p>
        </article>
        <article>
          <span className="step-number">02</span>
          <h2>Automatic check</h2>
          <p>The receipt total is extracted and compared with your request.</p>
        </article>
        <article>
          <span className="step-number">03</span>
          <h2>Clear status</h2>
          <p>See whether an expense is pending, approved, or needs attention.</p>
        </article>
      </section>
    </main>
  );
}
