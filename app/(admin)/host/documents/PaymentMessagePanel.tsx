"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import { addDaysIso } from "@/lib/host-format";

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
  depositAmount: string;
  rentalAmount: number;
  compact?: boolean;
};

function paymentMessage({
  eventDate,
  depositAmount,
  rentalAmount,
}: Props): string | null {
  const deposit = Number(depositAmount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      !Number.isFinite(deposit) || deposit <= 0 ||
      !Number.isFinite(rentalAmount) || rentalAmount <= 0) return null;

  const depositDueDate = addDaysIso(eventDate, -7);
  const rentalDueDate = addDaysIso(eventDate, 2);

  return [
    `Payment schedule for the ${shortDate(eventDate)} event:`,
    "",
    `${shortDate(depositDueDate)}: ${money.format(deposit)} security deposit due, 7 days before the event.`,
    `${shortDate(eventDate)}: Event at Theta Xi Fraternity House.`,
    `${shortDate(rentalDueDate)}: ${money.format(rentalAmount)} full rental fee due, within 2 days after the event.`,
    `Upon receipt of the full rental fee: The ${money.format(deposit)} security deposit is returned, subject to the hosting contract.`,
    "",
    "Zelle: calthetaxi@gmail.com",
    "If you would prefer to pay by credit card or cash, please let us know.",
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

  if (props.compact) return <div className="flex flex-wrap items-center gap-3">
    <Button compact variant="text" disabled={!message} onClick={copyMessage}>{copied ? "Copied" : "Copy payment instructions"}</Button>
    {copyError && <span role="status" className="text-[12px] text-warn">Could not copy. Retry with clipboard access enabled.</span>}
  </div>;

  return (
    <section className="border-t border-rule" aria-labelledby="payment-message-title">
      <div className="px-5 pt-5 pb-3">
        <div>
          <h2 className="card-title" id="payment-message-title">Payment Message</h2>
          <p className="card-subtitle">Uses the contract amounts and payment deadlines. Review before sending.</p>
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
            Enter the event date and contract deposit and rental amounts to prepare this message.
          </p>
        )}
      </div>
    </section>
  );
}
