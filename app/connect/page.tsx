import Link from "next/link";
import { InviteForm } from "@/components/alumni-connect/invite-form";
import { getConnectPerson } from "@/lib/alumni-connect/server";
import { inviteBrothers, signOutConnect } from "./actions";
import { LoginForm, UnsubscribeForm } from "./public-forms";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const [person, params] = await Promise.all([
    getConnectPerson(),
    searchParams,
  ]);
  if (!person)
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="page-title">Stay connected with your brothers</h1>
          <p className="page-lede">
            Already joined? Sign in with your mailing email to invite brothers
            and manage your subscription.
          </p>
        </div>
        <LoginForm />
        <p className="text-sm text-muted">
          New here? Open the personal invitation a fellow alumnus sent you.
          Joining is by invitation.
        </p>
      </div>
    );
  return (
    <div className="grid gap-8">
      {params.joined === "1" && (
        <p role="status" className="border border-rule p-4">
          You’re subscribed. Welcome back, {person.fullName}.
        </p>
      )}
      <header>
        <h1 className="page-title">Invite your brothers</h1>
        <p className="page-lede">
          Help your brothers reconnect with the chapter. We’ll email each person
          an invitation. They choose whether to join.
        </p>
      </header>
      <InviteForm inviterName={person.fullName} action={inviteBrothers} />
      <section className="border-t border-rule pt-6 grid gap-4">
        <h2 className="card-title">Your connection</h2>
        <p className="m-0 break-all">Subscribed as {person.email}</p>
        {person.canReadNews && (
          <Link className="text-brand underline" href="/connect/news">
            Read Nu News
          </Link>
        )}
        <details>
          <summary className="cursor-pointer text-sm">
            Manage subscription
          </summary>
          <UnsubscribeForm />
        </details>
        <form action={signOutConnect}>
          <button className="text-sm text-brand underline" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
