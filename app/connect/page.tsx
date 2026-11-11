import { ButtonLink } from "@/components/brand/button";
import { InviteForm } from "@/components/alumni-connect/invite-form";
import { ConnectToast } from "@/components/alumni-connect/connect-toast";
import {
  getConnectPerson,
  db,
  referralWindowStart,
} from "@/lib/alumni-connect/server";
import { inviteBrothers, signOutConnect } from "./actions";
import { LoginForm, UnsubscribeForm, RejoinForm } from "./public-forms";

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
            Alumni Connect keeps your contact details current for Nu News and
            chapter updates. Already joined? Sign in with your mailing email to
            invite brothers and manage your subscription.
          </p>
        </div>
        <LoginForm />
        <p className="text-sm text-muted">
          New here? Open the personal invitation a fellow alumnus sent you.
          Joining is by invitation.
        </p>
      </div>
    );
  const { count } = await db()
    .from("connect_invitations")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", person.id)
    .gte("created_at", referralWindowStart());
  const remaining = Math.max(0, 50 - (count ?? 0));
  return (
    <div className="grid gap-8">
      {params.joined === "1" && person.subscribed && (
        <ConnectToast message={`Chapter updates will go to ${person.email}.`} />
      )}
      <header className="connect-home-heading">
        <div>
          <h1 className="page-title">Invite your brothers</h1>
          <p className="page-lede">
            Help your brothers reconnect with the chapter. We’ll email each
            person an invitation. They choose whether to join.
          </p>
        </div>
        {person.canReadNews && (
          <ButtonLink className="connect-news-link" href="/connect/news">
            Read Nu News
          </ButtonLink>
        )}
      </header>
      {person.subscribed ? (
        <section aria-label="Invite your brothers" className="grid gap-5">
          <InviteForm
            inviterName={person.fullName}
            action={inviteBrothers}
            remaining={remaining}
          />
        </section>
      ) : (
        <RejoinForm />
      )}
      <details id="your-connection" className="connect-settings">
        <summary>Subscription settings</summary>
        <div className="grid gap-4 pt-4">
          <p className="m-0 text-sm break-all">
            {person.subscribed ? "Subscribed" : "Not subscribed"} as{" "}
            {person.email}
          </p>
          <UnsubscribeForm />
          <form action={signOutConnect}>
            <button className="text-sm text-brand underline" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
