import { loadInvitation } from "@/lib/alumni-connect/server";
import { AcceptanceForm, LoginForm } from "../../public-forms";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await loadInvitation(token);
  if (!invitation || invitation.status !== "pending")
    return (
      <div className="grid gap-4">
        <h1 className="page-title">Invitation unavailable</h1>
        <p>
          This invitation has already been used, declined, or withdrawn. If you
          joined, you can sign in to Connect with your mailing email.
        </p>
        {invitation?.status === "accepted" ? (
          <LoginForm />
        ) : (
          <a href="https://cal.taxi" className="text-brand underline">
            Visit the chapter website
          </a>
        )}
      </div>
    );
  return (
    <div className="grid gap-8">
      <header>
        <h1 className="page-title">Reconnect with your chapter</h1>
        <p className="page-lede">
          {invitation.include_name && invitation.inviter_name
            ? `${invitation.inviter_name}, a fellow alumnus,`
            : "A fellow alumnus"}{" "}
          invited you to stay connected with the Nu Chapter of Theta Xi.
        </p>
      </header>
      <AcceptanceForm
        invitation={token}
        email={invitation.email}
        defaults={invitation.defaults}
      />
      <details className="text-sm">
        <summary className="cursor-pointer text-brand">
          Why did I receive this? / This isn’t me
        </summary>
        <p>
          A fellow alumnus supplied this email to help the chapter reconnect.
          You are not subscribed until you accept. If the invitation was a
          mistake, select No thanks; this address will not receive another
          invitation.
        </p>
      </details>
    </div>
  );
}
