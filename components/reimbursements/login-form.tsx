"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/reimbursements/supabase/client";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="email">Email</label>
        <input
          className="field-input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">Password</label>
        <input
          className="field-input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {message && <p className="form-message">{message}</p>}
      <button className="btn-primary" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
