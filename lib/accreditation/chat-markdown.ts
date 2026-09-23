export function safeMarkdownHref(href: string) {
  const value = href.trim();
  if (!value || /[\\\u0000-\u001f]/.test(value)) return "";
  if (value.startsWith("#")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isSafeSmallMermaid(source: string) {
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 2_400 || trimmed.split(/\r?\n/).length > 32) return false;
  if (/%%|<|\b(?:click|callback|href|javascript|data:)\b/i.test(trimmed)) return false;
  const firstLine = trimmed.split(/\r?\n/, 1)[0].trim();
  if (!/^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(firstLine) && !/^sequenceDiagram\b/i.test(firstLine)) return false;
  const arrowCount = (trimmed.match(/(?:-->|---|==>|-.->|->>|--\)|-\)|<<--|-->>)/g) ?? []).length;
  return arrowCount <= 20;
}
