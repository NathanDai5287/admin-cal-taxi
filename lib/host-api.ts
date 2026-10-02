/**
 * Helpers for calling the Flask backend (via the /api/host/generate/*
 * rewrite in next.config.ts) and downloading the resulting PDF.
 */

export type ApiError = { error: string; detail?: string };
export type PdfFile = { filename: string; blob: Blob; generationReceipt?: string };

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
  return downloadPdf(await fetchGeneratedPdf(path, body));
}

/** Fetch first so related PDFs can be validated together before downloading. */
export async function fetchGeneratedPdf(path: string, body: unknown): Promise<PdfFile> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readPdfResponse(res);
}

/** Download an exact stored signing file without regenerating its contents. */
export async function downloadStoredPdf(path: string): Promise<{ filename: string }> {
  return downloadPdf(await fetchStoredPdf(path));
}

export async function fetchStoredPdf(path: string): Promise<PdfFile> {
  return readPdfResponse(await fetch(path, { cache: "no-store" }));
}

async function readPdfResponse(res: Response): Promise<PdfFile> {
  if (!res.ok) {
    let payload: ApiError;
    try {
      payload = (await res.json()) as ApiError;
    } catch {
      payload = { error: "request_failed", detail: `${res.status} ${res.statusText}` };
    }
    throw new ApiCallError(res.status, payload);
  }

  if (!res.headers.get("content-type")?.includes("application/pdf")) {
    throw new Error("The download did not return a PDF. Refresh the page and sign in again if needed.");
  }

  const blob = await res.blob();
  const filename = parseFilename(res.headers.get("content-disposition")) || "document.pdf";
  return { filename, blob, generationReceipt: res.headers.get("x-document-receipt") ?? undefined };
}

export function downloadPdf({ filename, blob }: PdfFile): { filename: string } {
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
