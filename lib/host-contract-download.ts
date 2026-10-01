import type { SigningRevision } from "./host-signing";

export type StoredContractDownload = {
  revisionId: string;
  revision: number;
  kind: "original" | "completed";
  state: string;
};

/** Prefer the executed contract; an unsigned draft must never hide it. */
export function contractDownload(revisions: SigningRevision[]): StoredContractDownload | null {
  const selected = revisions.find(row => row.state === "signed") ?? revisions[0];
  if (!selected) return null;
  const kind = selected.state === "signed" ? "completed" : "original";
  if (!selected.files[kind]) {
    throw new Error("The stored contract file is unavailable. Check signing history before downloading.");
  }
  return { revisionId: selected.id, revision: selected.revision, kind, state: selected.state };
}
