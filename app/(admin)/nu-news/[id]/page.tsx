import { notFound } from "next/navigation";
import { z } from "zod";

import { FinalIssue } from "@/app/(admin)/nu-news/[id]/final-issue";
import { IssueEditor } from "@/app/(admin)/nu-news/[id]/issue-editor";
import { photoSources } from "@/lib/nu-news/issue";
import { loadIssue, photoUrls } from "@/lib/nu-news/store";
import { requireAdmin } from "@/lib/reimbursements/auth";

export const dynamic = "force-dynamic";
// The preview and finalize actions on this page use this limit. Each downloads the photos, makes the PDF, and uploads it.
export const maxDuration = 60;

export default async function NuNewsIssuePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/");
  const { id } = await params;
  const stored = z.uuid().safeParse(id).success ? await loadIssue(id) : null;
  if (!stored) notFound();

  const photos = await photoUrls(photoSources(stored));
  if (stored.finalized_at && stored.finalized_by_name) {
    return <FinalIssue issueId={stored.id} issue={stored} photoUrls={photos} finalizedAt={stored.finalized_at} finalizedBy={stored.finalized_by_name} />;
  }
  return <IssueEditor issueId={stored.id} initialIssue={stored} photoUrls={photos} initialPreviewMadeAt={stored.preview_made_at} />;
}
