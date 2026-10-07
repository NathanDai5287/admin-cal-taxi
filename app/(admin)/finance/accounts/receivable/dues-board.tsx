"use client";

import { createContext, useContext, useMemo, useOptimistic, type ReactNode } from "react";
import { compareDuesBalances, type DuesPaymentPlan } from "@/lib/reimbursements/dues-payment-plan";

export type DuesRow = {
  id: string;
  memberId: string | null;
  memberName: string;
  amountOwed: number;
  assessedAmount: number;
  paidAmount: number;
  dueDate: string;
  notes: string;
  discordUserId: string;
  isPaid: boolean;
  isOverdue: boolean;
  paymentRequestId: string;
  updatedAt: string;
  paymentPlan: DuesPaymentPlan | null;
  pending?: boolean;
};

type BulkEditChanges = {
  amountAssessed?: number;
  dueDate?: string;
  notes?: string;
};

export type RowMutation =
  | { type: "add"; rows: DuesRow[] }
  | { type: "set-paid"; ids: string[]; paid: boolean }
  | { type: "bulk-edit"; ids: string[]; changes: BulkEditChanges }
  | { type: "waive"; ids: string[] };

function sortRows(rows: DuesRow[]) {
  return [...rows].sort((a, b) => compareDuesBalances(a, b, "due-date"));
}

function markPaid(row: DuesRow, paid: boolean, today: string): DuesRow {
  const paidAmount = paid ? row.assessedAmount : 0;
  return {
    ...row,
    paidAmount,
    amountOwed: row.assessedAmount - paidAmount,
    isPaid: paid,
    isOverdue: !paid && row.dueDate < today,
    pending: true,
  };
}

function applyBulkEdit(row: DuesRow, changes: BulkEditChanges, today: string): DuesRow {
  const assessedAmount = changes.amountAssessed ?? row.assessedAmount;
  const amountOwed = Math.max(assessedAmount - row.paidAmount, 0);
  const dueDate = changes.dueDate ?? row.dueDate;
  const isPaid = amountOwed <= 0;
  return {
    ...row,
    assessedAmount,
    amountOwed,
    dueDate,
    notes: changes.notes ?? row.notes,
    isPaid,
    isOverdue: !isPaid && dueDate < today,
    pending: true,
  };
}

function reduceRows(rows: DuesRow[], mutation: RowMutation, today: string): DuesRow[] {
  switch (mutation.type) {
    case "add":
      return sortRows([...rows, ...mutation.rows]);
    case "waive":
      return rows.filter((row) => !mutation.ids.includes(row.id));
    case "set-paid":
      return rows.map((row) => mutation.ids.includes(row.id) ? markPaid(row, mutation.paid, today) : row);
    case "bulk-edit":
      return rows.map((row) => mutation.ids.includes(row.id) ? applyBulkEdit(row, mutation.changes, today) : row);
  }
}

type DuesRowsContextValue = {
  rows: DuesRow[];
  applyMutation: (mutation: RowMutation) => void;
};

const DuesRowsContext = createContext<DuesRowsContextValue | null>(null);

export function useDuesRows() {
  const value = useContext(DuesRowsContext);
  if (!value) throw new Error("Dues components must render inside DuesBoard.");
  return value;
}

export function DuesBoard({ children, rows, today }: {
  children: ReactNode;
  rows: DuesRow[];
  today: string;
}) {
  const [optimisticRows, applyMutation] = useOptimistic(
    rows,
    (current: DuesRow[], mutation: RowMutation) => reduceRows(current, mutation, today),
  );
  const value = useMemo(() => ({ rows: optimisticRows, applyMutation }), [optimisticRows, applyMutation]);
  return <DuesRowsContext.Provider value={value}>{children}</DuesRowsContext.Provider>;
}
