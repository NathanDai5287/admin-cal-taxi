import "server-only";
import { createAccreditationAdminClient } from "./supabase";
import type { ProcessingStatus } from "./processing-monitor";
export async function loadProcessingStatus(ids: string[], policy: boolean): Promise<ProcessingStatus[]> {
  const unique = [...new Set(ids)];
  const rows: ProcessingStatus[] = [];
  for (let offset = 0; offset < unique.length; offset += 1000) {
    const result = await createAccreditationAdminClient().rpc("ingestion_status_summary", { p_ids: unique.slice(offset, offset + 1000), p_policy: policy });
    if (result.error) throw new Error("Progress is temporarily unavailable");
    rows.push(...(result.data ?? []));
  }
  return rows;
}
