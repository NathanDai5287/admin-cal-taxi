"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AccessLevel } from "@/lib/app-access";

const WriteAccessContext = createContext(true);

export function useAppWriteAccess() {
  return useContext(WriteAccessContext);
}

export function AppAccessBoundary({ access, children, showReadOnlyNotice = true }: { access: AccessLevel | undefined; children: ReactNode; showReadOnlyNotice?: boolean }) {
  return (
    <WriteAccessContext value={access === "write"}>
      {access === "read" && showReadOnlyNotice && <p className="mb-5 border-b border-rule pb-3 text-sm text-muted" role="status">Read-only access. You can view this app, but cannot make changes.</p>}
      {children}
    </WriteAccessContext>
  );
}
