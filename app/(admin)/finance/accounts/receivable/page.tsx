import { requireAdmin } from "@/lib/reimbursements/auth";
import type { Metadata } from "next";

import { ChargeMembersForm } from "@/app/(admin)/finance/accounts/receivable/bulk-fee-form";
import { DuesAnnouncement } from "@/app/(admin)/finance/accounts/receivable/dues-announcement";
import { DuesBoard, type DuesBalanceNote } from "@/app/(admin)/finance/accounts/receivable/dues-board";
import { DuesLedger } from "@/app/(admin)/finance/accounts/receivable/dues-ledger";
import { formatMoney } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import { userLabel } from "@/lib/reimbursements/user-label";
import type { PaymentPlanFrequency } from "@/lib/reimbursements/dues-payment-plan";

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

export default async function DuesPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const [receivablesResult, profilesResult, notesResult] = await Promise.all([
    loadAllPages((from, to) => supabase
      .from("chapter_receivables")
      .select("id, member_id, member_name, amount_assessed, amount_paid, due_date, notes, discord_user_id, updated_at, payment_plan_frequency, payment_plan_amount, payment_plan_interval_days")
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
    loadAllPages((from, to) => supabase
      .from("chapter_receivable_notes")
      .select("id, receivable_id, body, author_name, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  if (receivablesResult.error) {
    throw new Error(`Unable to load dues: ${receivablesResult.error.message}`);
  }
  if (profilesResult.error) {
    throw new Error(`Unable to load members: ${profilesResult.error.message}`);
  }
  if (notesResult.error) {
    throw new Error(`Unable to load balance notes: ${notesResult.error.message}`);
  }

  const notesByBalance = new Map<string, DuesBalanceNote[]>();
  for (const note of notesResult.data) {
    const notes = notesByBalance.get(note.receivable_id) ?? [];
    notes.push({ id: note.id, body: note.body, authorName: note.author_name, createdAt: note.created_at });
    notesByBalance.set(note.receivable_id, notes);
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
      balanceNotes: notesByBalance.get(row.id) ?? [],
      noteRequestId: crypto.randomUUID(),
      discordUserId: row.discord_user_id,
      isPaid,
      isOverdue: !isPaid && row.due_date < today,
      paymentRequestId: crypto.randomUUID(),
      updatedAt: row.updated_at,
      paymentPlan: row.payment_plan_frequency ? {
        frequency: row.payment_plan_frequency as PaymentPlanFrequency,
        amount: Number(row.payment_plan_amount),
        intervalDays: row.payment_plan_interval_days,
      } : null,
    };
  });

  const outstandingRows = rows.filter((row) => !row.isPaid);
  const totalOutstanding = outstandingRows.reduce((sum, row) => sum + row.amountOwed, 0);
  const overdueRows = rows.filter((row) => row.isOverdue);
  const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const settledRows = rows.filter((row) => row.isPaid);

  return (
    <div className="grid gap-7">
      <div>
        <div>
          <h1 className="page-title">Dues</h1>
          <p className="page-lede">See what members owe, record payments, and add new dues when needed.</p>
        </div>
      </div>

      <section className="dues-summary dues-summary-compact" aria-label="Dues summary">
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

      <DuesBoard rows={rows} today={today}>
        <DuesLedger mode="manage" today={today} chargeForm={<ChargeMembersForm members={members} today={today} />} />
      </DuesBoard>

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
