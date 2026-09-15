"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/reimbursements/supabase/client";
import { clearLegacyHostOnlyAuthCookies } from "@/lib/reimbursements/supabase/cookie-options";

// Google Identity Services "One Tap": the native account-chooser island that
// appears automatically (top-right on desktop). The ID token it returns is
// exchanged for a Supabase session via signInWithIdToken.

type CredentialResponse = { credential: string };

type PromptMomentNotification = {
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (listener?: (notification: PromptMomentNotification) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const GIS_SCRIPT_ID = "google-identity-services";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// Supabase verifies the raw nonce; Google receives its SHA-256 hash as a
// lowercase hex string (Supabase hashes the raw nonce and compares hex).
async function generateNonce() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}

export type GoogleOneTapProps = {
  // Called with true when Google's prompt is on screen, false when it is
  // dismissed, skipped, or unavailable — the parent shows a fallback
  // sign-in button in the false case.
  onVisibilityChange?: (displayed: boolean) => void;
  // Called when the ID-token exchange with Supabase fails, so the parent
  // can surface the reason instead of failing silently.
  onError?: (message: string) => void;
};

export function GoogleOneTap({ onVisibilityChange, onError }: GoogleOneTapProps) {
  const startedRef = useRef(false);
  const visibilityRef = useRef(onVisibilityChange);
  const errorRef = useRef(onError);

  useEffect(() => {
    visibilityRef.current = onVisibilityChange;
    errorRef.current = onError;
  }, [onVisibilityChange, onError]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || startedRef.current) {
      if (!clientId) visibilityRef.current?.(false);
      return;
    }
    startedRef.current = true;

    async function start() {
      const { nonce, hashedNonce } = await generateNonce();

      const initialize = () => {
        if (!window.google) {
          visibilityRef.current?.(false);
          return;
        }
        window.google.accounts.id.initialize({
          client_id: clientId!,
          nonce: hashedNonce,
          // Chrome is phasing out third-party cookies; FedCM keeps One Tap working.
          use_fedcm_for_prompt: true,
          callback: async (response) => {
            clearLegacyHostOnlyAuthCookies();
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce,
            });
            if (error) {
              console.error("One Tap sign-in failed:", error);
              errorRef.current?.(error.message);
              visibilityRef.current?.(false);
              return;
            }
            // Reload so server components re-render with the new session.
            window.location.reload();
          },
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isDisplayed()) {
            visibilityRef.current?.(true);
          } else if (
            notification.isNotDisplayed() ||
            notification.isSkippedMoment() ||
            notification.isDismissedMoment()
          ) {
            visibilityRef.current?.(false);
          }
        });
      };

      if (document.getElementById(GIS_SCRIPT_ID)) {
        initialize();
        return;
      }
      const script = document.createElement("script");
      script.id = GIS_SCRIPT_ID;
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = initialize;
      script.onerror = () => visibilityRef.current?.(false);
      document.head.appendChild(script);
    }

    start();
  }, []);

  return null;
}
