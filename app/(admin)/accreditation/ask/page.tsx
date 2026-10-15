import { requireAppAccess } from "@/lib/reimbursements/auth";
import { redirect } from "next/navigation";

export default async function LegacyAskPolicyPage() {
  await requireAppAccess("accreditation");
  redirect("/ask-policy");
}
