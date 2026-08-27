import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

type ProcessResponse = {
  success?: boolean;
  token?: string;
  message?: string;
};

type ResultResponse = {
  status?: "done" | "pending" | "failed";
  message?: string;
  result?: {
    establishment?: string | null;
    dateISO?: string | null;
    date?: string | null;
    total?: number | string | null;
  };
};

function parseReceiptTotal(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.replaceAll(",", "").replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function amountsMatch(requestedAmount: number, receiptTotal: number) {
  return Math.round(requestedAmount * 100) === Math.round(receiptTotal * 100);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function tabscannerRequest(url: string, options: RequestInit) {
  const apiKey = process.env.TABSCANNER_API_KEY;
  if (!apiKey) throw new Error("Tabscanner is not configured.");
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, apikey: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Tabscanner returned ${response.status}.`);
  }
  return response;
}

async function scanReceipt(receipt: Blob, filename: string) {
  const body = new FormData();
  body.append("file", receipt, filename);
  body.append("documentType", "receipt");

  const uploadResponse = await tabscannerRequest(
    "https://api.tabscanner.com/api/2/process",
    { method: "POST", body },
  );
  const upload = (await uploadResponse.json()) as ProcessResponse;
  if (!upload.success || !upload.token) {
    throw new Error(upload.message || "Tabscanner did not accept the receipt.");
  }

  await wait(5000);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const resultResponse = await tabscannerRequest(
      `https://api.tabscanner.com/api/result/${encodeURIComponent(upload.token)}`,
      { method: "GET" },
    );
    const payload = (await resultResponse.json()) as ResultResponse;
    if (payload.result) return payload.result;
    if (payload.status === "failed") {
      throw new Error(payload.message || "Tabscanner could not read the receipt.");
    }
    await wait(1000);
  }

  throw new Error("Receipt processing timed out.");
}

export async function processReimbursementReceipt(reimbursementId: string) {
  const admin = createAdminClient();
  const { data: reimbursement, error: reimbursementError } = await admin
    .from("reimbursements")
    .select("amount, receipt_path, status")
    .eq("id", reimbursementId)
    .single();

  if (reimbursementError || !reimbursement || reimbursement.status !== "processing") return;

  try {
    const { data: receipt, error: downloadError } = await admin.storage
      .from("receipts")
      .download(reimbursement.receipt_path);
    if (downloadError || !receipt) throw downloadError ?? new Error("Receipt not found.");

    const result = await scanReceipt(receipt, reimbursement.receipt_path.split("/").at(-1) ?? "receipt.jpg");
    const receiptTotal = parseReceiptTotal(result.total);
    const matches = receiptTotal !== null
      && amountsMatch(Number(reimbursement.amount), receiptTotal);
    const receiptDate = (result.dateISO || result.date)?.slice(0, 10) || null;

    await admin.from("reimbursements").update({
      merchant: result.establishment || null,
      receipt_date: receiptDate,
      receipt_total: receiptTotal,
      failure_reason: null,
      status: matches ? "verified" : "pending",
    }).eq("id", reimbursementId);
  } catch (error) {
    await admin.from("reimbursements").update({
      status: "processing_failed",
      failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Receipt processing failed.",
    }).eq("id", reimbursementId);
  }
}
