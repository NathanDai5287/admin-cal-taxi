import { requireAppAccess } from "@/lib/reimbursements/auth";
import { redirect } from "next/navigation";

export default async function ReimbursementsPage() {
  await requireAppAccess("finance");
  redirect("/finance/accounts/payable");
}
