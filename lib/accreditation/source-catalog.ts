export const MAX_SOURCE_CATALOG_ITEMS = 100;
const MAX_CATALOG_SECTION_CHARS = 3_400;

export type PolicyCatalogEntry = {
  id: string;
  title: string;
  authority: string;
  document_type: string;
  version_label: string;
  effective_from: string | null;
  effective_until: string | null;
  status: string;
  processing_state: string;
  active_embedding_profile: string | null;
};

export type AccreditationCatalogEntry = {
  id: string;
  original_name: string;
  kind: string;
  report_key: string | null;
  cycle_id: string;
  term_id: string | null;
  status: string;
  active_embedding_profile: string | null;
};

export function isUsablePolicyCatalogEntry(entry: PolicyCatalogEntry, date: string) {
  return entry.status === "published"
    && entry.processing_state === "ready"
    && Boolean(entry.active_embedding_profile)
    && Boolean(entry.effective_from && entry.effective_from <= date)
    && (!entry.effective_until || entry.effective_until >= date);
}

export function isUsableAccreditationCatalogEntry(entry: AccreditationCatalogEntry) {
  return entry.status === "ready"
    && entry.kind !== "blank_template"
    && Boolean(entry.active_embedding_profile);
}

function cleanLabel(value: string | null | undefined, limit = 120) {
  return (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
    .replace(/[\\`*_{}\[\]()!|]/g, "\\$&");
}

function metadataLink(label: string, path: string) {
  return `[${cleanLabel(label, 120)}](<${path}>)`;
}

function boundedLines(lines: string[], alreadyTruncated = false) {
  const visible: string[] = [];
  let characters = 0;
  for (const line of lines) {
    if (characters + line.length + 1 > MAX_CATALOG_SECTION_CHARS - 100) break;
    visible.push(line);
    characters += line.length + 1;
  }
  return { visible, truncated: alreadyTruncated || visible.length < lines.length };
}

export function buildSourceCatalogAnswer(input: {
  date: string;
  policy: PolicyCatalogEntry[];
  accreditation: AccreditationCatalogEntry[];
  policyTruncated?: boolean;
  accreditationTruncated?: boolean;
}) {
  const policyLines = input.policy.map((source) => {
    const href = `/api/policy/sources/${encodeURIComponent(source.id)}?date=${encodeURIComponent(input.date)}`;
    const details = [source.authority, source.version_label, source.document_type]
      .filter(Boolean)
      .map((value) => cleanLabel(value, 80))
      .filter(Boolean)
      .join(" · ");
    const effective = source.effective_until ? ` · Effective through ${cleanLabel(source.effective_until, 10)}` : " · No end date listed";
    return `- ${metadataLink(source.title || "Untitled policy document", href)}${details ? ` — ${details}` : ""} · Effective from ${cleanLabel(source.effective_from, 10)}${effective}`;
  });
  const accreditationLines = input.accreditation.map((source) => {
    const href = `/api/accreditation/sources/${encodeURIComponent(source.id)}`;
    const details = [source.kind.replaceAll("_", " "), source.report_key?.replaceAll("_", " "), `cycle ${source.cycle_id}`, source.term_id ? `term ${source.term_id}` : null]
      .filter((value): value is string => Boolean(value))
      .map((value) => cleanLabel(value, 50))
      .filter(Boolean)
      .join(" · ");
    return `- ${metadataLink(source.original_name, href)}${details ? ` — ${details}` : ""}`;
  });
  const policy = boundedLines(policyLines, input.policyTruncated);
  const accreditation = boundedLines(accreditationLines, input.accreditationTruncated);
  const rows = [
    `Available policy and accreditation sources as of ${input.date}.`,
    "This is a list of source metadata only. It does not establish which rule applies or approve an activity.",
    "",
    `### Published policy (${policy.visible.length}${policy.truncated ? "+" : ""})`,
  ];

  if (policy.visible.length) {
    rows.push(...policy.visible);
  } else {
    rows.push("- No currently effective published policy documents are available.");
  }
  if (policy.truncated) rows.push("- Additional policy documents are available beyond this list.");

  rows.push("", `### Accreditation evidence (${accreditation.visible.length}${accreditation.truncated ? "+" : ""})`);
  if (accreditation.visible.length) {
    rows.push(...accreditation.visible);
  } else {
    rows.push("- No currently usable accreditation evidence is available.");
  }
  if (accreditation.truncated) rows.push("- Additional accreditation sources are available beyond this list.");

  return rows.join("\n");
}
