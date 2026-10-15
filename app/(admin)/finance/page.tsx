import { requireAppAccess } from "@/lib/reimbursements/auth";
import { redirect } from "next/navigation";

export default async function FinancePage() {
  await requireAppAccess("finance"); redirect("/finance/planning"); }
