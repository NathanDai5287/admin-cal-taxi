"use client";

import Image, { type StaticImageData } from "next/image";
import { useRef } from "react";

type LightboxImageProps = {
  alt: string;
  caption?: string;
  children?: React.ReactNode;
  className?: string;
  eager?: boolean;
  naturalAspect?: boolean;
  sizes: string;
  src: StaticImageData;
};

export function LightboxImage({
  alt,
  caption,
  children,
  className,
  eager = false,
  naturalAspect = false,
  sizes,
  src,
}: LightboxImageProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openLightbox = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };
  const closeLightbox = () => dialogRef.current?.close();

  return (
    <>
      <figure
        className={className}
        style={
          naturalAspect
            ? {
                aspectRatio: `${src.width} / ${src.height}`,
                flexBasis: 0,
                flexGrow: src.width / src.height,
              }
            : undefined
        }
      >
        <button
          type="button"
          className="lightbox-open"
          onClick={openLightbox}
          aria-label={`View full photograph: ${alt}`}
        >
          <Image
            alt={alt}
            fill
            fetchPriority={eager ? "high" : "auto"}
            loading={eager ? "eager" : "lazy"}
            sizes={sizes}
            src={src}
          />
        </button>
        {children}
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
      <dialog
        ref={dialogRef}
        className="lightbox"
        aria-label={alt}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeLightbox();
          }
        }}
      >
        <Image alt="" className="lightbox-full" src={src} />
        {caption ? <p className="lightbox-caption">{caption}</p> : null}
        <button type="button" className="lightbox-close" onClick={closeLightbox} autoFocus>
          Close
        </button>
      </dialog>
    </>
  );
}
