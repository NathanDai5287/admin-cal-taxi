"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { InvitationResult } from "./invitation-result";
import "./invite-form.css";
import {
  CONNECT_SENDER,
  CONNECT_INVITATION_CTA,
  blankRecipient,
  identityLabels,
  invitationBatchSchema,
  prepareRecipients,
  invitationCopy,
  type ConnectResult,
  type InviteRecipient,
} from "@/lib/alumni-connect/model";

export function InviteForm({
  inviterName,
  action,
  disabled = false,
  remaining = 50,
}: {
  inviterName: string;
  action: (input: unknown) => Promise<ConnectResult>;
  disabled?: boolean;
  remaining?: number;
}) {
  const router = useRouter();
  type Row = InviteRecipient & { rowId: string };
  const makeRow = (r: InviteRecipient = blankRecipient): Row => ({
    ...r,
    rowId: crypto.randomUUID(),
  });
  const [recipients, setRecipients] = useState<Row[]>([
    { ...blankRecipient, rowId: "initial" },
  ]);
  const [includeName, setIncludeName] = useState(true);
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState<ConnectResult | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = invitationCopy(inviterName, includeName);
  function update(index: number, field: keyof InviteRecipient, value: string) {
    setRecipients((current) =>
      current.map((r, i) =>
        i === index
          ? {
              ...r,
              [field]:
                field === "graduation_year"
                  ? value
                    ? Number(value)
                    : null
                  : value,
            }
          : r,
      ),
    );
  }
  function validate() {
    try {
      const normalized = prepareRecipients(recipients);
      const result = invitationBatchSchema.parse({
        recipients: normalized,
        include_name: includeName,
      });
      if (result.recipients.length > remaining)
        throw new Error(
          `You have ${remaining} new invitations remaining today. Reduce this batch or try tomorrow.`,
        );
      setRecipients(
        result.recipients.map((r) => ({
          ...r,
          rowId:
            recipients.find((old) => old.email.trim().toLowerCase() === r.email)
              ?.rowId ?? crypto.randomUUID(),
        })),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Check your recipient details.";
      setNotice({ ok: false, message });
      const row = message.match(/^Row (\d+)/);
      if (row)
        document.getElementById(`recipient-${Number(row[1]) - 1}`)?.focus();
      return;
    }
    setNotice(null);
    setReview(true);
  }
  return (
    <form
      className="connect-invite-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!review) {
          validate();
          return;
        }
        startTransition(async () => {
          try {
            const result = await action({
              recipients,
              include_name: includeName,
            });
            setNotice(result);
            router.refresh();
            if (result.redirect) router.push(result.redirect);
            if (result.ok) {
              setReview(false);
              setRecipients([makeRow()]);
            }
          } catch {
            setNotice({
              ok: false,
              message:
                "Sending could not be confirmed. Try again; previously processed addresses will not be invited twice.",
            });
          }
        });
      }}
    >
      <p className="helper-text m-0" role="status">
        You can send {remaining} more invitations today.
      </p>
      <fieldset
        disabled={disabled || pending}
        className="grid min-w-0 gap-6 border-0 p-0 m-0"
      >
        {review ? (
          <section className="grid gap-4" aria-label="Review invitations">
            <h2 className="card-title">
              Review {recipients.length}{" "}
              {recipients.length === 1 ? "recipient" : "recipients"}
            </h2>
            <ul className="divide-y divide-rule list-none p-0 m-0">
              {recipients.map((r) => (
                <li className="py-3 break-words" key={r.email}>
                  <strong>{r.email}</strong>
                  <div className="text-sm text-muted">
                    {[
                      r.first_name,
                      r.last_name,
                      r.roll_number,
                      r.graduation_year ? `Class of ${r.graduation_year}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No suggested profile details"}
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="text" onClick={() => setReview(false)}>
              Edit recipients
            </Button>
          </section>
        ) : (
          <>
            {recipients.map((recipient, index) => (
              <section
                className="connect-recipient"
                key={recipient.rowId}
                aria-label={`Recipient ${index + 1}`}
              >
                <div className="connect-recipient-heading">
                  <h3>Brother {index + 1}</h3>{" "}
                  {recipients.length > 1 && (
                    <Button
                      variant="text"
                      onClick={() =>
                        setRecipients((r) => r.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove recipient ${index + 1}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div>
                  <div className="field min-w-0 flex-1">
                    <label
                      className="field-label"
                      htmlFor={`recipient-${index}`}
                    >
                      Email address
                    </label>
                    <input
                      className="field-input w-full"
                      id={`recipient-${index}`}
                      type="email"
                      maxLength={254}
                      value={recipient.email}
                      onChange={(e) => update(index, "email", e.target.value)}
                      placeholder="brother@example.com"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="connect-identity-fields">
                  {Object.entries(identityLabels).map(([field, label]) => (
                    <div className="field" key={field}>
                      <label
                        className="field-label"
                        htmlFor={`${field}-${index}`}
                      >
                        {label}
                      </label>
                      <input
                        id={`${field}-${index}`}
                        className="field-input w-full"
                        type={field === "graduation_year" ? "number" : "text"}
                        min={field === "graduation_year" ? 1900 : undefined}
                        max={field === "graduation_year" ? 2200 : undefined}
                        maxLength={100}
                        placeholder={
                          field === "roll_number"
                            ? "Nu 1048"
                            : field === "graduation_year"
                              ? "2027"
                              : undefined
                        }
                        value={
                          recipient[field as keyof typeof identityLabels] ?? ""
                        }
                        onChange={(e) =>
                          update(
                            index,
                            field as keyof InviteRecipient,
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div>
              <Button
                variant="text"
                disabled={recipients.length >= 20}
                onClick={() => setRecipients((r) => [...r, makeRow()])}
              >
                Add another brother
              </Button>
            </div>
            <label className="connect-attribution">
              <input
                className="mt-1"
                type="checkbox"
                checked={includeName}
                onChange={(e) => setIncludeName(e.target.checked)}
              />
              <span>
                Include my name as the inviter
                <span className="block text-sm text-muted">
                  Recipients will see “{inviterName}.”
                </span>
              </span>
            </label>
          </>
        )}
        {review && (
          <details open className="connect-email-preview">
            <summary className="cursor-pointer font-semibold">
              Invitation preview
            </summary>
            <p className="text-sm break-words">From: {CONNECT_SENDER}</p>
            <p className="font-semibold">{copy.subject}</p>
            <p>{copy.introduction}</p>
            <p>
              Join our mailing list for Nu News, chapter updates, and
              invitations to alumni events.
            </p>
            <p className="text-brand font-semibold">{CONNECT_INVITATION_CTA}</p>
            <p className="text-sm text-muted">
              You can join using this email, choose a different address, or
              decline. You won’t be subscribed unless you accept.
            </p>
            <p className="text-sm">
              Once you join, you can invite brothers you know.
            </p>
          </details>
        )}
        <div className="connect-invite-footer">
          <p className="helper-text m-0">
            They choose whether to join. Previously invited addresses won’t be
            emailed again.
          </p>
          <div>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Processing invitations…"
                : review
                  ? "Send invitations"
                  : "Review invitations"}
            </Button>
          </div>
        </div>
      </fieldset>
      {notice && <InvitationResult result={notice} />}
    </form>
  );
}
