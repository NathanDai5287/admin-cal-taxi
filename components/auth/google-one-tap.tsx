"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/reimbursements/supabase/client";

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

// Supabase verifies the raw nonce; Google receives its SHA-256 hash.
async function generateNonce() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return { nonce, hashedNonce };
}

export type GoogleOneTapProps = {
  // Called with true when Google's prompt is on screen, false when it is
  // dismissed, skipped, or unavailable — the parent shows a fallback
  // sign-in button in the false case.
  onVisibilityChange?: (displayed: boolean) => void;
};

export function GoogleOneTap({ onVisibilityChange }: GoogleOneTapProps) {
  const startedRef = useRef(false);
  const visibilityRef = useRef(onVisibilityChange);

  useEffect(() => {
    visibilityRef.current = onVisibilityChange;
  }, [onVisibilityChange]);

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
          callback: async (response) => {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
              nonce,
            });
            if (error) {
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
