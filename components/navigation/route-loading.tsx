export function RouteLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div aria-live="polite" className="mx-auto w-full max-w-[1080px] px-6 py-10">
      <div className="h-3 w-28 animate-pulse bg-rule" />
      <div className="mt-4 h-8 w-64 max-w-full animate-pulse bg-rule" />
      <p className="mt-4 text-sm text-muted">{label}</p>
    </div>
  );
}
