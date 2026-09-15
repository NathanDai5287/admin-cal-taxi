import { requireAdmin } from "@/lib/reimbursements/auth";
import type { Metadata } from "next";

import { addDuesBalance } from "@/app/(admin)/finance/accounts/receivable/actions";
import { BulkFeeForm } from "@/app/(admin)/finance/accounts/receivable/bulk-fee-form";
import { DuesAnnouncement } from "@/app/(admin)/finance/accounts/receivable/dues-announcement";
import { DuesLedger } from "@/app/(admin)/finance/accounts/receivable/dues-ledger";
import { Button } from "@/components/brand/button";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

export const metadata: Metadata = { title: "Accounts receivable" };
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
  "bulk-added": { text: "The fee was applied to every selected member.", success: true },
  saved: { text: "Member balance updated.", success: true },
  payment: { text: "Payment added to the balance.", success: true },
  paid: { text: "Balance marked paid.", success: true },
  reopened: { text: "Balance moved back to outstanding.", success: true },
  deleted: { text: "Member balance removed.", success: true },
  invalid: { text: "Check the entered amount and balance details, then try again.", success: false },
  "invalid-member": { text: "Choose an active registered member.", success: false },
  "invalid-amount": { text: "Enter an amount owed greater than $0.", success: false },
  "invalid-date": { text: "Choose a valid due date.", success: false },
  "invalid-notes": { text: "Keep the note under 500 characters.", success: false },
  "invalid-discord": { text: "Discord needs a numeric user ID or a pasted <@mention>, not a username.", success: false },
  error: { text: "The balance could not be saved. Please try again.", success: false },
};

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireAdmin();
  const [{ result }, supabase] = await Promise.all([searchParams, Promise.resolve(createAdminClient())]);
  const [receivablesResult, profilesResult] = await Promise.all([
    supabase
      .from("chapter_receivables")
      .select("id, member_id, member_name, amount_assessed, amount_paid, due_date, notes, discord_user_id")
      .order("due_date", { ascending: true })
      .order("member_name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("role", ["member", "admin"])
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
      memberId: row.member_id,
      memberName: row.member_name,
      amountOwed,
      assessedAmount: assessed,
      paidAmount: paid,
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
  const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const settledRows = rows.filter((row) => row.isPaid);
  const selectedFeedback = result ? feedback[result] : undefined;
  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }

  const discordIdsByMember = new Map<string, string>();
  for (const row of rows) {
    if (row.memberId && /^\d{15,22}$/.test(row.discordUserId)) discordIdsByMember.set(row.memberId, row.discordUserId);
  }
  const members = (profilesResult.data ?? []).flatMap((profile) => {
    const name = profile.full_name.trim();
    return name ? [{
      id: profile.id,
      name,
      email: profile.email,
      discordUserId: discordIdsByMember.get(profile.id) ?? "",
    }] : [];
  });

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Accounts receivable</h1>
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
          <span>Settled total</span>
          <strong>{formatMoney(totalPaid)}</strong>
          <p>{settledRows.length} fully paid {settledRows.length === 1 ? "balance" : "balances"}</p>
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

      <BulkFeeForm
        feedback={result === "bulk-added" ? selectedFeedback : undefined}
        members={members}
        today={today}
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
              <select className="field-input" id="dues-member" name="memberId" defaultValue="" required>
                <option value="" disabled>Choose a registered member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
              </select>
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
              <input
                className="field-input"
                id="dues-discord"
                inputMode="numeric"
                maxLength={25}
                name="discordUserId"
                pattern="(?:[0-9]{15,22}|<@!?[0-9]{15,22}>)"
                placeholder="Optional numeric ID"
                title="Enter a 15–22 digit Discord user ID or paste a Discord mention"
              />
              <p className="field-hint">Optional. Use Copy User ID in Discord; usernames cannot create targeted mentions.</p>
            </div>
            <div className="field sm:col-span-2">
              <label className="field-label" htmlFor="dues-notes">Note</label>
              <input className="field-input" id="dues-notes" maxLength={500} name="notes" placeholder="Semester, payment plan, etc." />
            </div>
          </div>
          <div className="mt-5 flex min-h-[44px] flex-wrap items-center justify-between gap-5 border-t border-rule pt-4">
            <div aria-live="polite">
              {selectedFeedback && result !== "bulk-added" ? (
                <p className={`form-message${selectedFeedback.success ? " success" : ""}`}>{selectedFeedback.text}</p>
              ) : null}
            </div>
            <Button type="submit" variant="primary">Add balance</Button>
          </div>
        </form>
      </section>

      <DuesLedger rows={rows} members={members} />
    </div>
  );
}
