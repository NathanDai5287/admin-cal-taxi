"use client";

import { useEffect, useRef, useState } from "react";

import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export type AuthPillSession = {
  fullName: string;
  email: string;
  avatarUrl: string;
  role: "none" | "member" | "admin";
};

export type AuthPillProps = {
  session: AuthPillSession | null;
};

function firstName(fullName: string, email: string) {
  const trimmed = fullName.trim();
  if (trimmed) {
    return trimmed.split(/\s+/)[0] ?? trimmed;
  }
  const local = email.split("@")[0]?.trim();
  return local || "Account";
}

function initials(fullName: string, email: string) {
  const trimmed = fullName.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    if (first && second) {
      return (first + second).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "?").toUpperCase();
}

function Avatar({
  fullName,
  email,
  avatarUrl,
}: {
  fullName: string;
  email: string;
  avatarUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = avatarUrl.trim() !== "" && !failed;

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[9px] font-bold tracking-wide text-white"
    >
      {initials(fullName, email)}
    </span>
  );
}

// Two-click sign-out: the first click arms the pill (turns red, asks
// "Sign out?"), the second submits. Clicking away, pressing Escape, or
// waiting a few seconds disarms it.
function SignOutPill({ session }: { session: AuthPillSession }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setConfirming(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirming(false);
      }
    }

    const timer = window.setTimeout(() => setConfirming(false), 4000);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirming]);

  return (
    <span ref={rootRef}>
      {/* /auth/signout exists on the admin host and is rewritten to the
          submit app's sign-out route on the submit host. */}
      <form method="post" action="/auth/signout" className="m-0">
        <button
          type={confirming ? "submit" : "button"}
          onClick={confirming ? undefined : () => setConfirming(true)}
          title={confirming ? "Click again to sign out" : session.email}
          className={
            "inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 !rounded-full " +
            "cursor-pointer border transition-colors duration-150 " +
            (confirming
              ? "bg-red-700 border-red-700 text-white shadow-[0_4px_12px_rgba(185,28,28,0.35)] hover:bg-red-800 hover:border-red-800"
              : "bg-white border-rule text-ink shadow-[0_1px_3px_rgba(16,16,20,0.08)] " +
                "transition-[border-color,box-shadow,transform] " +
                "hover:border-[#a8a8ac] hover:-translate-y-px " +
                "hover:shadow-[0_4px_12px_rgba(16,16,20,0.12)]")
          }
        >
          {confirming ? (
            <span className="px-1.5 text-[11px] font-bold tracking-[0.14em] uppercase">
              Sign out?
            </span>
          ) : (
            <>
              <Avatar
                fullName={session.fullName}
                email={session.email}
                avatarUrl={session.avatarUrl}
              />
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase">
                {firstName(session.fullName, session.email)}
              </span>
            </>
          )}
        </button>
      </form>
    </span>
  );
}

export function AuthPill({ session }: AuthPillProps) {
  // Assume One Tap will show until it reports otherwise, so the fallback
  // button doesn't flash before Google's island appears.
  const [oneTapVisible, setOneTapVisible] = useState(true);
  const [oneTapError, setOneTapError] = useState<string | null>(null);

  return (
    <div
      className="fixed top-3 right-4 z-50"
      style={{
        fontFamily: 'Inter, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {session === null ? (
        <>
          <GoogleOneTap onVisibilityChange={setOneTapVisible} onError={setOneTapError} />
          {oneTapVisible ? null : (
            <div className="flex flex-col items-end gap-1.5">
              <GoogleSignInButton />
              {oneTapError ? (
                <p className="m-0 max-w-[240px] text-right text-[11px] leading-snug text-red-700">
                  Sign-in failed: {oneTapError}
                </p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <SignOutPill session={session} />
      )}
    </div>
  );
}
