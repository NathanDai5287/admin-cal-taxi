import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { duesInstallments } from "../reimbursements/dues-payment-email";
import { paymentPlanFrequencyLabel, type PaymentPlanFrequency } from "../reimbursements/dues-payment-plan";
import { formatCategory } from "../reimbursements/format";
import { loadAllPages } from "../reimbursements/load-all-pages";
import { createAdminClient } from "../reimbursements/supabase/admin";
import type { Database } from "../reimbursements/supabase/database.types";

type Supabase = SupabaseClient<Database>;
type Caller = { userId: string; clientId: string };
type Tables = Database["public"]["Tables"];
type Charge = Tables["chapter_receivables"]["Row"];
type Payment = Tables["chapter_dues_payment_events"]["Row"];
type Note = Tables["chapter_receivable_notes"]["Row"];
type Reimbursement = Tables["reimbursements"]["Row"];
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });
const total = (amounts: number[]) => amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) / 100;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function authorize(supabase: Supabase, caller: Caller, tool: string, targetId: string) {
  const permission = await supabase.rpc("has_mcp_app_access", { app_key: "finance", required_access: "read" });
  if (permission.error || !permission.data) throw new Error("Finance read access is required.");
  const db = createAdminClient();
  const audit = await db.from("mcp_audit_log").insert({ user_id: caller.userId, client_id: caller.clientId, tool_name: tool, target_id: targetId });
  if (audit.error) throw new Error("The finance MCP call could not be recorded.");
  return db;
}

