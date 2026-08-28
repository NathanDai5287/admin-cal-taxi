"use client";

import { useEffect } from "react";

export function InviteHashRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const isInvite = params.get("type") === "invite";
    const hasInviteResult = params.has("access_token") || params.has("error");

    if (isInvite && hasInviteResult) {
      window.location.replace(`/reimbursements/auth/accept-invite${window.location.hash}`);
    }
  }, []);

  return null;
}
