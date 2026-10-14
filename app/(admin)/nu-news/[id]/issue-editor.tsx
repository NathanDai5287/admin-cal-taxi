"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { finalizeIssue, makePreview, saveIssue } from "@/app/(admin)/nu-news/actions";
import { Button } from "@/components/brand/button";
import type { CropWarning } from "@/lib/nu-news/crop-warnings";
import { CENTER_FOCUS, HEADSHOT_FOCUS, missingItems, newArticle, type NuNewsArticle, type NuNewsIssue } from "@/lib/nu-news/issue";
import { moved } from "@/lib/nu-news/moved";
import { formatReimbursementDate } from "@/lib/reimbursements/format";

import { ArticleEditor } from "./article-editor";
import { Field, Section } from "./field";
import { GalleryEditor } from "./gallery-editor";
import { PhotoField, photoElementId } from "./photo-field";
import { uploadPhoto } from "./upload-photo";

type Notice = { text: string; success: boolean };

type IssueEditorProps = {
  issueId: string;
  initialIssue: NuNewsIssue;
  photoUrls: Record<string, string>;
  initialPreviewMadeAt: string | null;
};

const failure = (error: unknown) => ({ text: error instanceof Error ? error.message : "Something went wrong. Try again.", success: false });

function PhotoWarnings({ warnings }: { warnings: CropWarning[] }) {
  return (
    <ul className="m-0 grid list-disc gap-1 pl-5 text-[13.5px] text-caution">
      {warnings.map((warning) => (
        <li key={warning.src}>
          <button
            type="button"
            className="cursor-pointer text-left underline-offset-4 hover:underline"
            onClick={() => document.getElementById(photoElementId(warning.src))?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            {warning.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

function MissingItems({ items }: { items: string[] }) {
  if (!items.length) return <p className="m-0 text-[13.5px] text-ok">Nothing is missing. Make a preview, read it, then finalize.</p>;
  return (
    <ul className="m-0 grid list-disc gap-1 pl-5 text-[13.5px] text-warn">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function IssueEditor({ issueId, initialIssue, photoUrls, initialPreviewMadeAt }: IssueEditorProps) {
  const router = useRouter();
  const [issue, setIssue] = useState(initialIssue);
  const [savedIssue, setSavedIssue] = useState(initialIssue);
  const [previews, setPreviews] = useState(photoUrls);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [previewMadeAt, setPreviewMadeAt] = useState(initialPreviewMadeAt);
  const [warnings, setWarnings] = useState<CropWarning[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const busy = progress !== "";
  const unsaved = issue !== savedIssue;
  const missing = missingItems(issue);
  const pdfHref = `/nu-news/${issueId}/pdf`;

  const change = (changes: Partial<NuNewsIssue>) => setIssue((current) => ({ ...current, ...changes }));
  const changeArticle = (id: string, changes: Partial<NuNewsArticle>) => setIssue((current) => ({
    ...current,
    articles: current.articles.map((article) => (article.id === id ? { ...article, ...changes } : article)),
  }));

  async function upload(files: File[]) {
    setNotice(null);
    const sources: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress(files.length > 1 ? `Uploading photo ${index + 1} of ${files.length}…` : "Uploading photo…");
        const { src, preview } = await uploadPhoto(issueId, file);
        setPreviews((current) => ({ ...current, [src]: preview }));
        sources.push(src);
      }
    } catch (error) {
      setNotice(failure(error));
    } finally {
      setProgress("");
    }
    return sources;
  }

  async function run(label: string, task: () => Promise<Notice>) {
    setNotice(null);
    setProgress(label);
    try {
      setNotice(await task());
    } catch (error) {
      setNotice(failure(error));
    } finally {
      setProgress("");
    }
  }

  async function saveTask(): Promise<Notice> {
    const result = await saveIssue(issueId, issue);
    if (!result.ok) return { text: result.message, success: false };
    setSavedIssue(issue);
    return { text: "Saved.", success: true };
  }

  const save = () => run("Saving…", saveTask);

  const preview = () => run("Making the preview…", async () => {
    const saved = unsaved ? await saveTask() : null;
    if (saved && !saved.success) return saved;
    const result = await makePreview(issueId);
    if (!result.ok) return { text: result.message, success: false };
    setPreviewMadeAt(result.madeAt);
    setWarnings(result.warnings);
    setShowPreview(true);
    return { text: "The preview is ready.", success: true };
  });

  function finalize() {
    if (!window.confirm(`Finalize ${issue.season}? This saves the PDF permanently. You cannot change this issue after this.`)) return;
    return run("Finalizing…", async () => {
      const saved = unsaved ? await saveTask() : null;
      if (saved && !saved.success) return saved;
      const result = await finalizeIssue(issueId);
      if (!result.ok) return { text: result.message, success: false };
      router.refresh();
      return { text: "The issue is final.", success: true };
    });
  }

  function addArticle() {
    change({ articles: [...issue.articles, newArticle(crypto.randomUUID())] });
  }

  function removeArticle(article: NuNewsArticle) {
    if (article.body.trim() && !window.confirm(`Remove “${article.title || "Untitled"}” and its text?`)) return;
    change({ articles: issue.articles.filter((other) => other.id !== article.id) });
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link className="back-link" href="/nu-news">← All issues</Link>
        <h1 className="page-title">{issue.season || "Untitled issue"}</h1>
        <p className="page-lede">Paste each author’s writing exactly as they sent it. The PDF prints it without changes.</p>
      </div>

      <Section title="Issue details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Season">
            <input className="field-input" value={issue.season} placeholder="Fall 2026" onChange={(event) => change({ season: event.target.value })} />
          </Field>
          <Field label="Issue date">
            <input className="field-input" type="date" value={issue.issue_date} onChange={(event) => change({ issue_date: event.target.value })} />
          </Field>
          <Field label="Location">
            <input className="field-input" value={issue.location} onChange={(event) => change({ location: event.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Cover">
        <PhotoField
          label="Title photo"
          photo={issue.cover}
          preview={issue.cover ? previews[issue.cover.src] : undefined}
          defaultFocus={CENTER_FOCUS}
          pickerClassName="w-56"
          disabled={busy}
          onUpload={async (file) => {
            const [src] = await upload([file]);
            if (src) change({ cover: { src, focus: CENTER_FOCUS } });
          }}
          onChange={(cover) => change({ cover })}
        />
        <Field label="Intro heading">
          <input className="field-input" value={issue.intro.heading} placeholder="Happy Fall!" onChange={(event) => change({ intro: { ...issue.intro, heading: event.target.value } })} />
        </Field>
        <Field label="Intro text" hint="Each line becomes a paragraph. Empty lines are ignored.">
          <textarea className="field-textarea min-h-[140px]" value={issue.intro.body} onChange={(event) => change({ intro: { ...issue.intro, body: event.target.value } })} />
        </Field>
      </Section>

      <Section title="Articles">
        {issue.articles.map((article, index) => (
          <ArticleEditor
            key={article.id}
            article={article}
            position={index + 1}
            count={issue.articles.length}
            headshotPreview={article.headshot ? previews[article.headshot.src] : undefined}
            busy={busy}
            onChange={(changes) => changeArticle(article.id, changes)}
            onMove={(offset) => change({ articles: moved(issue.articles, index, offset) })}
            onRemove={() => removeArticle(article)}
            onHeadshot={async (file) => {
              const [src] = await upload([file]);
              if (src) changeArticle(article.id, { headshot: { src, focus: HEADSHOT_FOCUS } });
            }}
          />
        ))}
        <div>
          <Button variant="secondary" onClick={addArticle}>Add article</Button>
        </div>
      </Section>

      <Section title="Photos">
        <GalleryEditor
          photos={issue.gallery}
          previews={previews}
          busy={busy}
          onChange={(gallery) => change({ gallery })}
          onUpload={async (files) => {
            const sources = await upload(files);
            setIssue((current) => ({ ...current, gallery: [...current.gallery, ...sources.map((src) => ({ src, focus: CENTER_FOCUS, feature: false, donate: false }))] }));
          }}
        />
      </Section>

      <Section title="How to donate">
        <Field label="Heading">
          <input className="field-input" value={issue.donate.heading} onChange={(event) => change({ donate: { ...issue.donate, heading: event.target.value } })} />
        </Field>
        <Field label="Text" hint="Each line becomes one item. A new issue starts with the previous issue’s text.">
          <textarea className="field-textarea min-h-[120px]" value={issue.donate.body} onChange={(event) => change({ donate: { ...issue.donate, body: event.target.value } })} />
        </Field>
      </Section>

      {warnings.length ? (
        <Section title="Photo warnings">
          <p className="m-0 text-[13px] text-muted">From the last preview. These photos lose a large part when cropped. Warnings do not stop you from finalizing.</p>
          <PhotoWarnings warnings={warnings} />
        </Section>
      ) : null}

      <Section title="Before you finalize">
        <MissingItems items={missing} />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-t border-rule bg-surface px-6 py-3">
        <Button disabled={busy || !unsaved} onClick={save}>Save</Button>
        <Button variant="secondary" disabled={busy} onClick={preview}>Make preview</Button>
        <Button variant="secondary" disabled={busy || missing.length > 0} onClick={finalize}>Finalize</Button>
        <p aria-live="polite" className={`form-message ${notice?.success ? "success" : ""} ${busy || !notice ? "text-muted" : ""}`}>
          {progress || notice?.text || (unsaved ? "Unsaved changes" : "All changes saved")}
        </p>
        {previewMadeAt ? (
          <a className="ml-auto text-[13px] text-brand underline" href={pdfHref} target="_blank" rel="noreferrer">
            Open preview · made {formatReimbursementDate(previewMadeAt, true)}
          </a>
        ) : null}
      </div>

      {showPreview && previewMadeAt ? (
        <iframe className="h-[960px] w-full border border-rule bg-surface" src={`${pdfHref}?made=${encodeURIComponent(previewMadeAt)}`} title="Nu News preview" />
      ) : null}
    </div>
  );
}
