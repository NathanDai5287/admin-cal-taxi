"use client";
import { Button } from "@/components/brand/button";
import { PasteImageInput } from "@/components/forms/paste-image-input";

import { useEffect, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { prepareReceiptUpload, submitReimbursement } from "@/app/submit/actions";
import { categories, reimbursementSchema } from "@/lib/reimbursements/format";

import { prepareReceiptImage, receiptAccept, receiptFormat, receiptValidationError } from "@/lib/reimbursements/receipt-upload";
const paymentMethodStorageKey = "reimbursements.preferredPaymentMethod";
const receiptTypes = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];

export function SubmitForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [draggingReceipt, setDraggingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const paymentMethodRef = useRef<HTMLInputElement>(null);
  const rememberPaymentMethodRef = useRef<HTMLInputElement>(null);
  const [submitting, setPending] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const pending = submitting || navigating;
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const savedPaymentMethod = window.localStorage.getItem(paymentMethodStorageKey);
      if (!savedPaymentMethod || savedPaymentMethod.length > 200) return;

      if (paymentMethodRef.current) paymentMethodRef.current.value = savedPaymentMethod;
      if (rememberPaymentMethodRef.current) rememberPaymentMethodRef.current.checked = true;
    } catch {
      // Submission still works when browser storage is disabled.
    }
  }, []);

  function handleReceiptDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingReceipt(false);
    if (pending) return;

    const files = event.dataTransfer.files;
    const receipt = files[0];
    if (files.length !== 1) {
      setReceiptError("Drop one receipt image at a time.");
      return;
    }
    const error = receiptValidationError(receipt);
    if (error) {
      setReceiptError(error);
      return;
    }

    if (receiptRef.current) receiptRef.current.files = files;
    setReceiptError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setReceiptError("");
    setSuccess(false);

    try {
      const form = new FormData(event.currentTarget);

      const parsed = reimbursementSchema.safeParse({
        category: form.get("category"),
        amount: form.get("amount"),
        description: form.get("description"),
        paymentMethod: form.get("paymentMethod"),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the form fields.");
      }

      const receipt = form.get("receipt");
      if (!(receipt instanceof File) || receipt.size === 0) {
        throw new Error("Choose a receipt image.");
      }
      if (receiptFormat(receipt) === "heic") setMessage("Converting HEIC receipt to JPG…");
      const { blob, extension } = await prepareReceiptImage(receipt);
      setMessage("Uploading receipt…");

      // The receipt goes straight to Supabase Storage through a signed upload
      // URL, so large images never pass through the web server.
      const prepared = await prepareReceiptUpload(extension);
      if (!prepared.ok) throw new Error(prepared.message);

      const uploadUrl = new URL(
        `/storage/v1/object/upload/sign/receipts/${prepared.path}`,
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      );
      uploadUrl.searchParams.set("token", prepared.token);
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "content-type": blob.type, "x-upsert": "false" },
      });
      if (!uploadResponse.ok) {
        throw new Error("The receipt upload failed. Try submitting again.");
      }

      // Reuse the values captured before awaiting; currentTarget is cleared
      // after the event handler yields. The image is already in Storage.
      form.delete("receipt");
      form.set("receiptPath", prepared.path);
      const result = await submitReimbursement(form);
      if (!result.ok) throw new Error(result.message);

      const rememberPaymentMethod = form.get("rememberPaymentMethod") === "on";
      try {
        if (rememberPaymentMethod) {
          window.localStorage.setItem(paymentMethodStorageKey, parsed.data.paymentMethod);
        } else {
          window.localStorage.removeItem(paymentMethodStorageKey);
        }
      } catch {
        // Saving the preference is optional and must not invalidate a submission.
      }

      if (result.reimbursementId) {
        startNavigation(() => router.push(`/history/${result.reimbursementId}`));
        return;
      }

      formRef.current?.reset();
      if (rememberPaymentMethod && paymentMethodRef.current) {
        paymentMethodRef.current.value = parsed.data.paymentMethod;
      }
      if (rememberPaymentMethod && rememberPaymentMethodRef.current) {
        rememberPaymentMethodRef.current.checked = true;
      }
      setMessage(result.message);
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit reimbursement.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} ref={formRef}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label className="field-label" htmlFor="category">Category</label>
          <select className="field-input" defaultValue="" id="category" name="category" required>
            <option disabled value="">Select one</option>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="amount">Amount</label>
          <div className="money-input">
            <span>$</span>
            <input className="field-input" id="amount" min="0.01" name="amount" placeholder="0.00" step="0.01" type="number" required />
          </div>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="description">What was this expense for?</label>
        <textarea className="field-textarea" id="description" maxLength={2000} name="description" required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="paymentMethod">Zelle phone number or email</label>
        <input
          className="field-input"
          id="paymentMethod"
          maxLength={200}
          name="paymentMethod"
          placeholder="Phone number or email"
          ref={paymentMethodRef}
          required
        />
        <label className="check-row mt-1" htmlFor="rememberPaymentMethod">
          <input
            id="rememberPaymentMethod"
            name="rememberPaymentMethod"
            ref={rememberPaymentMethodRef}
            type="checkbox"
          />
          <span className="text-[12.5px] text-muted">Remember on this device for future submissions</span>
        </label>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="receipt">Receipt image</label>
        <div
          className={`border-2 border-dashed p-5 transition-colors ${draggingReceipt ? "border-brand bg-brand-light" : "border-rule bg-canvas"}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (pending || !event.dataTransfer.types.includes("Files")) return;
            dragDepth.current += 1;
            setDraggingReceipt(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = pending ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDraggingReceipt(false);
          }}
          onDrop={handleReceiptDrop}
        >
          <p className="mb-3 text-sm text-muted">
            {draggingReceipt ? "Drop your receipt here" : "Paste, drag, or choose a receipt image."}
          </p>
          <PasteImageInput
            accept={receiptAccept}
            acceptedTypes={receiptTypes}
            className="file-input"
            describedBy={`receipt-hint${receiptError ? " receipt-error" : ""}`}
            disabled={pending}
            id="receipt"
            inputRef={receiptRef}
            maxBytes={10 * 1024 * 1024}
            name="receipt"
            onChange={() => setReceiptError("")}
            required
            validationMessage="Choose a non-empty JPG, PNG, or HEIC image up to 10 MB."
          />
        </div>
        <span className="field-hint" id="receipt-hint">JPG, PNG, or HEIC, up to 10 MB. HEIC photos are converted to JPG for viewing. One receipt per submission.</span>
        {receiptError && <p className="text-sm text-warn" id="receipt-error" role="alert">{receiptError}</p>}
      </div>
      {message && <p className={`form-message${success ? " success" : ""}`} role="status">{message}</p>}
      {success && <Link href="/history" className="text-sm text-brand underline">View my reimbursements →</Link>}
      <Button variant="primary" disabled={pending} type="submit">
        {pending ? "Submitting…" : "Submit reimbursement"}
      </Button>
    </form>
  );
}
