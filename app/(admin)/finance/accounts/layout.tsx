import { AppNav } from "@/components/brand/app-nav";

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6">
    <AppNav variant="section" homeHref="/finance/accounts" title="Accounts" tabs={[
      { href: "/finance/accounts", label: "Overview" },
      { href: "/finance/accounts/receivable", label: "Dues to collect" },
      { href: "/finance/accounts/payable", label: "Reimbursements to pay" },
      { href: "/finance/accounts/activity", label: "Other transactions" },
    ]} />
    {children}
  </div>;
}
