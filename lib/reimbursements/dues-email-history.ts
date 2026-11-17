import "server-only";

import { sendEmailWithRetry } from "../email-send";
import { createAdminClient } from "./supabase/admin";

const BUCKET = "dues-email-history";
const PAGE_SIZE = 100;

type EmailBody = { from: string; to: string; subject: string; text: string; html: string };
type PreparedEmail = { paymentId: string; body: EmailBody; createdAt: string };
type Delivery = { paymentId: string; sentAt: string; providerId: string } | { paymentId: string; failedAt: string; error: string };
export type DuesEmailHistory = {
  id: string; recipient: string; subject: string; text: string; createdAt: string;
  sentAt: string | null; error: string | null;
};

function storage() {
  return createAdminClient().storage;
}

function missingBucket(error: { message: string }) {
  return /bucket not found/i.test(error.message);
}

async function prepareEmail(chargeId: string, paymentId: string, body: EmailBody) {
  const client = storage();
  const bucket = await client.getBucket(BUCKET);
  if (bucket.error && !missingBucket(bucket.error)) throw bucket.error;
  if (bucket.error) {
    const created = await client.createBucket(BUCKET, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
  const prepared: PreparedEmail = { paymentId, body, createdAt: new Date().toISOString() };
  const path = `${chargeId}/${paymentId}.prepared.json`;
  const saved = await client.from(BUCKET).upload(path, JSON.stringify(prepared), { contentType: "application/json", upsert: false });
  if (saved.error && saved.error.statusCode !== "409" && !/already exists|duplicate/i.test(saved.error.message)) throw saved.error;
  const existing = await client.from(BUCKET).download(path);
  if (existing.error) throw existing.error;
  return JSON.parse(await existing.data.text()) as PreparedEmail;
}

async function saveDelivery(chargeId: string, delivery: Delivery) {
  const status = "sentAt" in delivery ? "sent" : "failed";
  const saved = await storage().from(BUCKET).upload(`${chargeId}/${delivery.paymentId}.${status}.json`, JSON.stringify(delivery), { contentType: "application/json", upsert: true });
  if (saved.error) throw saved.error;
}

export async function sendRecordedDuesEmail(chargeId: string, paymentId: string, body: EmailBody) {
  const prepared = await prepareEmail(chargeId, paymentId, body);
  const sent = await storage().from(BUCKET).download(`${chargeId}/${paymentId}.sent.json`);
  if (!sent.error) return "";
  if (sent.error.statusCode !== "404" && !/not found/i.test(sent.error.message)) throw sent.error;
  let providerId: string;
  try {
    providerId = await sendEmailWithRetry(prepared.body, `dues-payment/${paymentId}`);
  } catch (error) {
    await saveDelivery(chargeId, { paymentId, failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "The email service did not accept this email." });
    throw error;
  }
  try {
    await saveDelivery(chargeId, { paymentId, sentAt: new Date().toISOString(), providerId });
    return "";
  } catch {
    return "The confirmation email was sent, but its delivery record could not be saved. Check the Emails tab.";
  }
}

export async function loadDuesEmailHistory(chargeId: string): Promise<DuesEmailHistory[]> {
  const bucket = storage().from(BUCKET);
  const names: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await bucket.list(chargeId, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (page.error && missingBucket(page.error)) return [];
    if (page.error) throw page.error;
    names.push(...page.data.map((file) => file.name));
    if (page.data.length < PAGE_SIZE) break;
  }
  const records = await Promise.all(names.map(async (name) => {
    const downloaded = await bucket.download(`${chargeId}/${name}`);
    if (downloaded.error) throw downloaded.error;
    return JSON.parse(await downloaded.data.text()) as PreparedEmail | Delivery;
  }));
  const prepared = records.filter((record): record is PreparedEmail => "body" in record);
  return prepared.map((record) => {
    const accepted = records.find((delivery): delivery is Extract<Delivery, { sentAt: string }> => delivery.paymentId === record.paymentId && "sentAt" in delivery);
    const failed = records.find((delivery): delivery is Extract<Delivery, { failedAt: string }> => delivery.paymentId === record.paymentId && "failedAt" in delivery);
    return { id: record.paymentId, recipient: record.body.to, subject: record.body.subject, text: record.body.text, createdAt: record.createdAt, sentAt: accepted?.sentAt ?? null, error: accepted ? null : failed?.error ?? null };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
