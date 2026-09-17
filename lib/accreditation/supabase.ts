import "server-only";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";

// Accreditation tables are introduced by their own migration. Keeping this
// client local prevents the hand-maintained legacy database type file from
// becoming the source of truth for this isolated subsystem.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function createAccreditationAdminClient(): any {
  return createAdminClient() as any;
}
