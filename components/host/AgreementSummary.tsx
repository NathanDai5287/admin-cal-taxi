import { formatDateISO } from "@/lib/host-format";
import { paymentSchedule, formatRentalDeadline } from "@/lib/host-payment-schedule";
import { effective, effectiveRentalPrice } from "@/lib/host-derive";
import { clubsDisplay } from "@/lib/host-clubs";
import type { SharedState } from "@/lib/host-state-model";

export default function AgreementSummary({ data }: { data: SharedState }) {
  const schedule = paymentSchedule(data);
  const money = (value: string) => value ? Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "Not set";
  return <section className="card" aria-label="Agreement to review">
    <div className="card-header"><h2 className="card-title">Agreement to review</h2></div>
    <div className="card-body space-y-4">
      <p className="font-semibold text-[14px]">{clubsDisplay(data.clubs) || "Add an organization"}</p>
      <dl className="grid gap-5 sm:grid-cols-3 text-[13px]">
        <div><dt className="field-label">Event</dt><dd>{formatDateISO(data.eventDate) || "Not set"}{data.startTime && ` · ${data.startTime}–${data.endTime}`}</dd></div>
        <div><dt className="field-label">Agreed rental fee</dt><dd className="font-semibold">{money(effectiveRentalPrice(data))}</dd><dd className="field-hint">Due {formatRentalDeadline(schedule.rentalDueDate, data.rentalPaymentTiming) || "2 days after the event ends"}</dd></div>
        <div><dt className="field-label">Security deposit</dt><dd className="font-semibold">{money(effective(data, "depositAmount"))}</dd><dd className="field-hint">Due {formatDateISO(schedule.depositDueDate) || "7 days before the event"}</dd></div>
      </dl>
      <p className="field-hint">The deposit is returned {data.rentalPaymentTiming === "day_before" ? "after the event and receipt of" : "upon receipt of"} the full rental fee, subject to the contract. Review the full PDF before creating links.</p>
    </div>
  </section>;
}
