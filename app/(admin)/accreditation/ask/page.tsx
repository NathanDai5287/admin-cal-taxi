import { PolicyChat } from "./policy-chat";
import { listAccreditationAskChats } from "./actions";

export const metadata = { title: "Ask policy" };

export default async function AccreditationAskPage() {
  const { chats, error } = await listAccreditationAskChats();
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow">Accreditation assistant</p>
          <h1 className="page-title">Ask about policy</h1>
          <p className="page-lede">Ask a question across published policy and accreditation evidence, or bring a document or image into this chat.</p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-muted">Your chat questions, answers, and citations are saved to your account. Attached files are temporary and need to be added again in a later session.</p>
      </section>
      <PolicyChat initialChats={chats} initialError={error} />
    </div>
  );
}
