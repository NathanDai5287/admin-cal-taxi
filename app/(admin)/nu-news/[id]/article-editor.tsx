"use client";

import { Button } from "@/components/brand/button";
import { HEADSHOT_FOCUS, type NuNewsArticle } from "@/lib/nu-news/issue";

import { Field } from "./field";
import { PhotoField } from "./photo-field";

type ArticleEditorProps = {
  article: NuNewsArticle;
  position: number;
  count: number;
  headshotPreview: string | undefined;
  busy: boolean;
  onChange: (changes: Partial<NuNewsArticle>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onHeadshot: (file: File) => void;
};

export function ArticleEditor({ article, position, count, headshotPreview, busy, onChange, onMove, onRemove, onHeadshot }: ArticleEditorProps) {
  return (
    <article className="card-plain grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-bold text-ink">Article {position} · {article.title || "Untitled"}</h3>
        <div className="flex gap-2">
          <Button variant="secondary" compact disabled={position === 1} onClick={() => onMove(-1)}>Move up</Button>
          <Button variant="secondary" compact disabled={position === count} onClick={() => onMove(1)}>Move down</Button>
          <Button variant="danger" compact onClick={onRemove}>Remove</Button>
        </div>
      </div>
      <Field label="Title">
        <input className="field-input" value={article.title} onChange={(event) => onChange({ title: event.target.value })} />
      </Field>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="Author">
          <input className="field-input" value={article.author} onChange={(event) => onChange({ author: event.target.value })} />
        </Field>
        <Field label="Roster number" hint="For example, Nu 1048.">
          <input className="field-input" value={article.roster} onChange={(event) => onChange({ roster: event.target.value })} />
        </Field>
      </div>
      <PhotoField
        label="Headshot"
        photo={article.headshot}
        preview={headshotPreview}
        defaultFocus={HEADSHOT_FOCUS}
        pickerClassName="w-28"
        disabled={busy}
        onUpload={onHeadshot}
        onChange={(headshot) => onChange({ headshot })}
      />
      <Field label="Article text" hint="Paste the text exactly as the author wrote it. Each line becomes a paragraph. Empty lines are ignored.">
        <textarea className="field-textarea min-h-[280px]" value={article.body} onChange={(event) => onChange({ body: event.target.value })} />
      </Field>
      <Field label="Sign-off" hint="Each line prints on its own line, for example: YITB, then the name, then a phone number and email.">
        <textarea className="field-textarea" rows={3} value={article.closing} onChange={(event) => onChange({ closing: event.target.value })} />
      </Field>
    </article>
  );
}
