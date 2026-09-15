export const memberHistoryFilters = [
  ["all", "All"],
  ["progress", "In progress"],
  ["approved", "Approved"],
  ["paid", "Paid"],
  ["denied", "Denied"],
] as const;

export type MemberHistoryFilter = (typeof memberHistoryFilters)[number][0];

export type MemberHistoryRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  status: string;
  reimbursed: boolean;
  submitted_at: string;
};
