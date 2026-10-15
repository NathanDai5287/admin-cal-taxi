import Link from "next/link";
import { contactSearchFilters } from "@/lib/mailing-list/contacts";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { MailingList } from "./mailing-list";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function MailingListPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin("/");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const requestedPage = Math.min(1_000_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const client = createAdminClient();
  const filters = contactSearchFilters(search);
  let countQuery = client.from("mailing_list_contacts").select("id", { count: "exact", head: true });
  for (const filter of filters) countQuery = countQuery.or(filter);
  const { count, error: countError } = await countQuery;
  if (countError) return <section className="card card-body" role="alert"><h1 className="page-title">Mailing List</h1><p>The mailing list could not be loaded. Please refresh and try again.</p><Link className="text-brand underline" href="/mailing-list">Try again</Link></section>;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  let query = client.from("mailing_list_contacts").select("id,first_name,last_name,email,phone,created_at,updated_at")
    .order("last_name").order("first_name").order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  for (const filter of filters) query = query.or(filter);
  const { data, error } = await query;
  if (error) throw new Error("The mailing list could not be loaded. Please try again.");
  return <MailingList contacts={data ?? []} count={count ?? 0} page={page} pages={pages} search={search} />;
}
