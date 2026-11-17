import { writeFile } from "node:fs/promises";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["lib/reimbursements/dues-payment-email.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { duesPaymentEmail } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const email = duesPaymentEmail({
  memberName: "Alex Morgan", chargeId: "DUES-2026-014", assessed: 1200, paid: 500, dueDate: "2026-11-01",
  plan: { frequency: "monthly", amount: 300, intervalDays: null, startDate: "2026-10-01" },
  payment: { amount: 200, paidDate: "2026-11-16" },
  payments: [
    { id: "sample-1", amount: 300, paidDate: "2026-10-01", estimated: false },
    { id: "sample-2", amount: 200, paidDate: "2026-11-16", estimated: false },
  ],
});
const destination = process.argv[2] || "/tmp/cal-taxi-dues-email-preview.html";
await writeFile(destination, email.html);
console.log(destination);
