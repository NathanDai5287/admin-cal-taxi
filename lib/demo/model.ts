import { z } from "zod";

export const STORAGE_KEY = "cal-taxi-portfolio-demo-v1";
const text = z.string().trim().min(1).max(200);
const money = z.number().finite().min(0).max(10000000);
export const expenseSchema = z.object({ id: text, member: text, merchant: text, category: text, amount: money, status: z.enum(["Pending", "Approved", "Denied", "Paid"]) });
export const memberSchema = z.object({ id: text, name: text, email: z.string().email(), role: z.enum(["Member", "Admin"]), dues: money, paid: money });
export const orderSchema = z.object({ id: text, organization: text, date: text, guests: z.number().int().min(1).max(200), total: money, deposit: money, status: z.enum(["Inquiry", "Draft", "Awaiting signature", "Confirmed", "Completed"]), notes: z.string().max(2000) });
export const demoSchema = z.object({
  version: z.literal(1),
  expenses: z.array(expenseSchema).max(500),
  members: z.array(memberSchema).max(500),
  orders: z.array(orderSchema).max(500),
  budgets: z.array(z.object({ category: text, amount: money })).max(20),
  leads: z.array(z.object({ id: text, name: text, year: text, interest: text, checkedIn: z.boolean() })).max(500),
  evidence: z.array(z.object({ id: text, title: text, category: text, approved: z.boolean() })).max(500),
  activity: z.array(z.string().max(300)).max(40),
});
export type DemoState = z.infer<typeof demoSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Member = z.infer<typeof memberSchema>;

export function createDemoState(): DemoState {
  return {
    version: 1,
    expenses: [
      { id: "EX-104", member: "Alex Morgan", merchant: "Campus Market", category: "Recruitment", amount: 186.42, status: "Pending" },
      { id: "EX-103", member: "Jordan Lee", merchant: "Bay Print Studio", category: "Recruitment", amount: 74.5, status: "Pending" },
      { id: "EX-102", member: "Sam Rivera", merchant: "Garden Supply", category: "House", amount: 243.8, status: "Approved" },
      { id: "EX-101", member: "Casey Park", merchant: "Community Kitchen", category: "Service", amount: 128, status: "Paid" },
      { id: "EX-100", member: "Taylor Brooks", merchant: "Campus Catering", category: "Social", amount: 460, status: "Paid" },
      { id: "EX-099", member: "Alex Morgan", merchant: "Hardware Corner", category: "House", amount: 89.95, status: "Paid" },
      { id: "EX-098", member: "Jordan Lee", merchant: "Event Supply", category: "Social", amount: 65, status: "Denied" },
    ],
    members: ["Alex Morgan", "Jordan Lee", "Sam Rivera", "Casey Park", "Taylor Brooks", "Jamie Chen", "Drew Ellis", "Morgan Reed"].map((name, i) => ({ id: `M-${i + 1}`, name, email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`, role: i === 0 ? "Admin" : "Member", dues: 650, paid: [650, 325, 650, 0, 650, 325, 650, 0][i] })),
    orders: [
      { id: "H-204", organization: "Campus Arts Collective", date: "2026-11-14", guests: 80, total: 720, deposit: 200, status: "Inquiry", notes: "Gallery night with student artists. Interested in the indoor space." },
      { id: "H-203", organization: "Berkeley Board Game Club", date: "2026-11-07", guests: 45, total: 340, deposit: 100, status: "Draft", notes: "Tables and chairs for a casual tournament." },
      { id: "H-202", organization: "Student Design Society", date: "2026-10-24", guests: 100, total: 850, deposit: 200, status: "Awaiting signature", notes: "Semester showcase. Contract ready for review." },
      { id: "H-201", organization: "Neighborhood Volunteers", date: "2026-10-17", guests: 60, total: 510, deposit: 150, status: "Confirmed", notes: "Volunteer appreciation dinner." },
    ],
    budgets: [{ category: "Recruitment", amount: 1500 }, { category: "House", amount: 2200 }, { category: "Service", amount: 800 }, { category: "Social", amount: 1800 }],
    leads: [
      { id: "R-1", name: "Avery Stone", year: "First year", interest: "Community service", checkedIn: true },
      { id: "R-2", name: "Riley West", year: "Second year", interest: "House tour", checkedIn: false },
      { id: "R-3", name: "Quinn Harper", year: "First year", interest: "Meet the chapter", checkedIn: false },
      { id: "R-4", name: "Parker Wells", year: "Transfer", interest: "Leadership", checkedIn: true },
    ],
    evidence: [
      { id: "E-1", title: "Fall community service recap", category: "Service", approved: true },
      { id: "E-2", title: "Officer training attendance", category: "Leadership", approved: true },
      { id: "E-3", title: "Semester financial review", category: "Finance", approved: false },
    ],
    activity: ["Sample workspace ready to explore.", "Neighborhood Volunteers booking confirmed.", "Community Kitchen reimbursement paid."],
  };
}

export function restoreDemoState(value: string | null): DemoState {
  try { return demoSchema.parse(JSON.parse(value ?? "null")); }
  catch { return createDemoState(); }
}

export function totals(state: DemoState) {
  const paidExpenses = state.expenses.filter(e => e.status === "Paid").reduce((n, e) => n + e.amount, 0);
  const collected = state.members.reduce((n, m) => n + m.paid, 0);
  return {
    collected,
    outstanding: state.members.reduce((n, m) => n + Math.max(0, m.dues - m.paid), 0),
    paidExpenses,
    cash: 4200 + collected - paidExpenses,
    pending: state.expenses.filter(e => e.status === "Pending").length,
  };
}

export function setExpenseStatus(state: DemoState, id: string, status: Expense["status"]): DemoState {
  const allowed: Record<Expense["status"], Expense["status"][]> = { Pending: ["Approved", "Denied"], Approved: ["Paid"], Denied: ["Pending"], Paid: [] };
  return { ...state, expenses: state.expenses.map(e => e.id === id && allowed[e.status].includes(status) ? { ...e, status } : e) };
}

export function recordDues(state: DemoState, id: string, amount: number): DemoState {
  const member = state.members.find(m => m.id === id);
  if (!member || !Number.isFinite(amount) || amount <= 0 || amount > member.dues - member.paid) throw new Error("Enter a payment greater than zero and no larger than the remaining balance.");
  return { ...state, members: state.members.map(m => m.id === id ? { ...m, paid: Math.round((m.paid + amount) * 100) / 100 } : m) };
}

export function csvCell(value: string | number) {
  const safe = String(value).replace(/^[=+@\-\t\r]/, "'$&");
  return `"${safe.replaceAll('"', '""')}"`;
}
