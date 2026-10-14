import { Button } from "@/components/brand/button";
import type { Focus, NuNewsPhoto } from "@/lib/nu-news/issue";

export const PHOTO_ACCEPT = "image/*,.heic,.heif";

export const photoElementId = (src: string) => `photo-${src}`;

const FOCUS_STEP = 0.05;
const NUDGES: Partial<Record<string, Focus>> = {
  ArrowLeft: [-FOCUS_STEP, 0],
  ArrowRight: [FOCUS_STEP, 0],
  ArrowUp: [0, -FOCUS_STEP],
  ArrowDown: [0, FOCUS_STEP],
};

const toFraction = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

export function Thumbnail({ src, alt, className }: { src: string | undefined; alt: string; className: string }) {
  if (!src) return <div className={`${className} bg-canvas`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${className} bg-canvas object-cover`} loading="lazy" decoding="async" />;
}

type FocusPickerProps = {
  src: string | undefined;
  label: string;
  focus: Focus;
  defaultFocus: Focus;
  className: string;
  onFocus: (focus: Focus) => void;
};

export function FocusPicker({ src, label, focus, defaultFocus, className, onFocus }: FocusPickerProps) {
  return (
    <div className="grid justify-items-start gap-1">
      <button
        type="button"
        aria-label={`${label}: choose the focus point. Click the photo or use the arrow keys.`}
        className={`relative block cursor-crosshair bg-canvas p-0 ring-1 ring-rule focus-visible:ring-2 focus-visible:ring-brand ${className}`}
        onClick={(event) => {
          const fromKeyboard = event.detail === 0;
          if (fromKeyboard) return;
          const box = event.currentTarget.getBoundingClientRect();
          onFocus([toFraction((event.clientX - box.left) / box.width), toFraction((event.clientY - box.top) / box.height)]);
        }}
        onKeyDown={(event) => {
          const nudge = NUDGES[event.key];
          if (!nudge) return;
          event.preventDefault();
          onFocus([toFraction(focus[0] + nudge[0]), toFraction(focus[1] + nudge[1])]);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="block h-auto w-full" loading="lazy" decoding="async" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow"
          style={{ left: `${focus[0] * 100}%`, top: `${focus[1] * 100}%` }}
        />
      </button>
      <Button variant="text" onClick={() => onFocus(defaultFocus)}>Reset focus</Button>
    </div>
  );
}

type PhotoFieldProps = {
  label: string;
  photo: NuNewsPhoto | null;
  preview: string | undefined;
  defaultFocus: Focus;
  pickerClassName: string;
  disabled: boolean;
  onUpload: (file: File) => void;
  onChange: (photo: NuNewsPhoto) => void;
};

export function PhotoField({ label, photo, preview, defaultFocus, pickerClassName, disabled, onUpload, onChange }: PhotoFieldProps) {
  return (
    <div className="field" id={photo ? photoElementId(photo.src) : undefined}>
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap items-start gap-4">
        {photo ? (
          <FocusPicker
            src={preview}
            label={label}
            focus={photo.focus}
            defaultFocus={defaultFocus}
            className={pickerClassName}
            onFocus={(focus) => onChange({ ...photo, focus })}
          />
        ) : <Thumbnail src={undefined} alt={label} className="h-28 w-40 border border-rule" />}
        <input
          aria-label={photo ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          className="file-input max-w-[320px] disabled:cursor-not-allowed disabled:opacity-50"
          type="file"
          accept={PHOTO_ACCEPT}
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
      {photo ? <span className="field-hint">Click the photo to choose the spot that stays in view when it is cropped.</span> : null}
    </div>
  );
}
