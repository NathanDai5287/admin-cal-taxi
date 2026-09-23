import { EvidenceLibraryContent } from "../../accreditation/library/evidence-library-content";

export const dynamic = "force-dynamic";

export default function AskPolicyEvidence({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  return <EvidenceLibraryContent searchParams={searchParams} basePath="/ask-policy/evidence" />;
}
