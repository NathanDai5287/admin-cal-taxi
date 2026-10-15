import { requireAppAccess } from "@/lib/reimbursements/auth";
import { EvidenceLibraryContent } from "./evidence-library-content";

export const dynamic = "force-dynamic";

export default async function EvidenceLibrary({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  await requireAppAccess("accreditation");
  return <EvidenceLibraryContent searchParams={searchParams} basePath="/accreditation/library" />;
}
