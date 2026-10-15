"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contactSchema, MAX_IMPORT_ROWS, type ContactInput } from "@/lib/mailing-list/contacts";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

type Result = { ok: boolean; message: string };

export async function saveContact(input: ContactInput, id?: string): Promise<Result> {
  await requireAdmin("/");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (id !== undefined && !z.uuid().safeParse(id).success) return { ok: false, message: "This contact could not be found. Refresh the list." };
  const client = createAdminClient();
  const { data, error } = id
    ? await client.from("mailing_list_contacts").update(parsed.data).eq("id", id).select("id").maybeSingle()
    : await client.from("mailing_list_contacts").insert(parsed.data).select("id").single();
  if (error) return { ok: false, message: error.code === "23505" ? "This email address (or phone number for a contact without email) is already on the list. Edit the existing contact instead." : "The contact could not be saved. Please try again." };
  if (!data) return { ok: false, message: "This contact was removed. Refresh the list." };
  revalidatePath("/mailing-list");
  return { ok: true, message: id ? "Contact updated." : "Contact added. Ready for the next person." };
}

export async function importContacts(input: ContactInput[]): Promise<Result> {
  await requireAdmin("/");
  const parsed = z.array(contactSchema).min(1).max(MAX_IMPORT_ROWS).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the import preview and use up to 10,000 valid contacts." };
  const { data, error } = await createAdminClient().rpc("import_mailing_list_contacts", { contacts: parsed.data });
  if (error) return { ok: false, message: "The import could not be saved. No contacts were added. Please try again." };
  revalidatePath("/mailing-list");
  const skipped = parsed.data.length - data;
  return { ok: true, message: `${data.toLocaleString()} contact${data === 1 ? "" : "s"} added.${skipped ? ` ${skipped.toLocaleString()} already on the list skipped.` : ""}` };
}

export async function deleteContact(id: string): Promise<Result> {
  await requireAdmin("/");
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "This contact could not be found." };
  const { error } = await createAdminClient().from("mailing_list_contacts").delete().eq("id", id);
  if (error) return { ok: false, message: "The contact could not be removed. Please try again." };
  revalidatePath("/mailing-list");
  return { ok: true, message: "Contact removed." };
}
