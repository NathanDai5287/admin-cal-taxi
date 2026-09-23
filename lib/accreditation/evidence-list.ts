export const EVIDENCE_SOURCE_COLUMNS = "id,original_name,processing_error,kind,template_family_id,report_key,status,processing_total,processing_completed,active_embedding_profile";
export const INITIAL_EVIDENCE_LIMIT = 1_000;
export const EVIDENCE_SEARCH_LIMIT = 100;

export type EvidenceSource = {
  id: string;
  original_name: string;
  processing_error: string | null;
  kind: string;
  template_family_id: string | null;
  report_key: string | null;
  status: string;
  processing_total: number;
  processing_completed: number;
  active_embedding_profile: string | null;
};
