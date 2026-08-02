/**
 * Helpers for calling the Flask backend (via the /api/host/generate/*
 * rewrite in next.config.ts) and downloading the resulting PDF.
 */

export type ApiError = { error: string; detail?: string };

export class ApiCallError extends Error {
  status: number;
  payload: ApiError;
  constructor(status: number, payload: ApiError) {
    super(payload.detail || payload.error || `request failed (${status})`);
    this.status = status;
    this.payload = payload;
  }
}

/**
 * POST a JSON body to `path` and trigger a browser download of the
 * resulting PDF. The filename is taken from the Content-Disposition
 * header when the server provides one.
 *
 * On error, throws an `ApiCallError` with the JSON payload from the
 * server (suitable for surfacing in form-level error UI).
 */
export async function generatePdf(path: string, body: unknown): Promise<{ filename: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let payload: ApiError;
    try {
      payload = (await res.json()) as ApiError;
    } catch {
      payload = { error: "request_failed", detail: `${res.status} ${res.statusText}` };
    }
    throw new ApiCallError(res.status, payload);
  }

  const blob = await res.blob();
  const filename = parseFilename(res.headers.get("content-disposition")) || "document.pdf";

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename };
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(header);
  return m ? m[1] : null;
}
