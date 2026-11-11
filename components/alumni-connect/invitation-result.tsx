import type { ConnectResult } from "@/lib/alumni-connect/model";

export function InvitationResult({ result }: { result: ConnectResult }) {
  const counts = result.counts;
  if (!counts)
    return (
      <p className="connect-send-result" role={result.ok ? "status" : "alert"}>
        {result.message}
      </p>
    );
  return (
    <section className="connect-send-result" aria-label="Invitation results">
      <div role={result.ok ? "status" : "alert"}>
        <p className="connect-result-title">
          {counts.sent
            ? `${counts.sent} invitation${counts.sent === 1 ? "" : "s"} sent`
            : "No new invitations sent"}
        </p>
        {counts.skipped > 0 && (
          <p>
            {counts.skipped} skipped — already connected, previously invited, or
            opted out.
          </p>
        )}
        {counts.notSent > 0 && (
          <p className="text-warn">
            {counts.notSent} could not be sent. Contact the chapter for help.
          </p>
        )}
        {counts.uncertain > 0 && (
          <p className="text-warn">
            Sending could not be confirmed for {counts.uncertain}. These
            invitations won’t be sent again to avoid duplicates.
          </p>
        )}
      </div>
      <details>
        <summary>Sending details</summary>
        <p>
          Sent means accepted by the email service; inbox delivery isn’t
          confirmed. Skipped addresses’ individual preferences are private.
        </p>
      </details>
    </section>
  );
}
