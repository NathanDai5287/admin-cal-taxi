"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SiteHomeIcon } from "@/components/site-home-icon";
import { ThemeToggle } from "@/components/theme-toggle";

export type AuthPillSession = {
  fullName: string;
  email: string;
  avatarUrl: string;
  role: "none" | "member" | "admin";
};

export type AuthPillProps = {
  memberSite?: boolean;
  session: AuthPillSession | null;
};

function MemberSiteBrand() {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <SiteHomeIcon label="Reimbursements home" />
      <span className="h-6 w-px flex-none bg-rule" aria-hidden="true" />
      <Link className="group flex min-w-0 items-baseline gap-3" href="/">
        <span className="text-[14px] font-bold uppercase tracking-[0.18em] text-ink transition-colors group-hover:text-brand">
          Theta Xi
        </span>
        <span className="hidden text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted sm:inline">
          Reimbursements
        </span>
      </Link>
    </div>
  );
}

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
      className="grid h-6 w-6 place-items-center rounded-full bg-action text-[9px] font-bold tracking-wide text-white"
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
  const formRef = useRef<HTMLFormElement>(null);
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
      <form ref={formRef} method="post" action="/auth/signout" className="m-0">
        {/* Always type="button": flipping to type="submit" inside the first
            click's handler lets that same click submit the form (activation
            behavior is evaluated after handlers run). Submit explicitly on
            the second click instead. */}
        <button
          type="button"
          onClick={() => {
            if (confirming) {
              formRef.current?.requestSubmit();
            } else {
              setConfirming(true);
            }
          }}
          title={confirming ? "Click again to sign out" : session.email}
          className={
            "relative inline-flex items-center gap-2 py-1.5 pl-1.5 pr-3.5 !rounded-full " +
            "cursor-pointer border duration-150 hover:-translate-y-px " +
            "transition-[background-color,border-color,color,box-shadow,transform] " +
            (confirming
              ? "bg-red-700 border-red-700 text-white shadow-[0_4px_12px_rgba(185,28,28,0.35)] hover:bg-red-800 hover:border-red-800"
              : "bg-surface border-rule text-ink shadow-[0_1px_3px_rgba(16,16,20,0.08)] " +
                "hover:border-brand hover:shadow-[0_4px_12px_rgba(16,16,20,0.12)]")
          }
        >
          {/* Both states render at all times with visibility toggled, so the
              pill's size is always driven by the avatar + name and never
              changes when the confirmation label appears. */}
          <span
            className="inline-flex items-center gap-2"
            style={{ visibility: confirming ? "hidden" : "visible" }}
          >
            <Avatar
              fullName={session.fullName}
              email={session.email}
              avatarUrl={session.avatarUrl}
            />
            <span className="text-[11px] font-bold tracking-[0.14em] uppercase">
              {firstName(session.fullName, session.email)}
            </span>
          </span>
          <span
            aria-hidden={!confirming}
            className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tracking-[0.14em] uppercase"
            style={{ visibility: confirming ? "visible" : "hidden" }}
          >
            Sign out?
          </span>
        </button>
      </form>
    </span>
  );
}

export function AuthPill({ memberSite = false, session }: AuthPillProps) {
  // Assume One Tap will show until it reports otherwise, so the fallback
  // button doesn't flash before Google's island appears.
  const [oneTapVisible, setOneTapVisible] = useState(true);
  const [oneTapError, setOneTapError] = useState<string | null>(null);

  return (
    <header
      className={
        memberSite
          ? "account-controls sticky top-0 z-50 border-t-[3px] border-t-brand px-4 py-3"
          : "pointer-events-none fixed inset-x-0 top-4 z-50 px-6"
      }
      style={{
        fontFamily: 'Inter, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <div className={memberSite
        ? "mx-auto flex min-h-[38px] w-full max-w-[1080px] items-center justify-between gap-4"
        : "pointer-events-auto mx-auto flex w-full max-w-[1080px] items-center justify-end gap-3"
      }>
        {memberSite ? <MemberSiteBrand /> : null}
        <div className="flex items-start justify-end gap-2">
          <ThemeToggle />
          {session === null ? (
            <>
              <GoogleOneTap onVisibilityChange={setOneTapVisible} onError={setOneTapError} />
              {oneTapVisible ? null : (
                <div className="flex flex-col items-end gap-1.5">
                  <GoogleSignInButton />
                  {oneTapError ? (
                    <p className="m-0 max-w-[240px] text-right text-[11px] leading-snug text-warn">
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
      </div>
    </header>
  );
}