function chargeDetails(row: Charge, payments: Payment[], notes: Note[], asOfDate: string) {
  const paymentPlan = row.payment_plan_frequency ? {
    frequency: row.payment_plan_frequency as PaymentPlanFrequency,
    amount: Number(row.payment_plan_amount), intervalDays: row.payment_plan_interval_days,
    startDate: row.payment_plan_start_date!,
  } : null;
  const amountAssessed = Number(row.amount_assessed);
  const amountPaid = Number(row.amount_paid);
  const unpaidAmount = total([amountAssessed, -amountPaid]);
  const schedule = duesInstallments({ assessed: amountAssessed, paid: amountPaid, dueDate: row.due_date, plan: paymentPlan })
    .map((installment, index) => ({
      installment: index + 1, dueDate: installment.dueDate, amount: installment.amount,
      amountPaid: total([installment.amount, -installment.remaining]), remaining: installment.remaining,
      status: installment.status === "Paid" ? "paid" : row.waived_at ? "waived" : installment.status === "Part paid" ? "partially_paid" : "unpaid",
      overdue: !row.waived_at && installment.remaining > 0 && installment.dueDate < asOfDate,
    }));
  return {
    id: row.id, memberId: row.member_id, memberName: row.member_name, description: row.notes,
    amountAssessed, amountPaid, unpaidAmount, outstanding: row.waived_at ? 0 : unpaidAmount,
    status: row.waived_at ? "waived" : unpaidAmount === 0 ? "paid" : amountPaid > 0 ? "partially_paid" : "unpaid",
    currentDueDate: row.due_date, waivedAt: row.waived_at, waivedBy: row.waived_by,
    paymentPlan: paymentPlan ? { ...paymentPlan, frequencyLabel: paymentPlanFrequencyLabel(paymentPlan) } : null,
    schedule, nextPayment: row.waived_at ? null : schedule.find((installment) => installment.remaining > 0) ?? null,
    payments: payments.map((payment) => ({
      id: payment.id, amount: Number(payment.amount), type: payment.amount < 0 ? "reversal" : "payment",
      paidDate: payment.paid_date, dateIsEstimated: payment.date_is_estimated,
      recordedAt: payment.created_at, recordedBy: payment.recorded_by, recorderName: payment.recorder_name,
    })),
    notes: notes.map((note) => ({ id: note.id, body: note.body, authorId: note.created_by, authorName: note.author_name, createdAt: note.created_at })),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function loadChargeDetails(db: Supabase, charges: Charge[], asOfDate: string) {
  if (!charges.length) return [];
  const chargeIds = charges.map((charge) => charge.id);
  const [payments, notes] = await Promise.all([
    loadAllPages((from, to) => db.from("chapter_dues_payment_events").select("*").in("receivable_id", chargeIds)
      .order("paid_date").order("created_at").order("id").range(from, to)),
    loadAllPages((from, to) => db.from("chapter_receivable_notes").select("*").in("receivable_id", chargeIds)
      .order("created_at").order("id").range(from, to)),
  ]);
  if (payments.error || notes.error) throw new Error("The charge history could not be loaded.");
  return charges.map((charge) => chargeDetails(charge,
    payments.data.filter((payment) => payment.receivable_id === charge.id),
    notes.data.filter((note) => note.receivable_id === charge.id), asOfDate));
}

function reimbursementDetails(row: Reimbursement) {
  return {
    id: row.id, memberId: row.user_id, memberName: row.full_name,
    category: row.category, categoryLabel: formatCategory(row.category), description: row.description,
    amount: Number(row.amount), requestedAmount: row.requested_amount === null ? null : Number(row.requested_amount),
    status: row.status, merchant: row.merchant, approvalNote: row.approval_note, denialReason: row.denial_reason,
    reimbursed: row.reimbursed, reimbursedAt: row.reimbursed_at, paymentDateIsEstimated: row.reimbursement_date_is_estimated,
    paymentMethod: row.payment_method, receiptPath: row.receipt_path, receiptDate: row.receipt_date,
    receiptTotal: row.receipt_total === null ? null : Number(row.receipt_total), processingFailure: row.failure_reason,
    submittedAt: row.submitted_at, updatedAt: row.updated_at,
  };
}

async function memberFinances(db: Supabase, memberId: string) {
  const member = await db.from("profiles").select("id,full_name,email,removed_at").eq("id", memberId).maybeSingle();
  if (member.error) throw new Error("The member could not be loaded.");
  if (!member.data) throw new Error("Member not found. Use list_members to find a member ID.");
  const [charges, reimbursements] = await Promise.all([
    loadAllPages((from, to) => db.from("chapter_receivables").select("*").eq("member_id", memberId)
      .order("due_date").order("id").range(from, to)),
    loadAllPages((from, to) => db.from("reimbursements").select("*").eq("user_id", memberId)
      .order("submitted_at").order("id").range(from, to)),
  ]);
  if (charges.error || reimbursements.error) throw new Error("The member finances could not be loaded.");
  const asOfDate = today();
  const chargeDetails = await loadChargeDetails(db, charges.data, asOfDate);
  const requests = reimbursements.data;
  return {
    currency: "USD", asOfDate,
    member: { id: member.data.id, name: member.data.full_name, email: member.data.email, removedAt: member.data.removed_at },
    totals: {
      charges: {
        amountAssessed: total(chargeDetails.map((charge) => charge.amountAssessed)),
        amountPaid: total(chargeDetails.map((charge) => charge.amountPaid)),
        outstanding: total(chargeDetails.map((charge) => charge.outstanding)),
        waivedAmount: total(chargeDetails.filter((charge) => charge.status === "waived").map((charge) => charge.unpaidAmount)),
      },
      reimbursements: {
        requested: total(requests.map((row) => Number(row.requested_amount ?? row.amount))),
        approved: total(requests.filter((row) => row.status === "approved").map((row) => Number(row.amount))),
        paid: total(requests.filter((row) => row.reimbursed).map((row) => Number(row.amount))),
        payable: total(requests.filter((row) => row.status === "approved" && !row.reimbursed).map((row) => Number(row.amount))),
        pending: total(requests.filter((row) => row.status !== "approved" && row.status !== "denied").map((row) => Number(row.amount))),
        denied: total(requests.filter((row) => row.status === "denied").map((row) => Number(row.amount))),
      },
    },
    charges: chargeDetails, reimbursements: requests.map(reimbursementDetails),
  };
}

export function registerMemberFinanceTools(server: McpServer, supabase: Supabase, caller: Caller) {
  server.registerTool("list_member_charges", {
    description: "List all open and paid member charges with stable IDs. Supply memberId to get that member's complete finances, payment history, installment schedules, notes and reimbursements. Without memberId, returns the existing chapter charge list. Use get_member_charge for one charge's complete details.",
    inputSchema: z.object({ memberId: z.uuid().optional() }), annotations,
  }, async ({ memberId }) => {
    if (memberId) {
      const db = await authorize(supabase, caller, "list_member_charges", memberId);
      return result(await memberFinances(db, memberId));
    }
    const { data, error } = await supabase.rpc("mcp_admin_read", { p_resource: "member_charges" });
    if (error) throw new Error("The member charges could not be loaded.");
    return result(data);
  });

  server.registerTool("get_member_finances", {
    description: "Get one member's complete linked finance history: all charges including waived charges, payments and reversals, payment plans with every installment date and status, balance notes, reimbursements and separate totals. Use the memberId from list_members or list_member_charges. Includes historical and removed members; never matches unlinked records by name.",
    inputSchema: z.object({ memberId: z.uuid() }), annotations,
  }, async ({ memberId }) => {
    const db = await authorize(supabase, caller, "get_member_finances", memberId);
    return result(await memberFinances(db, memberId));
  });

  server.registerTool("get_member_charge", {
    description: "Get one charge's complete payment history, reversals, recorder names, estimated dates, balance notes, payment plan and full installment schedule. Use chargeId from list_member_charges. Includes waived and legacy unlinked charges; returns currentDueDate separately from the complete schedule.",
    inputSchema: z.object({ chargeId: z.uuid() }), annotations,
  }, async ({ chargeId }) => {
    const db = await authorize(supabase, caller, "get_member_charge", chargeId);
    const charge = await db.from("chapter_receivables").select("*").eq("id", chargeId).maybeSingle();
    if (charge.error) throw new Error("The charge could not be loaded.");
    if (!charge.data) throw new Error("Charge not found. Use list_member_charges to find a charge ID.");
    const asOfDate = today();
    const [details] = await loadChargeDetails(db, [charge.data], asOfDate);
    return result({ currency: "USD", asOfDate, charge: details });
  });
}
