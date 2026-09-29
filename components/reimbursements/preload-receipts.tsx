"use client";

import ReactDOM from "react-dom";

/** Start the first receipt requests while the table HTML is being parsed. */
export function PreloadReceipts({ urls }: { urls: string[] }) {
  for (const [index, url] of urls.entries()) {
    ReactDOM.preload(url, { as: "image", fetchPriority: index < 2 ? "high" : "low" });
  }
  return null;
}
