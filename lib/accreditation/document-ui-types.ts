import type { AccreditationDocument } from "./document";
import type { ExampleAnalysis } from "./document-ai";

export type DocumentExample = {
  id: string; batch_id: string; family_id: string; original_name: string; size_bytes: number;
  uploadFamilyId: string | null;
  status: string; page_count: number | null; completedPages: number; analysis: ExampleAnalysis | null; error: string | null; retry_after: string | null;
};
export type DocumentFamily = { id: string; name: string; guidance: string; description: string };
export type DocumentYear = { id: string; label: string; starts_on: string; ends_on: string; academic_terms: Array<{ id: string; label: string; starts_on: string; ends_on: string }> };
export type DocumentLibraryData = {
  families: DocumentFamily[]; examples: DocumentExample[]; years: DocumentYear[];
  runs: Array<{ id: string; template_family_id: string; title: string; status: string; cycle_id: string; term_id: string | null }>;
  templates: Array<{ id: string; original_name: string }>; approved: Array<{ id: string; filename: string }>;
};
export type DocumentRequestInput = {
  id: string; runId: string; kind: "chat" | "save" | "pdf"; version: number;
  payload: { message?: string; document?: AccreditationDocument; exampleIds: string[] };
};
export type DocumentWorkspaceData = {
  run: { id: string; title: string; status: string; template_family_id: string; cycle_id: string; term_id: string | null };
  family: DocumentFamily;
  state: { document: AccreditationDocument | null; document_version: number; example_ids: string[]; readiness: { questions?: string[]; reviewNotes?: string[] } };
  messages: Array<{ id: string; role: string; content: string }>;
  examples: Array<{ id: string; original_name: string }>;
  revisions: Array<{ id: string; revision_number: number; document_version: number; accreditation_artifacts: Array<{ id: string; kind: string; filename: string }> }>;
  period: string;
  requests: Array<Omit<DocumentRequestInput, "runId"> & { status: string; error: string | null; lease_until: string | null }>;
};
