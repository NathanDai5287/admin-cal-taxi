import type { ReportDefinition, ReportKey } from "./types";

export const REPORT_DEFINITIONS: Record<ReportKey, ReportDefinition> = {
  annual_report: {
    key: "annual_report",
    version: 1,
    name: "Annual Report",
    cadence: "annual",
    description: "Evidence-grounded narrative report for the academic year.",
    requiredSources: ["official_guideline", "chapter_evidence"],
    outputFormats: ["docx", "pdf"],
    fields: [
      { key: "executive_summary", label: "Executive summary", description: "Concise overview of the chapter year.", required: true, multiline: true },
      { key: "chapter_achievements", label: "Chapter achievements", description: "Material achievements supported by current-year evidence.", required: true, multiline: true },
      { key: "member_development", label: "Member development", description: "Educational, leadership, and brotherhood development.", required: true, multiline: true },
      { key: "community_impact", label: "Community impact", description: "Service, philanthropy, and campus impact.", required: true, multiline: true },
      { key: "risk_management", label: "Risk management", description: "Completed prevention and compliance work.", required: true, multiline: true },
      { key: "goals_next_year", label: "Goals for next year", description: "Specific forward-looking priorities grounded in current needs.", required: true, multiline: true },
    ],
  },
  annual_budget: {
    key: "annual_budget",
    version: 1,
    name: "Annual Budget",
    cadence: "annual",
    description: "Deterministic budget from a frozen Finance snapshot and officer overrides.",
    requiredSources: ["blank_template"],
    outputFormats: ["xlsx", "pdf"],
    fields: [
      { key: "chapter_name", label: "Chapter name", description: "Name from Finance settings.", required: true },
      { key: "academic_year", label: "Academic year", description: "Selected accreditation cycle.", required: true },
      { key: "opening_cash", label: "Opening cash", description: "Opening cash from the frozen Finance snapshot.", required: true },
      { key: "projected_income", label: "Projected income", description: "Forecast income, including a deterministic total.", required: true, multiline: true },
      { key: "planned_expenses", label: "Planned expenses", description: "Category allocations and deterministic total.", required: true, multiline: true },
      { key: "notes", label: "Budget notes", description: "Officer-supplied context or evidence-grounded notes.", required: false, multiline: true },
    ],
  },
  big_brother_contract: {
    key: "big_brother_contract",
    version: 1,
    name: "Big Brother Contract",
    cadence: "term",
    description: "Structured mentoring agreement with signature fields left blank.",
    requiredSources: ["blank_template"],
    outputFormats: ["docx", "pdf"],
    fields: [
      { key: "chapter_name", label: "Chapter name", description: "The chapter or organization name.", required: true },
      { key: "big_brother_name", label: "Big Brother", description: "Explicitly selected mentor name.", required: true },
      { key: "little_brother_name", label: "Little Brother", description: "Explicitly selected new-member name.", required: true },
      { key: "effective_date", label: "Effective date", description: "Explicit contract date.", required: true },
      { key: "mentor_commitments", label: "Mentor commitments", description: "Agreed mentor responsibilities.", required: true, multiline: true },
      { key: "member_commitments", label: "Member commitments", description: "Agreed new-member responsibilities.", required: true, multiline: true },
      { key: "signature_big_brother", label: "Big Brother signature", description: "Reserved for a real signature.", required: false, lockedBlank: true },
      { key: "signature_little_brother", label: "Little Brother signature", description: "Reserved for a real signature.", required: false, lockedBlank: true },
    ],
  },
};

export function getReportDefinition(key: string) {
  return REPORT_DEFINITIONS[key as ReportKey] ?? null;
}

