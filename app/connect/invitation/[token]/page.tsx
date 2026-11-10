import { loadInvitation } from "@/lib/alumni-connect/server";
import { AcceptanceForm } from "../../public-forms";
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
        <a href="/connect" className="text-brand underline">
          Open Connect
        </a>
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
    </div>
  );
}
