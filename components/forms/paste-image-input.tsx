"use client";

import { useEffect, useRef, useState, type ChangeEventHandler, type RefObject } from "react";

import { clipboardImage } from "@/lib/reimbursements/clipboard-image";

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
  const [pasteMessage, setPasteMessage] = useState("");

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
        onChange?.(event);
      }}
      ref={activeRef}
      required={required}
      type="file"
    />
    <p aria-live="polite" className="field-hint">{pasteMessage}</p>
  </>;
}
