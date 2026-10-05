import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NodeCompiler, PdfStandard } from "@myriaddreamin/typst-ts-node-compiler";
import { formatDateISO } from "./host-format";
import { defaultDocuments } from "./host-order-documents";
import type { Order } from "./host-orders-types";

export type DepositReceiptPayment = { id: string; amount: number; paid_date: string };
export function renderDepositReceiptPdf(order: Order, payments: DepositReceiptPayment[], issueDate: string, contact: string) {
  const cents = payments.reduce((n, payment) => n + Math.round(Number(payment.amount) * 100), 0);
  if (!payments.length || cents <= 0 || !Number.isFinite(cents)) throw new Error("A recorded deposit payment is required for a receipt.");
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const fingerprint = createHash("sha256").update(JSON.stringify(payments)).digest("hex").slice(0, 8).toUpperCase();
  const invoice = order.documents.find(d => d.kind === "deposit_invoice" && !d.stale)?.number
    ?? String(defaultDocuments(order).payloads.deposit_invoice.invoice_number);
  const assetDir = path.join(process.cwd(), "lib/host-pdf");
  const compiler = NodeCompiler.create({ workspace: assetDir, fontArgs: [{ fontBlobs: [
    readFileSync(path.join(assetDir, "fonts/DejaVuSans.ttf")),
    readFileSync(path.join(assetDir, "fonts/DejaVuSans-Bold.ttf")),
  ] }] });
  const receipt = { number: `DPR-${order.eventDate.replaceAll("-", "")}-${fingerprint}`, organization: order.clubName,
    issueDate: formatDateISO(issueDate), eventDate: formatDateISO(order.eventDate), invoice, contact,
    payments: payments.map(payment => ({ date: formatDateISO(payment.paid_date), amount: money(Number(payment.amount)) })),
    total: money(cents / 100), remaining: money(Math.max((order.depositAmount ?? 0) - cents / 100, 0)),
  };
  return compiler.pdf({ mainFilePath: path.join(assetDir, "deposit-receipt.typ"), inputs: { receipt: JSON.stringify(receipt) } }, { pdfStandard: PdfStandard.V_1_7, pdfTags: true });
}
