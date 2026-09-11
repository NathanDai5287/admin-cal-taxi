import type { Metadata } from "next";

import { addDuesBalance } from "@/app/(admin)/dues/actions";
import { DuesAnnouncement } from "@/app/(admin)/dues/dues-announcement";
import { DuesLedger } from "@/app/(admin)/dues/dues-ledger";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Dues Tracker" };
export const dynamic = "force-dynamic";

function currentPacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const feedback: Record<string, { text: string; success: boolean }> = {
  added: { text: "Member balance added.", success: true },
  saved: { text: "Member balance updated.", success: true },
  paid: { text: "Balance marked paid.", success: true },
  reopened: { text: "Balance moved back to outstanding.", success: true },
  deleted: { text: "Member balance removed.", success: true },
  invalid: { text: "Check the member, amount, and due date, then try again.", success: false },
  error: { text: "The balance could not be saved. Please try again.", success: false },
};

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ result }, supabase] = await Promise.all([searchParams, Promise.resolve(createAdminClient())]);
  const [receivablesResult, profilesResult] = await Promise.all([
    supabase
      .from("chapter_receivables")
      .select("id, member_name, amount_assessed, amount_paid, due_date, notes, discord_user_id")
      .order("due_date", { ascending: true })
      .order("member_name", { ascending: true }),
    supabase
      .from("profiles")
      .select("full_name")
      .is("removed_at", null)
      .order("full_name", { ascending: true }),
  ]);

  if (receivablesResult.error) {
    throw new Error(`Unable to load dues: ${receivablesResult.error.message}`);
  }

  const today = currentPacificDate();
  const rows = (receivablesResult.data ?? []).map((row) => {
    const assessed = Number(row.amount_assessed);
    const paid = Number(row.amount_paid);
    const amountOwed = Math.max(assessed - paid, 0);
    const isPaid = amountOwed <= 0;
    return {
      id: row.id,
      memberName: row.member_name,
      amountOwed,
      assessedAmount: assessed,
      dueDate: row.due_date,
      notes: row.notes,
      discordUserId: row.discord_user_id,
      isPaid,
      isOverdue: !isPaid && row.due_date < today,
    };
  });

  const outstandingRows = rows.filter((row) => !row.isPaid);
  const totalOutstanding = outstandingRows.reduce((sum, row) => sum + row.amountOwed, 0);
  const overdueRows = rows.filter((row) => row.isOverdue);
  const selectedFeedback = result ? feedback[result] : undefined;
  const members = (profilesResult.data ?? [])
    .map((profile) => profile.full_name.trim())
    .filter(Boolean);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Dues Tracker</h1>
          <p className="page-lede">Keep member balances current and see who still owes dues.</p>
        </div>
      </div>

      <section className="dues-summary" aria-label="Dues summary">
        <div className="dues-summary-primary">
          <span>Total outstanding</span>
          <strong>{formatMoney(totalOutstanding)}</strong>
          <p>{outstandingRows.length} active {outstandingRows.length === 1 ? "balance" : "balances"}</p>
        </div>
        <div>
          <span>Overdue</span>
          <strong className={overdueRows.length ? "text-warn" : ""}>{overdueRows.length}</strong>
          <p>{overdueRows.length ? formatMoney(overdueRows.reduce((sum, row) => sum + row.amountOwed, 0)) : "Nothing overdue"}</p>
        </div>
        <div>
          <span>Settled</span>
          <strong>{rows.filter((row) => row.isPaid).length}</strong>
          <p>Paid balances</p>
        </div>
      </section>

      <DuesAnnouncement
        channelConfigured={Boolean(process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID?.trim())}
        recipients={outstandingRows
          .filter((row) => /^\d{15,22}$/.test(row.discordUserId))
          .map((row) => ({
            id: row.id,
            memberName: row.memberName,
            amountOwed: row.amountOwed,
            discordUserId: row.discordUserId,
          }))}
        unlinkedCount={outstandingRows.filter((row) => !/^\d{15,22}$/.test(row.discordUserId)).length}
      />

      <section className="card" aria-labelledby="add-dues-title">
        <div className="card-header">
          <span className="card-title" id="add-dues-title">Add a member balance</span>
          <span className="card-subtitle">Enter what the member currently owes.</span>
        </div>
        <form action={addDuesBalance} className="card-body border-t border-rule pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="field">
              <label className="field-label" htmlFor="dues-member">Member</label>
              <input className="field-input" id="dues-member" list="chapter-members" maxLength={120} name="memberName" placeholder="Member name" required />
              <datalist id="chapter-members">{members.map((member) => <option key={member} value={member} />)}</datalist>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="dues-amount">Amount owed</label>
              <div className="money-input"><span>$</span><input className="field-input" id="dues-amount" min="0.01" name="amountOwed" placeholder="0.00" step="0.01" type="number" required /></div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="dues-date">Due date</label>
              <input className="field-input" defaultValue={today} id="dues-date" name="dueDate" type="date" required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="dues-discord">Discord member ID</label>
              <input className="field-input" id="dues-discord" inputMode="numeric" maxLength={25} name="discordUserId" placeholder="Paste ID or mention" />
              <p className="field-hint">Used to mention this member in announcements.</p>
            </div>
            <div className="field sm:col-span-2">
              <label className="field-label" htmlFor="dues-notes">Note</label>
              <input className="field-input" id="dues-notes" maxLength={500} name="notes" placeholder="Semester, payment plan, etc." />
            </div>
          </div>
          <div className="mt-5 flex min-h-[44px] flex-wrap items-center justify-between gap-5 border-t border-rule pt-4">
            <div aria-live="polite">
              {selectedFeedback ? (
                <p className={`form-message${selectedFeedback.success ? " success" : ""}`}>{selectedFeedback.text}</p>
              ) : null}
            </div>
            <Button type="submit" variant="primary">Add balance</Button>
          </div>
        </form>
      </section>

      <DuesLedger rows={rows} />
    </div>
  );
}
