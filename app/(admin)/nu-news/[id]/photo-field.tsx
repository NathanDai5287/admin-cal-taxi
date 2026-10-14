export const PHOTO_ACCEPT = "image/*,.heic,.heif";

export function Thumbnail({ src, alt, className }: { src: string | undefined; alt: string; className: string }) {
  if (!src) return <div className={`${className} bg-canvas`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${className} bg-canvas object-cover`} loading="lazy" decoding="async" />;
}

type PhotoFieldProps = {
  label: string;
  preview: string | undefined;
  disabled: boolean;
  onUpload: (file: File) => void;
};

export function PhotoField({ label, preview, disabled, onUpload }: PhotoFieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <Thumbnail src={preview} alt={label} className="h-28 w-40 border border-rule" />
        <input
          aria-label={preview ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
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
    </div>
  );
}
