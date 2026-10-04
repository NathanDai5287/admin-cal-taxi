import type { EmailRequest, EmailPreview } from "./host-email";

// Page-local only: private emails never enter storage, shared browser caches,
// or a process-wide server cache. Coalesce clicks with background requests.
export function createHostingPreviewCache() {
  const pending = new Map<string, Promise<EmailPreview[]>>();
  return {
    load(key: string, input: EmailRequest) {
      const found = pending.get(key); if (found) return found;
      const request = fetchHostingEmailPreview(input).then(result => {
        if (!result.ok) throw new Error(result.error);
        return result.data;
      });
      if (pending.size >= 32) pending.delete(pending.keys().next().value!);
      pending.set(key, request);
      void request.catch(() => { if (pending.get(key) === request) pending.delete(key); });
      return request;
    },
    clear() { pending.clear(); },
  };
}

export function createHostingDocumentCache() {
  const entries = new Map<string, { promise: Promise<string>; blob?: string }>();
  return {
    load(url: string) {
      url = new URL(url, window.location.href).href;
      const found = entries.get(url); if (found) return found.promise;
      const entry: { promise: Promise<string>; blob?: string } = { promise: Promise.resolve("") };
      entry.promise = fetch(url, { cache: "no-store" }).then(async response => {
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Could not load this PDF. Reload and retry.");
        const blob = URL.createObjectURL(await response.blob());
        if (entries.get(url) !== entry) { URL.revokeObjectURL(blob); throw new Error("Preview closed."); }
        entry.blob = blob; return blob;
      });
      if (entries.size >= 12) {
        const oldest = entries.keys().next().value!;
        const previous = entries.get(oldest); if (previous?.blob) URL.revokeObjectURL(previous.blob);
        entries.delete(oldest);
      }
      entries.set(url, entry);
      void entry.promise.catch(() => { if (entries.get(url) === entry) entries.delete(url); });
      return entry.promise;
    },
    ready(url: string) { return entries.get(new URL(url, window.location.href).href)?.blob; },
    clear() { for (const entry of entries.values()) if (entry.blob) URL.revokeObjectURL(entry.blob); entries.clear(); },
  };
}

export async function fetchHostingEmailPreview(input: EmailRequest): Promise<{ ok: true; data: EmailPreview[] } | { ok: false; error: string }> {
  const response = await fetch(`/api/host/orders/${encodeURIComponent(input.orderId)}/email-previews`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store",
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Could not load the preview. Reload and retry.");
  return response.json();
}
