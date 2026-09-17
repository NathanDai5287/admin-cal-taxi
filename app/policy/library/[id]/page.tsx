import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/reimbursements/auth";
import { requirePolicyMember } from "@/lib/policy/server";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
export default async function ReviewPolicy({ params }: { params: Promise<{ id: string }> }) {
  await requirePolicyMember(); await requireAdmin("/");
  const { id } = await params;
  const db = createAccreditationAdminClient();
  const [doc, chunks] = await Promise.all([db.from("policy_documents").select("*").eq("id", id).single(), db.from("policy_chunks").select("ordinal,content,locator,embedding_profile").eq("source_id", id).order("ordinal")]);
  if (!doc.data) notFound();
  if (chunks.error) throw new Error("Extracted passages could not be loaded.");
  return <div className="space-y-5"><h1 className="page-title">{doc.data.title}</h1><a href={`/api/policy/sources/${id}`} className="text-brand underline">Download original for administrator review</a><p className="text-muted">Compare every passage and locator with the original before publishing. Extraction can omit text. If extraction is inaccurate, upload a corrected, signature-free source as a new draft.</p>{(chunks.data ?? []).map((c: { ordinal: number; content: string; locator: Record<string, unknown>; embedding_profile: string }) => <section key={c.ordinal} className="card card-body"><h2 className="font-bold">POL:{id}:{c.ordinal}</h2><p className="text-xs text-muted">{JSON.stringify(c.locator)} · {c.embedding_profile}</p><pre className="whitespace-pre-wrap break-words text-sm mt-4">{c.content}</pre></section>)}</div>;
}
