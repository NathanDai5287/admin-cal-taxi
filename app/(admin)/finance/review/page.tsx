import { redirect } from "next/navigation";

export default async function ReimbursementsPage() {
  redirect("/finance/accounts/payable");
}
