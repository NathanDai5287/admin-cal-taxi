import type { ReportDefinition, ReportDraft } from "./types";

export function parseOfficerOverrides(instruction: string, definition: ReportDefinition) {
  const aliases = new Map<string, string>();
  for (const field of definition.fields) {
    aliases.set(field.key.toLowerCase(), field.key);
    aliases.set(field.label.toLowerCase(), field.key);
  }
  const overrides: Record<string, string> = {};
  for (const line of instruction.split(/\r?\n/)) {
    const match = /^\s*([^:=]+?)\s*[:=]\s*(.+)\s*$/.exec(line);
    if (!match) continue;
    const key = aliases.get(match[1].trim().toLowerCase());
    if (key) overrides[key] = match[2].trim();
  }
  return overrides;
}

export function validateDraft(draft: ReportDraft, definition: ReportDefinition, templateAvailable: boolean) {
  const validation: Array<{ level: "error" | "warning"; field?: string; message: string }> = [];
  for (const field of definition.fields) {
    const value = draft.fields[field.key];
    if (field.lockedBlank && value.value) validation.push({ level: "error", field: field.key, message: `${field.label} must remain blank.` });
    if (field.required && !value.value) validation.push({ level: "error", field: field.key, message: value.missingReason || `${field.label} is required.` });
    if (definition.key === "annual_report" && value.value && !value.citations.length) validation.push({ level: "error", field: field.key, message: `${field.label} needs a current source citation.` });
  }
  if (!templateAvailable) validation.push({ level: "error", message: "Confirm an active official template before generating an artifact." });
  return validation;
}

