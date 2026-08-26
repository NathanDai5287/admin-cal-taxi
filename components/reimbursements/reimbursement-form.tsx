"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { categories, reimbursementSchema } from "@/lib/reimbursements/format";
import { createClient } from "@/lib/reimbursements/supabase/client";

const maxReceiptSize = 10 * 1024 * 1024;
const receiptTypes = new Set(["image/jpeg", "image/png"]);

export function ReimbursementForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setSuccess(false);

    try {
      const form = new FormData(event.currentTarget);
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
      if (!receiptTypes.has(receipt.type)) {
        throw new Error("Receipt must be a JPG or PNG image.");
      }
      if (receipt.size > maxReceiptSize) {
        throw new Error("Receipt must be smaller than 10 MB.");
      }

      const supabase = createClient();
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
      const userId = claimsData?.claims?.sub;
      if (claimsError || typeof userId !== "string") {
        throw new Error("Your session expired. Please sign in again.");
      }

      const extension = receipt.type === "image/png" ? "png" : "jpg";
      const receiptPath = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: reimbursement, error: insertError } = await supabase
        .from("reimbursements")
        .insert({
          user_id: userId,
          full_name: parsed.data.fullName,
          category: parsed.data.category,
          amount: parsed.data.amount,
          description: parsed.data.description,
          payment_method: parsed.data.paymentMethod,
          receipt_path: receiptPath,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const processResponse = await fetch(
        `/api/reimbursements/${reimbursement.id}/process`,
        { method: "POST" },
      );
      if (!processResponse.ok) {
        throw new Error("The reimbursement was saved, but receipt processing could not start.");
      }
      formRef.current?.reset();
      setMessage("Submitted. We’re checking the receipt now.");
      setSuccess(true);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit reimbursement.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} ref={formRef}>
      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input defaultValue={defaultName} id="fullName" name="fullName" required />
      </div>
      <div className="two-column-fields">
        <div className="field">
          <label htmlFor="category">Category</label>
          <select defaultValue="" id="category" name="category" required>
            <option disabled value="">Select one</option>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input id="amount" min="0.01" name="amount" placeholder="$0.00" step="0.01" type="number" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">What was this expense for?</label>
        <textarea id="description" maxLength={2000} name="description" required />
      </div>
      <div className="field">
        <label htmlFor="paymentMethod">Preferred payment method</label>
        <input id="paymentMethod" maxLength={200} name="paymentMethod" placeholder="Zelle, Venmo, check…" required />
      </div>
      <div className="field">
        <label htmlFor="receipt">Receipt image</label>
        <input accept="image/jpeg,image/png" id="receipt" name="receipt" type="file" required />
        <span className="helper-text">JPG or PNG, up to 10 MB.</span>
      </div>
      {message && <p className={`form-message${success ? " success" : ""}`}>{message}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Submitting…" : "Submit reimbursement"}
      </button>
    </form>
  );
}
