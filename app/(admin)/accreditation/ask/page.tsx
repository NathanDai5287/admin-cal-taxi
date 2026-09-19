import { PolicyChat } from "./policy-chat";

export const metadata = { title: "Ask policy" };

export default function AccreditationAskPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow">Accreditation assistant</p>
          <h1 className="page-title">Ask about policy</h1>
          <p className="page-lede">Ask a question, compare published policy, or bring a document or image into this chat.</p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-muted">Chats and attachments are not saved. Attached files are sent to the configured AI provider and used only while this page remains open.</p>
      </section>
      <PolicyChat />
    </div>
  );
}
