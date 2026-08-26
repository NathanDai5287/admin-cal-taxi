"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (password.length < 10) {
      setMessage("Use at least 10 characters.");
      setPending(false);
      return;
    }
    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setPending(false);
      return;
    }

    router.push("/reimbursements/dashboard");
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" minLength={10} name="password" type="password" autoComplete="new-password" required />
      </div>
      <div className="field">
        <label htmlFor="confirmation">Confirm password</label>
        <input id="confirmation" minLength={10} name="confirmation" type="password" autoComplete="new-password" required />
      </div>
      {message && <p className="form-message">{message}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Saving…" : "Activate account"}
      </button>
    </form>
  );
}
