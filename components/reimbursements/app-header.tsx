import Link from "next/link";

export function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
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
        <form action="/reimbursements/auth/signout" method="post">
          <button className="button button-secondary" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
