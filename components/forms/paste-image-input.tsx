"use client";

import { useEffect, useRef, useState, type ChangeEventHandler, type RefObject } from "react";
import Image from "next/image";

import { clipboardImage } from "@/lib/reimbursements/clipboard-image";
import { replaceImagePreviewUrl } from "@/lib/reimbursements/image-preview";
import { Button } from "@/components/brand/button";

type PasteImageInputProps = {
  accept: string;
  acceptedTypes: readonly string[];
  className?: string;
  disabled?: boolean;
  describedBy?: string;
  id: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  maxBytes: number;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  validationMessage: string;
};

export function PasteImageInput({
  accept,
  acceptedTypes,
  className,
  disabled,
  describedBy,
  id,
  inputRef,
  maxBytes,
  name,
  onChange,
  required,
  validationMessage,
}: PasteImageInputProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const activeRef = inputRef ?? localRef;
  const previewUrlRef = useRef("");
  const [pasteMessage, setPasteMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  function updatePreview(image?: File) {
    const nextUrl = replaceImagePreviewUrl(previewUrlRef.current, image);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function clearImage() {
    const input = activeRef.current;
    if (!input) return;
    // Clearing the value empties the file list; the change event lets this
    // component and any parent onChange handler reset their state.
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  useEffect(() => () => {
    replaceImagePreviewUrl(previewUrlRef.current);
  }, []);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (disabled) return;

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const image = clipboardImage(clipboardData.items);
      if (!image) return;

      event.preventDefault();
      if (!acceptedTypes.includes(image.type) || image.size === 0 || image.size > maxBytes) {
        setPasteMessage(validationMessage);
        return;
      }

      const input = activeRef.current;
      if (!input) return;

      const transfer = new DataTransfer();
      transfer.items.add(image);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setPasteMessage(`${image.name || "Pasted image"} is ready to upload.`);
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [acceptedTypes, activeRef, disabled, maxBytes, validationMessage]);

  return <>
    <input
      accept={accept}
      aria-describedby={describedBy}
      className={className}
      disabled={disabled}
      id={id}
      name={name}
      onChange={(event) => {
        setPasteMessage("");
        updatePreview(event.currentTarget.files?.[0]);
        onChange?.(event);
      }}
      ref={activeRef}
      required={required}
      type="file"
    />
    {previewUrl && (
      <>
        <div className="relative mt-3 h-72 w-full border border-rule bg-canvas">
          <Image
            alt="Selected receipt preview"
            className="object-contain"
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            src={previewUrl}
            unoptimized
          />
        </div>
        <Button className="mt-2" compact onClick={clearImage} type="button" variant="secondary">Remove image</Button>
      </>
    )}
    <p aria-live="polite" className="field-hint">{pasteMessage}</p>
  </>;
}
