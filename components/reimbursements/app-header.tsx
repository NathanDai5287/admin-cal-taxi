import { ReimbursementBrand } from "@/components/reimbursements/reimbursement-brand";
import { ReimbursementTabs } from "@/components/reimbursements/reimbursement-tabs";
import { ThemeToggle } from "@/components/reimbursements/theme-toggle";

type AppHeaderProps = {
  email: string;
  isAdmin?: boolean;
  name: string;
};

export function AppHeader({ email, isAdmin = false, name }: AppHeaderProps) {
  return (
    <header className="app-header">
      <ReimbursementBrand href="/reimbursements/dashboard" />
      <ReimbursementTabs isAdmin={isAdmin} />
      <div className="app-header-actions">
        <ThemeToggle />
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
