import { AppNav } from "@/components/brand/app-nav";

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6">
    <AppNav variant="section" homeHref="/finance/accounts" title="Accounts" tabs={[
      { href: "/finance/accounts/receivable", label: "Receivable" },
      { href: "/finance/accounts/payable", label: "Payable" },
      { href: "/finance/accounts/activity", label: "Activity" },
    ]} />
    {children}
  </div>;
}
