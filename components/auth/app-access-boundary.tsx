"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AccessLevel } from "@/lib/app-access";

const WriteAccessContext = createContext(true);

export function useAppWriteAccess() {
  return useContext(WriteAccessContext);
}

export function AppAccessBoundary({ access, readOnlyView, children }: { access: AccessLevel | undefined; readOnlyView?: ReactNode; children: ReactNode }) {
  return (
    <WriteAccessContext value={access === "write"}>
      {access === "read" && <p className="mb-5 border-b border-rule pb-3 text-sm text-muted" role="status">Read-only access. You can view this app, but cannot make changes.</p>}
      {access === "read" && readOnlyView ? readOnlyView : children}
    </WriteAccessContext>
  );
}
