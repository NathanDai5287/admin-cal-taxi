"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import {
  blankRecipient,
  identityLabels,
  type ConnectResult,
  type InviteRecipient,
} from "@/lib/alumni-connect/model";
import {
  acceptConnectInvitation,
  declineConnectInvitation,
  requestConnectCode,
  unsubscribeConnect,
  verifyConnectCode,
} from "./actions";

function Notice({ result }: { result: ConnectResult | null }) {
  return (
    result && (
      <p
        className="border border-rule p-4"
        role={result.ok ? "status" : "alert"}
      >
        {result.message}
      </p>
    )
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null),
    [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = sent
              ? await verifyConnectCode(code)
              : await requestConnectCode(email);
            setResult(r);
            if (r.ok) {
              if (r.redirect) {
                router.push(r.redirect);
                router.refresh();
              } else setSent(true);
            }
          } catch {
            setResult({
              ok: false,
              message: "Sign-in is temporarily unavailable. Please try again.",
            });
          }
        });
      }}
    >
      <div className="field">
        <label htmlFor="connect-email" className="field-label">
          Your mailing email
        </label>
        <input
          id="connect-email"
          className="field-input"
          type="email"
          required
          maxLength={254}
          value={email}
          disabled={sent || pending}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      {sent && (
        <div className="field">
          <label htmlFor="connect-code" className="field-label">
            Six-digit code
          </label>
          <input
            id="connect-code"
            className="field-input"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Please wait…"
            : sent
              ? "Sign in"
              : "Email me a sign-in code"}
        </Button>
        {sent && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setSent(false);
              setCode("");
              setResult(null);
            }}
          >
            Use another email or request a new code
          </Button>
        )}
      </div>
      <Notice result={result} />
    </form>
  );
}

export function AcceptanceForm({
  invitation,
  email,
  defaults,
}: {
  invitation: string;
  email: string;
  defaults: Partial<InviteRecipient>;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<InviteRecipient>({
    ...blankRecipient,
    ...defaults,
    email,
  });
  const [consent, setConsent] = useState(false),
    [code, setCode] = useState(""),
    [codeSent, setCodeSent] = useState(false),
    [verifiedEmail, setVerifiedEmail] = useState("");
  const [result, setResult] = useState<ConnectResult | null>(null),
    [finished, setFinished] = useState(false),
    [pending, start] = useTransition();
  const changed = details.email.trim().toLowerCase() !== email;
  function run(action: () => Promise<ConnectResult>, after?: () => void) {
    start(async () => {
      try {
        const r = await action();
        setResult(r);
        if (r.ok) after?.();
        if (r.redirect) {
          router.push(r.redirect);
          router.refresh();
        }
      } catch {
        setResult({
          ok: false,
          message: "This could not be completed. Please try again.",
        });
      }
    });
  }
  if (finished) return <Notice result={result} />;
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => acceptConnectInvitation(invitation, { ...details, consent }));
      }}
    >
      <p className="text-muted m-0">
        Check your details — your inviter filled in what they knew. Correct or
        complete anything below.
      </p>
      <fieldset disabled={pending} className="grid gap-5 border-0 m-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(identityLabels).map(([field, label]) => (
            <div className="field" key={field}>
              <label className="field-label" htmlFor={`accept-${field}`}>
                {label}
                {(field === "roll_number" || field === "graduation_year") &&
                  " (optional)"}
              </label>
              <input
                className="field-input w-full"
                id={`accept-${field}`}
                required={field === "first_name" || field === "last_name"}
                type={field === "graduation_year" ? "number" : "text"}
                min={field === "graduation_year" ? 1900 : undefined}
                max={field === "graduation_year" ? 2200 : undefined}
                maxLength={100}
                placeholder={field === "roll_number" ? "Nu 1048" : undefined}
                autoComplete={
                  field === "first_name"
                    ? "given-name"
                    : field === "last_name"
                      ? "family-name"
                      : "off"
                }
                value={details[field as keyof typeof identityLabels] ?? ""}
                onChange={(e) =>
                  setDetails({
                    ...details,
                    [field]:
                      field === "graduation_year"
                        ? e.target.value
                          ? Number(e.target.value)
                          : null
                        : e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="accept-email" className="field-label">
            Email for chapter updates
          </label>
          <input
            id="accept-email"
            className="field-input"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={details.email}
            onChange={(e) => {
              setDetails({ ...details, email: e.target.value });
              setCodeSent(false);
              setVerifiedEmail("");
            }}
          />
          <p className="helper-text">
            Use the invited address or enter a different email. A different
            address needs a verification code.
          </p>
        </div>
        {changed && (
          <section
            className="grid gap-3 border border-rule p-4"
            aria-label="Verify your email"
          >
            {verifiedEmail === details.email.trim().toLowerCase() ? (
              <p className="m-0" role="status">
                New email verified.
              </p>
            ) : (
              <>
                <div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(
                        () => requestConnectCode(details.email, invitation),
                        () => setCodeSent(true),
                      )
                    }
                  >
                    {codeSent ? "Send a new code" : "Send verification code"}
                  </Button>
                </div>
                {codeSent && (
                  <>
                    <label className="field-label" htmlFor="accept-code">
                      Six-digit code
                    </label>
                    <input
                      className="field-input"
                      id="accept-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          run(
                            () => verifyConnectCode(code),
                            () =>
                              setVerifiedEmail(
                                details.email.trim().toLowerCase(),
                              ),
                          )
                        }
                      >
                        Verify email
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}
        <label className="flex items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I’d like to receive Nu News, chapter updates, and alumni event
            invitations. I can unsubscribe at any time.
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={
              changed && verifiedEmail !== details.email.trim().toLowerCase()
            }
          >
            Join mailing list
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(
                () => declineConnectInvitation(invitation),
                () => setFinished(true),
              )
            }
          >
            No thanks
          </Button>
        </div>
      </fieldset>
      <Notice result={result} />
    </form>
  );
}

export function UnsubscribeForm({ credential }: { credential?: string }) {
  const [result, setResult] = useState<ConnectResult | null>(null),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="grid gap-3 mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await unsubscribeConnect(credential);
            setResult(r);
            if (r.ok && !credential) router.refresh();
          } catch {
            setResult({
              ok: false,
              message: "Unable to unsubscribe. Please try again.",
            });
          }
        });
      }}
    >
      <p className="m-0">
        Stop receiving chapter updates and invitations through Connect.
      </p>
      {!result?.ok && (
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Unsubscribe
          </Button>
        </div>
      )}
      <Notice result={result} />
    </form>
  );
}
