"use server";

import { z } from "zod";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { loadDuesEmailHistory } from "@/lib/reimbursements/dues-email-history";

export async function getDuesEmails(chargeId: string) {
  await requireAppAccess("finance");
  const id = z.uuid().parse(chargeId);
  try {
    return { messages: await loadDuesEmailHistory(id), error: null };
  } catch {
    return { messages: null, error: "Email history could not be loaded. Please try again." };
  }
}
