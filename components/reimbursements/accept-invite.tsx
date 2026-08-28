"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { acceptInvitation } from "@/app/reimbursements/auth/accept-invite/actions";
import { createClient } from "@/lib/reimbursements/supabase/client";

export function AcceptInvite({ tokenHash }: { tokenHash?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(tokenHash ? "" : "Verifying your invitation…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (tokenHash) return;

    async function verifyImplicitInvitation() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const errorCode = params.get("error_code");

      if (errorCode || !accessToken || !refreshToken) {
        setMessage(
          errorCode === "otp_expired"
            ? "This invitation has expired or was already used. Ask an administrator to send a new invitation."
            : "This invitation link is incomplete. Ask an administrator to send a new invitation.",
        );
        setFailed(true);
        return;
      }

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;

        router.replace("/reimbursements/auth/set-password");
        router.refresh();
      } catch {
        setMessage("This invitation could not be verified. Ask an administrator to send a new invitation.");
        setFailed(true);
      }
    }

    void verifyImplicitInvitation();
  }, [router, tokenHash]);

  if (tokenHash) {
    return (
      <>
        <p>Continue to activate your account and choose a password.</p>
        <form action={acceptInvitation} className="form-stack">
          <input name="tokenHash" type="hidden" value={tokenHash} />
          <button className="button button-primary" type="submit">Continue</button>
        </form>
      </>
    );
  }

  return (
    <>
      <p>{message}</p>
      {failed && (
        <div className="hero-actions">
          <Link className="button button-secondary" href="/reimbursements/login">Return to sign in</Link>
        </div>
      )}
    </>
  );
}
