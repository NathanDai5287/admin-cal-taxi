"use client";

import { Button } from "@/components/brand/button";
import { CENTER_FOCUS, updateGalleryPhoto, type NuNewsGalleryPhoto } from "@/lib/nu-news/issue";
import { moved } from "@/lib/nu-news/moved";

import { FocusPicker, PHOTO_ACCEPT, photoElementId } from "./photo-field";

type GalleryEditorProps = {
  photos: NuNewsGalleryPhoto[];
  previews: Record<string, string>;
  busy: boolean;
  onChange: (photos: NuNewsGalleryPhoto[]) => void;
  onUpload: (files: File[]) => void;
};

export function GalleryEditor({ photos, previews, busy, onChange, onUpload }: GalleryEditorProps) {
  const update = (index: number, changes: Partial<NuNewsGalleryPhoto>) => onChange(updateGalleryPhoto(photos, index, changes));

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[13px] text-muted leading-relaxed">
        Photos fill the empty space at the bottom of article pages in this order, one to three per row, then the Photo Gallery pages.
        A full-width photo waits for the gallery and gets its own row there. The donate photo goes above How to Donate.
      </p>
      <input
        aria-label="Add gallery photos"
        className="file-input max-w-[420px] disabled:cursor-not-allowed disabled:opacity-50"
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        disabled={busy}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) onUpload(files);
        }}
      />
      {photos.length ? (
        <ol className="m-0 grid list-none gap-3 p-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.src} id={photoElementId(photo.src)} className="card-plain grid content-start gap-2 p-2">
              <FocusPicker
                src={previews[photo.src]}
                label={`Gallery photo ${index + 1}`}
                focus={photo.focus}
                defaultFocus={CENTER_FOCUS}
                className="w-full"
                onFocus={(focus) => update(index, { focus })}
              />
              <label className="check-row">
                <input type="checkbox" checked={photo.feature} onChange={(event) => update(index, { feature: event.target.checked })} />
                <span>Full width</span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={photo.donate} onChange={(event) => update(index, { donate: event.target.checked })} />
                <span>Donate photo</span>
              </label>
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" compact aria-label={`Move photo ${index + 1} earlier`} disabled={index === 0} onClick={() => onChange(moved(photos, index, -1))}>←</Button>
                <Button variant="secondary" compact aria-label={`Move photo ${index + 1} later`} disabled={index === photos.length - 1} onClick={() => onChange(moved(photos, index, 1))}>→</Button>
                <span className="flex-1 text-center text-[12px] text-muted tabular-nums">{index + 1}</span>
                <Button variant="text" aria-label={`Remove photo ${index + 1}`} onClick={() => onChange(photos.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
