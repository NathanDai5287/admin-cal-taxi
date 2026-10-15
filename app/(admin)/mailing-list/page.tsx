import Link from "next/link";
import { contactSearchFilters } from "@/lib/mailing-list/contacts";
import { requireAppAccess } from "@/lib/reimbursements/auth";
import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { MailingList } from "./mailing-list";
import { BroadcastWorkspace } from "./broadcast-workspace";
import { broadcastsAreSetUp, broadcastSender, listBroadcasts, listGroups } from "@/lib/mailing-list/store";
import { listIssues } from "@/lib/nu-news/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const PAGE_SIZE = 50;

export default async function MailingListPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; tab?: string }> }) {
  const session = await requireAppAccess("mailing-list");
  const params = await searchParams;
  const tab = params.tab === "lists" ? "lists" : params.tab === "contacts" || params.q || params.page ? "contacts" : "broadcast";
  const navigation = <nav aria-label="Mailing workspace" className="mb-8 flex flex-wrap gap-x-6 border-b border-rule">{[["broadcast", "Broadcast email"], ["lists", "Mailing lists"], ["contacts", "Address book"]].map(([value, label]) => <Link key={value} className={`border-b-2 px-1 py-3 text-sm font-semibold ${tab === value ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`} aria-current={tab === value ? "page" : undefined} href={`/mailing-list?tab=${value}`}>{label}</Link>)}</nav>;
  if (tab !== "contacts") {
    if (!await broadcastsAreSetUp()) return <>{navigation}<section className="card card-body"><h1 className="page-title">Broadcast setup is pending</h1><p>The database owner needs to apply the mailing broadcasts migration before you can save lists and emails.</p><p className="text-sm text-muted">Migration: 20261014160000_mailing_broadcasts.sql</p><Link href="/mailing-list?tab=contacts" className="text-brand underline">Open the address book</Link></section></>;
    const [groups, broadcasts, issues] = await Promise.all([listGroups(), listBroadcasts(), session.appAccess["nu-news"] !== "none" ? listIssues() : Promise.resolve([])]);
    return <>{navigation}<BroadcastWorkspace key={tab} tab={tab} groups={groups} broadcasts={broadcasts} issues={issues} sender={broadcastSender()} /></>;
  }
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
  return <>{navigation}<MailingList contacts={data ?? []} count={count ?? 0} page={page} pages={pages} search={search} /></>;
}
