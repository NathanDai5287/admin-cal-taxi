"use client";
import { useActionState } from "react";
import { askPolicy, type QuestionResult } from "./actions";
import { PolicyAnswerView } from "./answer-view";

export function QuestionForm() {
  const [result, action, pending] = useActionState(askPolicy, {} as QuestionResult);
  return <div className="space-y-6"><form action={action} className="card card-body space-y-4">
    <label className="field-label">Your question<textarea name="question" required minLength={5} maxLength={4000} rows={5} className="field-input" placeholder="Describe what you are planning. For events, include the venue, attendance, date, and whether alcohol is involved." /></label>
    <label className="field-label">Event or policy date (optional)<input type="date" name="date" className="field-input" /><span className="text-xs text-muted">Use this field for an event date. A date in your question is also used. With no date, policies are checked for today in the chapter time zone.</span></label>
    <p className="text-sm text-muted">Each question is independent. Questions and answers are saved for you and administrators to review.</p>
    <button disabled={pending} className="rounded bg-brand px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? "Checking published policies…" : "Ask policy assistant"}</button>
  </form><div aria-live="polite">{result.error ? <p role="alert" className="form-message">{result.error}</p> : null}{!pending && result.answer ? <PolicyAnswerView answer={result.answer} chunks={result.chunks ?? []} date={result.date ?? ""} /> : null}</div></div>;
}
