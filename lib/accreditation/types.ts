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

export type DynamicFieldValueMode = "exact" | "narrative" | "signature" | "date" | "checkbox" | "choice";

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
  valueMode?: DynamicFieldValueMode;
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
  type?: "text" | "multiline" | "checkbox" | "choice" | "signature";
  placeholder?: string;
  /** DOCX paragraph anchor used when a template has no explicit placeholder. */
  paragraph?: number;
  fieldName?: string;
  sheet?: string;
  cell?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  normalizedX?: number;
  normalizedY?: number;
  normalizedWidth?: number;
  normalizedHeight?: number;
  size?: number;
  maxWidth?: number;
};

export type TemplateMapping = Record<string, TemplateFieldMapping>;

export type TemplateAnalysisField = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  multiline?: boolean;
  valueMode: DynamicFieldValueMode;
  target: TemplateFieldMapping | null;
  confidence: number;
  rationale: string;
};

export type TemplateAnalysis = {
  name: string;
  description: string;
  cadence?: "annual" | "term";
  fields: TemplateAnalysisField[];
  warnings: string[];
  model: string;
};

export type TemplateFamily = {
  id: string;
  name: string;
  description: string;
  archived_at?: string | null;
};

export type DynamicDraftField = DraftField & {
  label?: string;
  mode?: DynamicFieldValueMode;
};

export type DynamicDraft = {
  fields: Record<string, DynamicDraftField>;
};

export type TemplateInspection = {
  format: TemplateFormat;
  candidates: Record<string, TemplateFieldMapping>;
  warnings: string[];
  /** Human-readable structure passed to the model; never treated as instructions. */
  inventory?: string;
  tags?: string[];
};

export type RenderedTemplate = {
  bytes: Uint8Array;
  mimeType: string;
  extension: TemplateFormat;
};
