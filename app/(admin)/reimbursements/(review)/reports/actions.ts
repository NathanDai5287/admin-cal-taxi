"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { categories } from "@/lib/reimbursements/format";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

const budgetKeys = ["overall", ...categories.map(([value]) => value)] as const;
const amountSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.coerce.number().min(0).max(999_999_999.99).nullable(),
);

function reportRedirectTarget(formData: FormData, result: "saved" | "invalid" | "error") {
  const requested = formData.get("returnTo");
  const fallback = "/reimbursements/reports";
  const target = typeof requested === "string" && requested.startsWith(`${fallback}?`)
    ? requested
    : fallback;
  const url = new URL(target, "http://local");
  url.searchParams.set("budget", result);
  return `${url.pathname}${url.search}`;
}

export async function saveReimbursementBudgets(formData: FormData) {
  await requireAdmin();

  const parsed = z.object(Object.fromEntries(
    budgetKeys.map((key) => [key, amountSchema]),
  ) as Record<(typeof budgetKeys)[number], typeof amountSchema>).safeParse(
    Object.fromEntries(budgetKeys.map((key) => [key, formData.get(key)])),
  );

  if (!parsed.success) redirect(reportRedirectTarget(formData, "invalid"));

  const supabase = createAdminClient();
  const { error } = await supabase.from("reimbursement_budgets").upsert(
    budgetKeys.map((budgetKey) => ({
      budget_key: budgetKey,
      amount: parsed.data[budgetKey],
      updated_by: null,
    })),
    { onConflict: "budget_key" },
  );

  if (error) redirect(reportRedirectTarget(formData, "error"));
  revalidatePath("/reimbursements/reports");
  redirect(reportRedirectTarget(formData, "saved"));
}
