"use client";
import { useEffect } from "react";

export function ReaderTracking({ issueId, broadcastId }: { issueId: string; broadcastId: string | null }) {
  useEffect(() => {
    const query = broadcastId ? `?broadcast=${encodeURIComponent(broadcastId)}` : "";
    void fetch(`/news/${issueId}/view${query}`, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
  }, [issueId, broadcastId]);
  return null;
}
