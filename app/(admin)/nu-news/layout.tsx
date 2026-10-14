import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/access-denied";
import { AppNav } from "@/components/brand/app-nav";
import { nuNewsIsSetUp } from "@/lib/nu-news/store";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const metadata = { title: { default: "Nu News", template: "%s · Nu News" } };

export default async function NuNewsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/");
  }

  if (session.profile.role !== "admin") {
    return (
      <div data-brand className="min-h-screen">
        <AccessDenied showSubmitLink={session.profile.role === "member"} />
      </div>
    );
  }

  return (
    <div data-brand className="min-h-screen">
      <AppNav homeHref="/nu-news" title="Theta Xi" subtitle="Nu News" />
      <main className="max-w-[1080px] mx-auto px-6 py-8">
        {await nuNewsIsSetUp() ? children : (
          <section className="card">
            <div className="card-header">
              <h1 className="card-title">Setup needed</h1>
            </div>
            <p className="card-body m-0 border-t border-rule pt-5 text-[13.5px] leading-relaxed">
              Nu News needs a one-time database setup. Ask the Supabase admin to run the Nu News migration.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
