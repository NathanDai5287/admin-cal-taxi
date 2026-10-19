import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";

const result = await build({ entryPoints: ["lib/host-payment-receipt-pdf.ts"], bundle: true, write: false, format: "esm", platform: "node", packages: "external" });
const temporary = path.join(process.cwd(), "node_modules/.deposit-receipt-test.mjs");
await writeFile(temporary, result.outputFiles[0].text);
const { renderDepositReceiptPdf, renderRentalReceiptPdf } = await import(`file://${temporary.replaceAll("\\", "/")}`);
await unlink(temporary);
const order = { id: "ord_receipt_test", eventDate: "2026-10-16", clubName: "Plextech, Theta Tau, Beta Alpha Psi, Berkeley Investment Group, Product Space, and 180 Degrees Consulting", depositAmount: 300, rentalPrice: 1400, snapshot: {}, documents: [] };

test("receipt fits the invoice's letter page with six clubs and a shared $300 payment", async () => {
  const bytes = renderDepositReceiptPdf(order, [{ id: "record-one", amount: 300, paid_date: "2026-10-04" }], "2026-10-04", "host@example.test");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  assert.match(pdf.getTitle(), /Theta Xi Deposit Receipt DPR-20261016-/);
});

test("receipt accepts Unicode and treats template syntax as text", async () => {
  const bytes = renderDepositReceiptPdf({ ...order, clubName: 'Café & Société — #pagebreak() @everyone "club"' }, [{ id: "unicode", amount: 300, paid_date: "2026-10-04" }], "2026-10-04", "contact@example.test");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  assert.throws(() => renderDepositReceiptPdf(order, [], "2026-10-04", "contact@example.test"), /recorded deposit/);
});


test("rental receipt uses rental branding and fits six clubs with multiple partial payments", async () => {
  const payments = [
    { id: "rental-one", amount: 400, paid_date: "2026-10-04" },
    { id: "rental-two", amount: 600, paid_date: "2026-10-19" },
  ];
  const bytes = renderRentalReceiptPdf(order, payments, "2026-10-19", "host@example.test");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  assert.match(pdf.getTitle(), /Theta Xi Rental Receipt RPR-20261016-/);
  const reissued = await PDFDocument.load(renderRentalReceiptPdf(order, payments, "2026-10-20", "host@example.test"));
  assert.equal(reissued.getTitle(), pdf.getTitle());
  assert.throws(() => renderRentalReceiptPdf(order, [], "2026-10-19", "host@example.test"), /recorded rental/);
});
