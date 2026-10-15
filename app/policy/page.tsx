import { requirePolicyMember } from "@/lib/policy/server";
import { QuestionForm } from "./question-form";
export default async function PolicyPage() {
  const session = await requirePolicyMember();
  return <div className="space-y-6"><section><p className="page-eyebrow">Published documents</p><h1 className="page-title">Policy assistant</h1><p className="page-lede">Understand the rules that apply to your question, with source passages you can check.</p></section><fieldset disabled={session.appAccess.policy !== "write"}><QuestionForm /></fieldset></div>;
}
