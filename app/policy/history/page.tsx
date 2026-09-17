import { policyClient, requirePolicyMember } from "@/lib/policy/server";
import { PolicyAnswerView } from "../answer-view";
import type { PolicyAnswer, PolicyChunk } from "@/lib/policy/answers";
export default async function PolicyHistory() {
  const session = await requirePolicyMember();
  const db = await policyClient();
  const result = await db.from("policy_questions").select("*").order("created_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Question history is temporarily unavailable.");
  return <div className="space-y-6"><h1 className="page-title">{session.profile.role === "admin" ? "Policy question audit" : "Your questions"}</h1><p className="text-muted">Latest 100 questions. Historical answers retain their original citations; retired source files are no longer available to members.</p>{(result.data ?? []).map((q: { id: string; question: string; question_date: string; created_at: string; member_id: string; answer: PolicyAnswer | null; retrieved_chunks: PolicyChunk[]; error: string | null }) => <details key={q.id} className="card card-body"><summary className="cursor-pointer font-bold">{q.question} <span className="text-xs text-muted">{q.created_at}</span></summary>{session.profile.role === "admin" ? <p className="text-xs">Member: {q.member_id}</p> : null}{q.answer ? <PolicyAnswerView answer={q.answer} chunks={q.retrieved_chunks} date={q.question_date} /> : <p>{q.error ?? "Question processing did not finish. Submit a new question to retry."}</p>}</details>)}</div>;
}
