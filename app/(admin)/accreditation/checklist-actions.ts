"use server";

import { revalidatePath } from "next/cache";

import { accreditationEnabled } from "@/lib/accreditation/feature";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checklistReportPath, getChecklistReport, SUBMISSION_CHECKLIST_YEAR } from "@/lib/accreditation/submission-checklist";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { requireAppAccess } from "@/lib/reimbursements/auth";

export async function setAccreditationReportSubmitted(reportKey: string, submitted: boolean) {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  await requireAppAccess("accreditation", "write");

  if (typeof submitted !== "boolean" || !getChecklistReport(reportKey)) {
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

export async function linkChecklistDocumentType(formData: FormData) {
  if (!accreditationEnabled()) throw new Error("Accreditation is disabled.");
  await requireAppAccess("accreditation", "write");
  const report = getChecklistReport(formData.get("checklistReportKey"));
  if (!report) redirect("/accreditation");
  const path = checklistReportPath(report.key);
  const familyId = z.string().uuid().safeParse(formData.get("templateFamilyId"));
  if (!familyId.success) redirect(`${path}?result=link_error`);

  const result = await createAccreditationAdminClient().from("accreditation_template_families")
    .update({ checklist_report_key: report.key })
    .eq("id", familyId.data)
    .is("checklist_report_key", null)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) redirect(`${path}?result=link_error`);
  revalidatePath("/accreditation", "layout");
  redirect(`${path}?result=form_linked`);
}
