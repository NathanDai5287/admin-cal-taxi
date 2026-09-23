/**
 * Shared configuration for the Flask backend (PDF generation + order
 * archive), used by the /api/host/generate proxy and lib/host-orders.ts.
 *
 * The admin key is a bearer credential: anyone holding it can mint signed
 * contracts and rewrite the order archive. It must never cross the network
 * in plaintext, so the origin must be HTTPS — except loopback, where plain
 * HTTP is fine for local backend development.
 *
 * Server-only module.
 */

export class BackendConfigError extends Error {}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

/**
 * Validated `HOST_BACKEND_ORIGIN` (normalized to a bare origin), or null
 * when unset. Throws BackendConfigError when set but not HTTPS — a loud
 * failure here beats silently shipping the admin key over plaintext.
 */
export function backendOrigin(): string | null {
  const raw = process.env.HOST_BACKEND_ORIGIN;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BackendConfigError(`HOST_BACKEND_ORIGIN is not a valid URL: ${raw}`);
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return url.origin;
  throw new BackendConfigError(
    `HOST_BACKEND_ORIGIN must use https (got ${url.protocol}//${url.host}); ` +
      "plain http is only allowed for loopback development.",
  );
}

/** `HOST_BACKEND_KEY`, or null when unset. */
export function backendKey(): string | null {
  return process.env.HOST_BACKEND_KEY || null;
}
