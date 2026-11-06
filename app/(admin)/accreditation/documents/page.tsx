import { requireAppAccess, hasAppAccess } from "@/lib/reimbursements/auth";
import { loadDocumentLibrary } from "@/lib/accreditation/document-store";
import type { DocumentLibraryData } from "@/lib/accreditation/document-ui-types";
import { DocumentLibrary } from "./document-library";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export default async function DocumentTypesPage() {
  const session = await requireAppAccess("accreditation");
  const data = await loadDocumentLibrary() as DocumentLibraryData;
  return <DocumentLibrary initial={data} canWrite={hasAppAccess(session, "accreditation", "write")} />;
}
