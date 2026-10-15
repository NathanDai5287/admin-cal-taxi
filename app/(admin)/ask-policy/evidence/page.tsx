import { requireAppAccess } from "@/lib/reimbursements/auth";
import { EvidenceLibraryContent } from "../../accreditation/library/evidence-library-content";

export const dynamic = "force-dynamic";

export default async function AskPolicyEvidence({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  await requireAppAccess("ask-policy");
  return <EvidenceLibraryContent searchParams={searchParams} basePath="/ask-policy/evidence" />;
}
