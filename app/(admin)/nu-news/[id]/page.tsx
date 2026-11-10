import { notFound } from "next/navigation";
import { z } from "zod";

import { FinalIssue } from "@/app/(admin)/nu-news/[id]/final-issue";
import { IssueEditor } from "@/app/(admin)/nu-news/[id]/issue-editor";
import { photoSources } from "@/lib/nu-news/issue";
import { loadIssue, pdfUrl, photoUrls } from "@/lib/nu-news/store";
import { requireAppAccess } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";
// The preview and finalize actions on this page use this limit. Each downloads the photos, makes the PDF, and uploads it.
export const maxDuration = 60;

export default async function NuNewsIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAppAccess("nu-news");
  const { id } = await params;
  const stored = z.uuid().safeParse(id).success ? await loadIssue(id) : null;
  if (!stored) notFound();

  if (stored.finalized_at) {
    const src = await pdfUrl(stored, 3_600, false);
    return <FinalIssue issueId={stored.id} season={stored.season} pdfSrc={src} />;
  }
  if (session.appAccess["nu-news"] !== "write") notFound();
  const photos = await photoUrls(photoSources(stored), 3_600);
  return <IssueEditor issueId={stored.id} initialIssue={stored} photoUrls={photos} initialPreviewMadeAt={stored.preview_made_at} />;
}
