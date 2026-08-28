import Link from "next/link";

type AppHeaderProps = {
  email: string;
  isAdmin?: boolean;
  name: string;
};

export function AppHeader({ email, isAdmin = false, name }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link className="brand" href="/reimbursements/dashboard">
        <span className="brand-mark">R</span>
        <span>Chapter Reimbursements</span>
      </Link>
      <div className="app-header-actions">
        {isAdmin && (
          <Link className="button button-secondary" href="/reimbursements/admin">
            Admin
          </Link>
        )}
        <details className="account-menu">
          <summary className="account-menu-trigger">
            <span>{name || "Account"}</span>
            <svg aria-hidden="true" viewBox="0 0 12 8">
              <path d="m1 1.5 5 5 5-5" />
            </svg>
          </summary>
          <div className="account-menu-dropdown">
            <p className="account-menu-email">{email}</p>
            <form action="/reimbursements/auth/signout" method="post">
              <button className="account-menu-signout" type="submit">Sign out</button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
