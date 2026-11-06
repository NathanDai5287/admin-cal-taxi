import "server-only";

import { z } from "zod";
import { createAccreditationAdminClient } from "./supabase";

/** Keep referenced originals and completed submissions; remove the reusable form from the library. */
export async function deleteSavedForm(idValue: string) {
  const id = z.string().uuid().parse(idValue);
  const db = createAccreditationAdminClient();
  const result = await db.from("accreditation_template_families")
    .update({ archived_at: new Date().toISOString() }).eq("id", id).is("archived_at", null);
  if (result.error) throw new Error("The saved form could not be deleted. Please retry.");
}
