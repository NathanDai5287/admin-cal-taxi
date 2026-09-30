"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import { formatDateISO } from "@/lib/host-format";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type Props = {
  clubName: string;
  eventDate: string;
  depositDueDate: string;
  depositAmount: string;
  rentalDueDate: string;
  rentalAmount: number;
};

function paymentMessage({
  clubName,
  eventDate,
  depositDueDate,
  depositAmount,
  rentalDueDate,
  rentalAmount,
}: Props): string | null {
  const deposit = Number(depositAmount);
  if (!clubName || !eventDate || !depositDueDate || !rentalDueDate ||
      !Number.isFinite(deposit) || deposit <= 0 ||
      !Number.isFinite(rentalAmount) || rentalAmount <= 0) return null;

  const datedEvents = [
    { date: depositDueDate, detail: `${money.format(deposit)} security deposit due.` },
    { date: eventDate, detail: "Event at Theta Xi Fraternity House." },
    { date: rentalDueDate, detail: `${money.format(rentalAmount)} rental fee due.` },
  ].sort((a, b) => a.date.localeCompare(b.date));

  return [
    "Hello,",
    "",
    `For the ${clubName} event at Theta Xi on ${formatDateISO(eventDate)}, here is the payment schedule:`,
    "",
    ...datedEvents.map(({ date, detail }) => `${formatDateISO(date)} — ${detail}`),
    `After the event and receipt of the full rental fee — ${money.format(deposit)} security deposit refunded, subject to the hosting contract.`,
    "",
    "Please send payments by Zelle to calthetaxi@gmail.com.",
    "",
    "Thank you,",
    "Theta Xi Fraternity",
  ].join("\n");
}

export default function PaymentMessagePanel(props: Props) {
  const message = paymentMessage(props);
  const [copiedMessage, setCopiedMessage] = useState("");
  const [copyError, setCopyError] = useState(false);
  const copied = Boolean(message) && copiedMessage === message;

  async function copyMessage() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessage(message);
      setCopyError(false);
    } catch {
      setCopiedMessage("");
      setCopyError(true);
    }
  }

  return (
    <section className="card" aria-labelledby="payment-message-title">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="payment-message-title">Payment Message</h2>
          <p className="card-subtitle">Uses the invoice amounts and due dates above. Review before sending.</p>
        </div>
      </div>
      <div className="card-body space-y-4">
        {message ? (
          <>
            <label className="sr-only" htmlFor="hosting-payment-message">Payment message to send</label>
            <textarea
              id="hosting-payment-message"
              className="field-input w-full resize-y leading-relaxed"
              rows={13}
              readOnly
              value={message}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={copyMessage}>
                {copied ? "Copied" : "Copy Message"}
              </Button>
              <span className={copyError ? "text-warn text-sm" : "text-ok text-sm"} role="status" aria-live="polite">
                {copyError ? "Could not copy. Select the message above to copy it manually." : copied ? "Copied to clipboard." : ""}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Enter the event date and the deposit and rental invoice amounts and due dates to prepare this message.
          </p>
        )}
      </div>
    </section>
  );
}
