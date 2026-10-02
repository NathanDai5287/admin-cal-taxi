import type { SigningRevision } from "./host-signing";

export type StoredContractDownload = {
  revisionId: string;
  revision: number;
  kind: "original" | "completed";
  state: string;
  previousSigned?: boolean;
};

/** Prefer the executed contract; an unsigned draft must never hide it. */
export function contractDownload(revisions: SigningRevision[]): StoredContractDownload | null {
  const selected = revisions.find(row => row.state === "signed")
    ?? revisions.find(row => ["awaiting_signatures", "preparing_completed_copy", "activating", "created", "creating", "creation_uncertain"].includes(row.state))
    ?? revisions[0];
  if (!selected) return null;
  const kind = selected.state === "signed" ? "completed" : "original";
  if (!selected.files[kind]) {
    throw new Error("The stored contract file is unavailable. Check signing history before downloading.");
  }
  return { revisionId: selected.id, revision: selected.revision, kind, state: selected.state,
    previousSigned: selected.state === "signed" && revisions.some(row => row.revision > selected.revision && ["awaiting_signatures", "preparing_completed_copy", "activating", "created", "creating", "creation_uncertain"].includes(row.state)) };
}
