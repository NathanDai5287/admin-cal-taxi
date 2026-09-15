"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  sendDuesAnnouncement,
  type DuesAnnouncementState,
} from "@/app/(admin)/finance/accounts/receivable/actions";
import { Button } from "@/components/brand/button";

export type AnnouncementRecipient = {
  id: string;
  memberName: string;
  amountOwed: number;
  discordUserId: string;
};

const initialState: DuesAnnouncementState = { status: "idle", message: "" };

function formatAnnouncementAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function MegaphoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="17">
      <path d="m3 11 15-6v14L3 13v-2Z" />
      <path d="M7 14v4a2 2 0 0 0 2 2h2l-1.5-5" />
      <path d="M21 9v6" />
    </svg>
  );
}

export function DuesAnnouncement({
  recipients,
  unlinkedCount,
  channelConfigured,
}: {
  recipients: AnnouncementRecipient[];
  unlinkedCount: number;
  channelConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Hi! This is a reminder that your chapter dues still have an outstanding balance. Please reach out if you have any questions.");
  const [selectedIds, setSelectedIds] = useState(() => recipients.map((recipient) => recipient.id));
  const [state, formAction, pending] = useActionState(sendDuesAnnouncement, initialState);
  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selectedIds.includes(recipient.id)),
    [recipients, selectedIds],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  function toggleRecipient(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((recipientId) => recipientId !== id)
      : [...current, id]);
  }

  const unavailableReason = !channelConfigured
    ? "Add the announcement channel ID to enable sending."
    : !recipients.length
      ? "Link a Discord member ID to an outstanding balance first."
      : undefined;

  return (
    <section className="dues-announcement-strip" aria-labelledby="discord-announcement-title">
      <div className="dues-announcement-mark"><MegaphoneIcon /></div>
      <div className="min-w-0">
        <h2 id="discord-announcement-title">Discord announcements</h2>
        <p>
          {recipients.length
            ? `${recipients.length} outstanding ${recipients.length === 1 ? "member is" : "members are"} ready to mention.`
            : "No outstanding members are linked to Discord yet."}
          {unlinkedCount ? ` ${unlinkedCount} ${unlinkedCount === 1 ? "balance needs" : "balances need"} a Discord ID.` : ""}
        </p>
      </div>
      <Button
        aria-describedby={unavailableReason ? "announcement-unavailable" : undefined}
        className="ml-auto shrink-0"
        disabled={Boolean(unavailableReason)}
        onClick={() => setOpen(true)}
        type="button"
        variant="primary"
      >
        Send announcement
      </Button>
      {unavailableReason ? <p className="sr-only" id="announcement-unavailable">{unavailableReason}</p> : null}

      {open ? (
        <div className="dues-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !pending) setOpen(false);
        }}>
          <section aria-labelledby="announcement-dialog-title" aria-modal="true" className="dues-announcement-dialog" role="dialog">
            <div className="dues-dialog-header">
              <div>
                <p className="page-eyebrow">Discord announcement</p>
                <h2 id="announcement-dialog-title">Message outstanding members</h2>
              </div>
              <button aria-label="Close announcement composer" disabled={pending} onClick={() => setOpen(false)} type="button">×</button>
            </div>

            <form action={formAction} className="dues-announcement-form">
              <div className="field">
                <label className="field-label" htmlFor="announcement-message">Message</label>
                <textarea
                  autoFocus
                  className="field-textarea min-h-[96px]"
                  id="announcement-message"
                  maxLength={1200}
                  name="message"
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  value={message}
                />
                <p className="field-hint">This appears above the member mentions. `@everyone` and role mentions are blocked.</p>
              </div>

              <fieldset className="dues-recipient-fieldset">
                <legend>Recipients <span>{selectedRecipients.length} selected</span></legend>
                <div className="dues-recipient-actions">
                  <button onClick={() => setSelectedIds(recipients.map((recipient) => recipient.id))} type="button">Select all</button>
                  <button onClick={() => setSelectedIds([])} type="button">Clear</button>
                </div>
                <div className="dues-recipient-list">
                  {recipients.map((recipient) => (
                    <label key={recipient.id}>
                      <input
                        checked={selectedIds.includes(recipient.id)}
                        name="recipientId"
                        onChange={() => toggleRecipient(recipient.id)}
                        type="checkbox"
                        value={recipient.id}
                      />
                      <span>{recipient.memberName}</span>
                      <strong>{formatAnnouncementAmount(recipient.amountOwed)}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="dues-message-preview" aria-label="Discord message preview">
                <span>Preview</span>
                <p>{message || "Your message"}</p>
                {selectedRecipients.map((recipient) => (
                  <p className="dues-preview-recipient" key={recipient.id}>
                    <b>@{recipient.memberName}</b> {formatAnnouncementAmount(recipient.amountOwed)}
                  </p>
                ))}
              </div>

              <div className="dues-dialog-footer">
                <p aria-live="polite" className={state.status === "success" ? "form-message success" : "form-message"}>
                  {state.message}
                </p>
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="secondary">Cancel</Button>
                  <Button disabled={pending || !message.trim() || !selectedRecipients.length} type="submit" variant="primary">
                    {pending ? "Sending…" : `Send to ${selectedRecipients.length}`}
                  </Button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
