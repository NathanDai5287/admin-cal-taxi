import "server-only";

import { backendKey, backendOrigin } from "./host-backend";

export type SigningPerson = {
  id?: number;
  email: string;
  name: string;
  status: string;
  link: string;
  copyToken?: string;
  sentAt?: string | null;
};

export type SigningRevision = {
  id: string;
  order_id: string;
  revision: number;
  state: string;
  original_sha256: string;
  envelope_id: string | null;
  recipients: SigningPerson[];
  signedCount: number;
  totalCount: number;
  files: { original: boolean; completed: boolean; audit: boolean };
  error: string | null;
  created_at: string;
};

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const origin = backendOrigin();
  const key = backendKey();
  if (!origin || !key) throw new Error("Host backend is not configured");
  const response = await fetch(`${origin}/api/orders${path}`, {
    method: init?.method ?? "GET",
    headers: { "X-Admin-Key": key, "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { detail?: string; error?: string };
    throw new Error(detail.detail ?? detail.error ?? `Signing service returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const base = (orderId: string) => `/${encodeURIComponent(orderId)}/signing`;

export async function listSigning(orderId: string) {
  const result = await call<{ revisions: SigningRevision[] }>(base(orderId));
  return result.revisions;
}

export async function prepareSigning(orderId: string, payload: Record<string, unknown>, requestKey: string, expectedLatestRevisionId: string) {
  const result = await call<{ revision: SigningRevision }>(`${base(orderId)}/prepare`, {
    method: "POST", body: { payload, requestKey, expectedLatestRevisionId },
  });
  return result.revision;
}

export async function createSigningLinks(orderId: string, revisionId: string, approvedSha256: string) {
  const result = await call<{ revision: SigningRevision }>(`${base(orderId)}/${encodeURIComponent(revisionId)}/create-links`, {
    method: "POST", body: { approvedSha256 },
  });
  return result.revision;
}

export async function syncSigning(orderId: string, revisionId: string) {
  const result = await call<{ revision: SigningRevision }>(`${base(orderId)}/${encodeURIComponent(revisionId)}/sync`, {
    method: "POST", body: {},
  });
  return result.revision;
}

export async function reconcileSigning(orderId: string, revisionId: string) {
  const result = await call<{ revision: SigningRevision }>(`${base(orderId)}/${encodeURIComponent(revisionId)}/reconcile`, {
    method: "POST", body: {},
  });
  return result.revision;
}

export async function markSigningLinkSent(orderId: string, revisionId: string, email: string, sent: boolean) {
  const result = await call<{ revision: SigningRevision }>(`${base(orderId)}/${encodeURIComponent(revisionId)}/link-delivery`, {
    method: "POST", body: { email, sent },
  });
  return result.revision;
}

export async function signingFile(orderId: string, revisionId: string, kind: "original" | "completed" | "audit") {
  const origin = backendOrigin();
  const key = backendKey();
  if (!origin || !key) throw new Error("Host backend is not configured");
  const response = await fetch(`${origin}/api/orders${base(orderId)}/${encodeURIComponent(revisionId)}/${kind}.pdf`, {
    headers: { "X-Admin-Key": key }, cache: "no-store", signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Signing PDF is unavailable (${response.status})`);
  return response;
}
