import "server-only";

import { randomUUID } from "node:crypto";
import { trackEmailBody } from "./email-tracking-links";
import { loadUnsentEmail, prepareTrackedEmail, recordEmailFailure, recordEmailProvider, trackingAddress, type TrackingMessage } from "./email-tracking";

type EmailBody = { from: string; to: string | string[]; subject: string; text: string; html: string };
export type EmailFailure = { sent: false; messageId: string | null; error: string };
export type EmailResult = { sent: true } | EmailFailure;

const RETRY_DELAYS_MS = [1_000, 3_000];

class RetryableEmailError extends Error {}

function isRetryable(error: unknown) {
  return error instanceof RetryableEmailError || error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}

async function postEmail(body: EmailBody, idempotencyKey: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Email is not configured. Set RESEND_API_KEY.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const answer = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (response.ok && answer.id) return answer.id;
  const message = answer.message || `Email service returned ${response.status}.`;
  throw response.status === 429 || response.status >= 500 ? new RetryableEmailError(message) : new Error(message);
}

export async function sendEmailWithRetry(body: EmailBody, idempotencyKey: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postEmail(body, idempotencyKey);
    } catch (error) {
      if (!isRetryable(error) || attempt === RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function deliver(id: string | null, body: EmailBody, idempotencyKey: string): Promise<EmailResult> {
  let providerId: string;
  try {
    providerId = await sendEmailWithRetry(body, idempotencyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The email could not be sent.";
    await recordEmailFailure(id, message);
    return { sent: false, messageId: id, error: message };
  }
  await recordEmailProvider(id, providerId);
  return { sent: true };
}

export async function sendTrackedEmail(body: EmailBody, tracking: TrackingMessage, idempotencyKey = tracking.key) {
  const tracked = await prepareTrackedEmail(body, tracking);
  return deliver(tracked.id, tracked.body, idempotencyKey);
}

export async function resendTrackedEmail(messageId: string) {
  const message = await loadUnsentEmail(messageId);
  if (!message?.body) throw new Error("This email cannot be sent again because its content was not saved.");
  if (message.sent_at) return { sent: true } as const;
  const body = trackEmailBody(message.body, trackingAddress(message.token)) as unknown as EmailBody;
  return deliver(message.id, body, `${message.message_key}/again/${randomUUID()}`);
}
