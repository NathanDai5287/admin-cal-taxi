import { requireAppAccess, hasAppAccess } from "@/lib/reimbursements/auth";
import { loadDocumentLibrary } from "@/lib/accreditation/document-store";
import type { DocumentLibraryData } from "@/lib/accreditation/document-ui-types";
import { DocumentLibrary } from "./document-library";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export default async function DocumentTypesPage({ searchParams }: { searchParams: Promise<{ family?: string; cycle?: string }> }) {
  const session = await requireAppAccess("accreditation");
  const [data, { family, cycle }] = await Promise.all([loadDocumentLibrary() as Promise<DocumentLibraryData>, searchParams]);
  const selectedFamily = data.families.find((item) => item.id === family)?.id;
  const selectedYear = data.years.find((item) => item.id === cycle)?.id;
  return <DocumentLibrary key={`${selectedFamily ?? ""}:${selectedYear ?? ""}`} initial={data} initialFamilyId={selectedFamily} initialYearId={selectedYear} canWrite={hasAppAccess(session, "accreditation", "write")} />;
}
