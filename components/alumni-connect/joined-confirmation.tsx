import Link from "next/link";

export function JoinedConfirmation({ email }: { email: string }) {
  return (
    <section
      className="connect-outcome"
      data-tone="success"
      aria-labelledby="connect-joined-title"
    >
      <div role="status">
        <h2 id="connect-joined-title">You’re on the mailing list</h2>
        <p>
          Nu News, chapter updates, and alumni event invitations will go to{" "}
          <strong className="break-all">{email}</strong>.
        </p>
      </div>
      <p>Help another brother reconnect. You can now invite alumni you know.</p>
      <Link href="/connect?joined=1" className="brand-button btn-primary">
        Invite your brothers
      </Link>
      <Link
        href="/connect#your-connection"
        className="text-sm text-brand underline"
      >
        Manage your subscription
      </Link>
    </section>
  );
}
