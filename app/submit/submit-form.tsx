"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { prepareReceiptUpload, submitReimbursement } from "@/app/submit/actions";
import { categories, reimbursementSchema } from "@/lib/reimbursements/format";

const maxReceiptSize = 10 * 1024 * 1024;
const receiptTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
] as const);
const paymentMethodStorageKey = "reimbursements.preferredPaymentMethod";

export function SubmitForm({ defaultFullName }: { defaultFullName?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const paymentMethodRef = useRef<HTMLInputElement>(null);
  const rememberPaymentMethodRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSuccess(false);

    try {
      const form = new FormData(event.currentTarget);

      // Honeypot: pretend the submission worked and stop here.
      const honeypot = form.get("website");
      if (typeof honeypot === "string" && honeypot.trim() !== "") {
        formRef.current?.reset();
        setMessage("Submitted. We’re checking the receipt now.");
        setSuccess(true);
        return;
      }

      const parsed = reimbursementSchema.safeParse({
        fullName: form.get("fullName"),
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
      const extension = receiptTypes.get(receipt.type as "image/jpeg" | "image/png");
      if (!extension) {
        throw new Error("Receipt must be a JPG or PNG image.");
      }
      if (receipt.size > maxReceiptSize) {
        throw new Error("Receipt must be smaller than 10 MB.");
      }

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
        body: receipt,
        headers: { "content-type": receipt.type, "x-upsert": "false" },
      });
      if (!uploadResponse.ok) {
        throw new Error("The receipt upload failed. Try submitting again.");
      }

      const payload = new FormData(event.currentTarget);
      payload.set("receiptPath", prepared.path);
      const result = await submitReimbursement(payload);
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
      <div className="field">
        <label className="field-label" htmlFor="fullName">Full name</label>
        <input
          className="field-input"
          defaultValue={defaultFullName}
          id="fullName"
          name="fullName"
          required
        />
      </div>
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
        <label className="field-label" htmlFor="paymentMethod">Preferred payment method</label>
        <input
          className="field-input"
          id="paymentMethod"
          maxLength={200}
          name="paymentMethod"
          placeholder="Zelle, Venmo, check…"
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
        <input
          accept="image/jpeg,image/png"
          className="file-input"
          id="receipt"
          name="receipt"
          type="file"
          required
        />
        <span className="field-hint">JPG or PNG, up to 10 MB.</span>
      </div>
      {/* Honeypot: hidden from people, attractive to bots. */}
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto w-[1px] h-[1px] overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {message && <p className={`form-message${success ? " success" : ""}`} role="status">{message}</p>}
      <button className="btn-primary" disabled={pending} type="submit">
        {pending ? "Submitting…" : "Submit reimbursement"}
      </button>
    </form>
  );
}
