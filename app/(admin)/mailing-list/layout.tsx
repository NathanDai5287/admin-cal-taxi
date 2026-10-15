import { AppNav } from "@/components/brand/app-nav";
import { requireAdmin } from "@/lib/reimbursements/auth";

export const metadata = { title: "Mailing List" };

export default async function MailingListLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/");
  return <div data-brand className="min-h-screen">
    <AppNav homeHref="/mailing-list" title="Theta Xi" subtitle="Mailing List" />
    <main className="mx-auto max-w-[1080px] px-6 py-8">{children}</main>
  </div>;
}
