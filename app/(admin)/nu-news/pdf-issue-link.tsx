"use client";

import type { ReactNode, SyntheticEvent } from "react";

export function PdfIssueLink({ id, season, url, expiresAt, children }: {
  id: string;
  season: string;
  url?: string;
  expiresAt: number;
  children: ReactNode;
}) {
  const fallback = `/nu-news/${id}/pdf?view=1`;
  function checkExpiration(event: SyntheticEvent<HTMLAnchorElement>) {
    // Pages can remain open for hours. Refresh authorization through the old
    // route only when needed; ordinary clicks go straight to the stored PDF.
    if (Date.now() >= expiresAt) event.currentTarget.href = fallback;
  }
  return (
    <a className="nu-news-read-issue" href={url || fallback} target="_blank" rel="noopener noreferrer"
      aria-label={`Open ${season} PDF in a new tab`}
      onPointerDown={checkExpiration} onFocus={checkExpiration} onClick={checkExpiration}
      onAuxClick={checkExpiration} onContextMenu={checkExpiration}>
      {children}
    </a>
  );
}
