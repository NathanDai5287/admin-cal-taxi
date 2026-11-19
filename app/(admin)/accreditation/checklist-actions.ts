"use server";

import { revalidatePath } from "next/cache";

import { accreditationEnabled } from "@/lib/accreditation/feature";
import { SUBMISSION_CHECKLIST_REPORTS, SUBMISSION_CHECKLIST_YEAR } from "@/lib/accreditation/submission-checklist";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { requireAppAccess } from "@/lib/reimbursements/auth";

export async function setAccreditationReportSubmitted(reportKey: string, submitted: boolean) {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  await requireAppAccess("accreditation", "write");

  if (typeof submitted !== "boolean" || !SUBMISSION_CHECKLIST_REPORTS.some((report) => report.key === reportKey)) {
    return { error: "This report could not be updated." };
  }

  const { error } = await createAccreditationAdminClient()
    .from("accreditation_submission_checkmarks")
    .upsert({ academic_year: SUBMISSION_CHECKLIST_YEAR, report_key: reportKey, submitted });

  if (error) {
    console.error("Could not save accreditation submission status", error);
    return { error: "Couldn’t save this checkmark. Try again." };
  }

  revalidatePath("/accreditation");
  return { error: null };
}
