export const REPORT_KEYS = [
  "annual_report",
  "annual_budget",
  "big_brother_contract",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];
export type ReportStatus =
  | "collecting"
  | "drafting"
  | "needs_input"
  | "ready_for_review"
  | "approved";
export type SourceKind =
  | "official_guideline"
  | "blank_template"
  | "prior_submission"
  | "chapter_evidence"
  | "app_snapshot";
export type TemplateFormat = "pdf" | "docx" | "xlsx";
export type FieldProvenance = "retrieved" | "app_snapshot" | "user_input";

export type CitationRef = {
  ref: string;
  sourceId?: string;
  locator?: Record<string, unknown>;
  excerpt?: string;
  provenance: FieldProvenance;
  appRecord?: Record<string, unknown>;
};

export type DraftField = {
  value: string;
  provenance: FieldProvenance;
  citations: string[];
  confidence: number;
  missingReason: string | null;
  officerOverride: boolean;
};

export type ReportDraft = {
  fields: Record<string, DraftField>;
};

export type ReportFieldDefinition = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  multiline?: boolean;
  lockedBlank?: boolean;
};

export type ReportDefinition = {
  key: ReportKey;
  version: number;
  name: string;
  cadence: "annual" | "term";
  description: string;
  requiredSources: SourceKind[];
  outputFormats: TemplateFormat[];
  fields: ReportFieldDefinition[];
};

export type ExtractedChunk = {
  ordinal: number;
  content: string;
  locator: Record<string, string | number>;
};

export type TemplateFieldMapping = {
  type?: "text";
  placeholder?: string;
  fieldName?: string;
  sheet?: string;
  cell?: string;
  page?: number;
  x?: number;
  y?: number;
  size?: number;
  maxWidth?: number;
};

export type TemplateMapping = Record<string, TemplateFieldMapping>;

export type TemplateInspection = {
  format: TemplateFormat;
  candidates: Record<string, TemplateFieldMapping>;
  warnings: string[];
};

export type RenderedTemplate = {
  bytes: Uint8Array;
  mimeType: string;
  extension: TemplateFormat;
};

