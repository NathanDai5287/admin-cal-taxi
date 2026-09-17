import { AppNav } from "@/components/brand/app-nav";
import { requirePolicyMember } from "@/lib/policy/server";

export default async function PolicyLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePolicyMember();
  return <div data-brand className="min-h-screen"><AppNav homeHref="/policy" title="Theta Xi" subtitle="Policy" tabs={[{ href: "/policy", label: "Ask a question" }, { href: "/policy/history", label: "Question history" }, ...(session.profile.role === "admin" ? [{ href: "/policy/library", label: "Policy library" }] : [])]} /><main className="mx-auto max-w-[1080px] px-6 py-8">{children}</main></div>;
}
