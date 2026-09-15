import "server-only";

const pageSize = 1_000;

type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/** Reads past Supabase/PostgREST's per-response row limit without hiding data. */
export async function loadAllPages<T>(
  loadPage: (from: number, to: number) => PageResult<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return { data, error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null };
  }
}
