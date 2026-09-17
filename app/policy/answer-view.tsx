import type { PolicyAnswer, PolicyChunk } from "@/lib/policy/answers";
export function PolicyAnswerView({ answer, chunks, date }: { answer: PolicyAnswer; chunks: PolicyChunk[]; date: string }) {
  const reference = (ref: string, quote: string) => {
    const chunk = chunks.find((c) => c.ref === ref);
    if (!chunk) return null;
    return <li key={`${ref}:${quote}`} className="mt-2 text-sm"><blockquote className="border-l-2 border-rule pl-3">{quote}</blockquote><a className="text-brand underline" href={`/api/policy/sources/${chunk.source_id}?date=${encodeURIComponent(date)}${chunk.locator.page ? `#page=${chunk.locator.page}` : ""}`}>{chunk.title} · {chunk.authority} · {chunk.version_label} · {Object.entries(chunk.locator).map(([k, v]) => `${k}: ${v}`).join(", ")}</a></li>;
  };
  return <section className="card"><div className="card-header"><h2 className="card-title">{answer.status.replaceAll("_", " ")}</h2><span className="card-subtitle">Policy date: {date}</span></div><div className="card-body space-y-5">
    <p>{answer.summary}</p>
    {answer.applicable_rules.length ? <div><h3 className="font-bold">Applicable rules</h3><ul className="space-y-4">{answer.applicable_rules.map((r, i) => <li key={i}><p>{r.rule}</p><ul>{r.citations.map((c) => reference(c.ref, c.quote))}</ul></li>)}</ul></div> : null}
    {answer.missing_information.length ? <div><h3 className="font-bold">Missing information</h3><ul className="list-disc pl-5">{answer.missing_information.map((m, i) => <li key={i}>{m}</li>)}</ul></div> : null}
    {answer.conflicts.length ? <div><h3 className="font-bold">Conflicts requiring officer review</h3>{answer.conflicts.map((c, i) => <div key={i}><p>{c.description}</p><ul>{c.citations.map((r) => reference(r.ref, r.quote))}</ul></div>)}</div> : null}
    <div><h3 className="font-bold">Next step</h3><p>{answer.next_step}</p></div><p className="border-t border-rule pt-4 text-sm text-muted">{answer.scope_notice}</p>
  </div></section>;
}
