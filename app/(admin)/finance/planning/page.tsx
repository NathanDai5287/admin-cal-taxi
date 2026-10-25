import type { Metadata } from "next";

import { PlanVsActual } from "@/app/(admin)/finance/planning/plan-vs-actual";
import { requireAppAccess } from "@/lib/reimbursements/auth";

export const metadata: Metadata = { title: "Plan vs actual" };
export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const session = await requireAppAccess("finance");
  return <PlanVsActual editable={session.appAccess.finance === "write"} />;
}
