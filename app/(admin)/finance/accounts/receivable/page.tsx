import { requireAdmin } from "@/lib/reimbursements/auth";
import type { Metadata } from "next";

import { ChargeMembersForm } from "@/app/(admin)/finance/accounts/receivable/bulk-fee-form";
import { DuesAnnouncement } from "@/app/(admin)/finance/accounts/receivable/dues-announcement";
import { DuesLedger } from "@/app/(admin)/finance/accounts/receivable/dues-ledger";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { userLabel } from "@/lib/reimbursements/user-label";

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
  added: { text: "Dues added to the selected members.", success: true },
  saved: { text: "Member balance updated.", success: true },
  payment: { text: "Payment added to the balance.", success: true },
  paid: { text: "Balance marked paid.", success: true },
  reopened: { text: "Balance moved back to outstanding.", success: true },
  deleted: { text: "Charge waived and removed from planned dues.", success: true },
  "bulk-paid": { text: "Selected balances cleared and marked fully paid.", success: true },
  "bulk-deleted": { text: "Selected charges waived and removed from planned dues.", success: true },
  invalid: { text: "Check the entered amount and balance details, then try again.", success: false },
  "invalid-member": { text: "Choose an active registered member.", success: false },
  "invalid-amount": { text: "Enter an amount owed greater than $0.", success: false },
  "invalid-date": { text: "Choose a valid due date.", success: false },
  "invalid-notes": { text: "Keep the note under 500 characters.", success: false },
  "member-selection-changed": { text: "The member list changed. Refresh the page and select the members again.", success: false },
  "charge-insert-failed": { text: "The charges could not be saved. No charges were added. Please try again.", success: false },
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
    loadAllPages((from, to) => supabase
      .from("chapter_receivables")
      .select("id, member_id, member_name, amount_assessed, amount_paid, due_date, notes, discord_user_id, updated_at")
      .is("waived_at", null)
      .order("due_date", { ascending: true })
      .order("member_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    loadAllPages((from, to) => supabase
      .from("profiles")
      .select("id, full_name, email, discord_user_id")
      .in("role", ["member", "admin"])
      .is("removed_at", null)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  if (receivablesResult.error) {
    throw new Error(`Unable to load dues: ${receivablesResult.error.message}`);
  }
  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }

  const members = (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    name: userLabel(profile.full_name, profile.email),
  }));
  const memberLabels = new Map(members.map((member) => [member.id, member.name]));

  const today = currentPacificDate();
  const rows = (receivablesResult.data ?? []).map((row) => {
    const assessed = Number(row.amount_assessed);
    const paid = Number(row.amount_paid);
    const amountOwed = Math.max(assessed - paid, 0);
    const isPaid = amountOwed <= 0;
    return {
      id: row.id,
      memberId: row.member_id,
      memberName: row.member_id ? memberLabels.get(row.member_id) ?? row.member_name : row.member_name,
      amountOwed,
      assessedAmount: assessed,
      paidAmount: paid,
      dueDate: row.due_date,
      notes: row.notes,
      discordUserId: row.discord_user_id,
      isPaid,
      isOverdue: !isPaid && row.due_date < today,
      paymentRequestId: crypto.randomUUID(),
      updatedAt: row.updated_at,
    };
  });

  const outstandingRows = rows.filter((row) => !row.isPaid);
  const totalOutstanding = outstandingRows.reduce((sum, row) => sum + row.amountOwed, 0);
  const overdueRows = rows.filter((row) => row.isOverdue);
  const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const settledRows = rows.filter((row) => row.isPaid);
  const selectedFeedback = result ? feedback[result] : undefined;

  return (
    <div className="grid gap-7">
      <div>
        <div>
          <p className="page-eyebrow">Chapter finances</p>
          <h1 className="page-title">Dues to collect</h1>
          <p className="page-lede">See what members owe, record payments, and add new dues when needed.</p>
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
          <span>Payments recorded</span>
          <strong>{formatMoney(totalPaid)}</strong>
          <p>{settledRows.length} fully paid {settledRows.length === 1 ? "balance" : "balances"}</p>
        </div>
      </section>

      <div className="border-t border-rule pt-7">
        <p className="page-eyebrow">Write access</p>
        <h2 className="mt-1 text-[18px] font-bold text-ink">Manage dues</h2>
        <p className="mt-1 text-[13px] text-muted">Add charges and make balance changes in this section.</p>
      </div>

      <ChargeMembersForm feedback={selectedFeedback} members={members} today={today} />

      <DuesLedger mode="manage" rows={rows} members={members} />

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
    </div>
  );
}
