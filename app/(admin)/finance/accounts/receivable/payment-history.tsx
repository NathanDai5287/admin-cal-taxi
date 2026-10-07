import type { DuesPaymentEvent } from "./dues-board";
import { formatMoney } from "@/lib/reimbursements/format";

export function DuesPaymentHistory({ payments }: { payments: DuesPaymentEvent[] }) {
  return <section className="dues-payment-history" aria-label="Payment history">
    <h4 className="font-semibold text-sm">Payment history</h4>
    {payments.length ? <ol>
      {payments.map((payment) => <li key={payment.id}>
        <div>
          <strong>{payment.amount < 0 ? "Payment reversal" : "Payment recorded"}</strong>
          <p><time dateTime={payment.paidDate}>{new Date(`${payment.paidDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</time>{payment.dateIsEstimated && <span className="dues-estimated-date">Estimated date</span>}</p>
        </div>
        <span className="dues-history-amount">{formatMoney(payment.amount)}</span>
      </li>)}
    </ol> : <p className="text-sm text-muted">No payments recorded yet.</p>}
  </section>;
}
