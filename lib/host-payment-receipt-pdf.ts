import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NodeCompiler, PdfStandard } from "@myriaddreamin/typst-ts-node-compiler";
import { formatDateISO } from "./host-format";
import { defaultDocuments } from "./host-order-documents";
import type { Order } from "./host-orders-types";

export type ReceiptPayment = { id: string; amount: number; paid_date: string };
export type DepositReturn = { amount: number; date: string; method: string };
export function renderDepositReceiptPdf(order: Order, payments: ReceiptPayment[], issueDate: string, contact: string) {
  return renderPaymentReceiptPdf(order, payments, issueDate, contact, "deposit");
}
export function renderRentalReceiptPdf(order: Order, payments: ReceiptPayment[], issueDate: string, contact: string) {
  return renderPaymentReceiptPdf(order, payments, issueDate, contact, "rental");
}
export function renderDepositReturnPdf(order: Order, refund: DepositReturn, issueDate: string, contact: string) {
  return renderPaymentReceiptPdf(order, [{ id: JSON.stringify(refund), amount: refund.amount, paid_date: refund.date }], issueDate, contact, "refund", refund.method);
}
function renderPaymentReceiptPdf(order: Order, payments: ReceiptPayment[], issueDate: string, contact: string, kind: "deposit" | "rental" | "refund", returnMethod = "") {
  const cents = payments.reduce((n, payment) => n + Math.round(Number(payment.amount) * 100), 0);
  if (!payments.length || cents <= 0 || !Number.isFinite(cents)) throw new Error(`A recorded ${kind} payment is required for a receipt.`);
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const fingerprint = createHash("sha256").update(JSON.stringify(payments)).digest("hex").slice(0, 8).toUpperCase();
  const invoiceKind = kind === "rental" ? "rental_invoice" : "deposit_invoice";
  const invoice = order.documents.find(d => d.kind === invoiceKind && !d.stale)?.number
    ?? String(defaultDocuments(order).payloads[invoiceKind].invoice_number);
  const assetDir = path.join(process.cwd(), "lib/host-pdf");
  const compiler = NodeCompiler.create({ workspace: assetDir, fontArgs: [{ fontBlobs: [
    readFileSync(path.join(assetDir, "fonts/DejaVuSans.ttf")),
    readFileSync(path.join(assetDir, "fonts/DejaVuSans-Bold.ttf")),
  ] }] });
  const receipt = { kind, number: `${kind === "refund" ? "DRC" : kind === "deposit" ? "DPR" : "RPR"}-${order.eventDate.replaceAll("-", "")}-${fingerprint}`, organization: order.clubName,
    issueDate: formatDateISO(issueDate), eventDate: formatDateISO(order.eventDate), invoice, contact,
    payments: payments.map(payment => ({ date: formatDateISO(payment.paid_date), amount: money(Number(payment.amount)) })),
    total: money(cents / 100), remaining: money(Math.max(((kind === "rental" ? order.rentalPrice : order.depositAmount) ?? 0) - cents / 100, 0)), returnMethod,
  };
  return compiler.pdf({ mainFilePath: path.join(assetDir, "payment-receipt.typ"), inputs: { receipt: JSON.stringify(receipt) } }, { pdfStandard: PdfStandard.V_1_7, pdfTags: true });
}
