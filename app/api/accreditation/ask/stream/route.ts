import { accreditationEnabled } from "@/lib/accreditation/feature";
import { MAX_CHAT_ATTACHMENT_TOTAL_BYTES } from "@/lib/accreditation/chat";
import { runAccreditationChat } from "@/lib/accreditation/chat-service";
import { getSessionProfile } from "@/lib/reimbursements/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_MULTIPART_BYTES = MAX_CHAT_ATTACHMENT_TOTAL_BYTES + 2 * 1024 * 1024;

class MultipartLimitError extends Error {}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    return false;
  }
}

async function readFormDataWithinLimit(request: Request) {
  if (!request.body) return new FormData();
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new Error("A multipart form is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      throw new MultipartLimitError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  }).formData();
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("This request is not allowed.", 403);

  const session = await getSessionProfile();
  if (!session) return jsonError("Sign in to use the assistant.", 401);
  if (session.profile.role !== "admin") return jsonError("This area is restricted to administrators.", 403);
  if (!accreditationEnabled()) return jsonError("Accreditation is disabled.", 404);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MULTIPART_BYTES) return jsonError("Attachments must total 20 MB or less.", 413);

  let formData: FormData;
  try {
    formData = await readFormDataWithinLimit(request);
  } catch (error) {
    if (error instanceof MultipartLimitError) return jsonError("Attachments must total 20 MB or less.", 413);
    return jsonError("The request could not be read.", 400);
  }

  const abortController = new AbortController();
  if (request.signal.aborted) abortController.abort(request.signal.reason);
  else request.signal.addEventListener("abort", () => abortController.abort(request.signal.reason), { once: true });
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      void runAccreditationChat(formData, {
        adminAuthorized: true,
        signal: abortController.signal,
        onTextDelta: (text) => send("delta", { text }),
      }).then((result) => {
        if (result.error) send("error", { error: result.error });
        else send("done", result);
      }).catch((error: unknown) => {
        console.error("Accreditation chat stream failed", error);
        send("error", { error: "The assistant could not answer right now. Please try again." });
      }).finally(() => {
        if (!cancelled) controller.close();
      });
    },
    cancel(reason) {
      cancelled = true;
      abortController.abort(reason);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
