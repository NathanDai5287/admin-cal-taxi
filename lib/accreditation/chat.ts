import { z } from "zod";

export const MAX_CHAT_HISTORY_MESSAGES = 16;
export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

export const chatHistorySchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12_000),
})).max(MAX_CHAT_HISTORY_MESSAGES);

export const chatIntentSchema = z.object({
  needs_policy: z.boolean(),
  search_query: z.string().trim().max(1_000),
});

export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8_000),
  citations: z.array(z.object({
    ref: z.string().trim().min(1),
    quote: z.string().trim().min(8).max(1_000),
  })).max(12),
  follow_ups: z.array(z.string().trim().min(1).max(180)).max(3).optional(),
});

export type ChatHistoryMessage = z.infer<typeof chatHistorySchema>[number];
export type ChatCitation = z.infer<typeof chatAnswerSchema>["citations"][number];

export type ChatContext = {
  ref: string;
  content: string;
  title: string;
  kind: "policy" | "accreditation" | "attachment";
  subtitle: string;
  locator: Record<string, unknown>;
  sourceId?: string;
};

export type DocumentCitation = {
  key: string;
  title: string;
  kind: ChatContext["kind"];
  subtitle: string;
  locators: Record<string, unknown>[];
  sourceId?: string;
};

const documentExtensions = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".csv", ".json"];
const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

export function isSupportedChatAttachment(filename: string) {
  const lower = filename.toLowerCase();
  return [...documentExtensions, ...imageExtensions].some((extension) => lower.endsWith(extension));
}

export function isImageAttachment(filename: string, mimeType: string) {
  return mimeType.startsWith("image/") || imageExtensions.some((extension) => filename.toLowerCase().endsWith(extension));
}

export function cosineScore(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) return Number.NEGATIVE_INFINITY;
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function selectClosestContexts(contexts: ChatContext[], vectors: number[][], queryVector: number[], limit = 8) {
  if (contexts.length !== vectors.length) throw new Error("Every temporary context chunk must have an embedding.");
  return contexts
    .map((context, index) => ({ context, score: cosineScore(vectors[index], queryVector) }))
    .sort((a, b) => b.score - a.score || a.context.ref.localeCompare(b.context.ref))
    .slice(0, limit)
    .map(({ context }) => context);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

export function keepSupportedCitations(citations: ChatCitation[], contexts: ChatContext[]) {
  const byRef = new Map(contexts.map((context) => [context.ref, normalize(context.content)]));
  return citations.filter((citation) => {
    const content = byRef.get(citation.ref);
    return Boolean(content && normalize(citation.quote).length >= 8 && content.includes(normalize(citation.quote)));
  });
}

export function groupCitationsByDocument(citations: ChatCitation[], contexts: ChatContext[]): DocumentCitation[] {
  const byRef = new Map(contexts.map((context) => [context.ref, context]));
  const documents = new Map<string, DocumentCitation & { locatorKeys: Set<string> }>();
  for (const citation of citations) {
    const context = byRef.get(citation.ref);
    if (!context) continue;
    const attachmentRef = context.ref.split(":").slice(0, 2).join(":");
    const key = context.sourceId ? `${context.kind}:${context.sourceId}` : `${context.kind}:${attachmentRef}:${context.title}`;
    let document = documents.get(key);
    if (!document) {
      document = { key, title: context.title, kind: context.kind, subtitle: context.subtitle, locators: [], sourceId: context.sourceId, locatorKeys: new Set() };
      documents.set(key, document);
    }
    const locatorKey = JSON.stringify(context.locator);
    if (!document.locatorKeys.has(locatorKey)) {
      document.locatorKeys.add(locatorKey);
      document.locators.push(context.locator);
    }
  }
  return [...documents.values()].map((document) => ({
    key: document.key,
    title: document.title,
    kind: document.kind,
    subtitle: document.subtitle,
    locators: document.locators,
    sourceId: document.sourceId,
  }));
}

export function locatorLabel(locator: Record<string, unknown>) {
  return Object.entries(locator)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}
