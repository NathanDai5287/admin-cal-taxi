"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = shortMonths[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : iso;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type Props = {
  eventDate: string;
  depositDueDate: string;
  depositAmount: string;
  rentalDueDate: string;
  rentalAmount: number;
  refundAmount?: number;
};

function paymentMessage({
  eventDate,
  depositDueDate,
  depositAmount,
  rentalDueDate,
  rentalAmount,
  refundAmount,
}: Props): string | null {
  const deposit = Number(depositAmount);
  if (!eventDate || !depositDueDate || !rentalDueDate ||
      !Number.isFinite(deposit) || deposit <= 0 ||
      !Number.isFinite(rentalAmount) || rentalAmount <= 0) return null;

  const datedEvents = [
    { date: depositDueDate, detail: `${money.format(deposit)} security deposit due.` },
    { date: eventDate, detail: "Event at Theta Xi Fraternity House." },
    { date: rentalDueDate, detail: `${money.format(rentalAmount)} rental fee due.` },
  ].sort((a, b) => a.date.localeCompare(b.date));
  const refund = Number.isFinite(refundAmount) && (refundAmount ?? 0) >= 0
    ? refundAmount as number
    : deposit;

  return [
    `Payment schedule for the ${shortDate(eventDate)} event:`,
    "",
    ...datedEvents.map(({ date, detail }) => `${shortDate(date)}: ${detail}`),
    `After the event and receipt of the full rental fee: ${money.format(refund)} security deposit refunded, subject to the hosting contract.`,
    "",
    "Zelle: calthetaxi@gmail.com",
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
    <section className="border-t border-rule" aria-labelledby="payment-message-title">
      <div className="px-5 pt-5 pb-3">
        <div>
          <h2 className="card-title" id="payment-message-title">Payment Message</h2>
          <p className="card-subtitle">Uses the invoice amounts and due dates above. Review before sending.</p>
        </div>
      </div>
      <div className="px-5 pb-5 space-y-4">
        {message ? (
          <>
            <div className="border border-rule bg-canvas px-4 py-3 text-sm leading-relaxed text-ink whitespace-pre-wrap break-words select-text">{message}</div>
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
