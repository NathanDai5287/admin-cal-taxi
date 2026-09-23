import { EvidenceLibraryContent } from "./evidence-library-content";

export const dynamic = "force-dynamic";

export default function EvidenceLibrary({ searchParams }: { searchParams: Promise<{ cycle?: string; result?: string }> }) {
  return <EvidenceLibraryContent searchParams={searchParams} basePath="/accreditation/library" />;
}
