import { loadAllPages } from "@/lib/reimbursements/load-all-pages";
import HostHome from "@/components/host/HostHome";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createClient } from "@/lib/reimbursements/supabase/server";
import { personContactEmail } from "@/lib/people";

export default async function HostPage() {
  await requireAppAccess("host");
  const supabase = await createClient();
  const { data, error } = await loadAllPages((from, to) => supabase.from("profiles")
    .select("id, full_name, email, contact_email, phone, executive_roles")
    .is("removed_at", null)
    .order("full_name").order("id").range(from, to));
  if (error) throw new Error("Unable to load hosting contacts.");
  const contacts = data.map(person => ({
    id: person.id,
    name: person.full_name,
    contact: personContactEmail(person) || person.phone,
    executiveRoles: person.executive_roles,
  }));
  return <HostHome contacts={contacts} />;
}
