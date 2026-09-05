"use client";

import { useEffect, useRef, useState } from "react";

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

function hostOrigins() {
  const { protocol, hostname, host, port } = window.location;
  if (hostname.endsWith("localhost")) {
    return {
      adminOrigin: `${protocol}//${host}`,
      submitOrigin: `${protocol}//reimbursements.localhost:${port}`,
    };
  }
  return {
    adminOrigin: "https://admin.cal.taxi",
    submitOrigin: "https://reimbursements.cal.taxi",
  };
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

const menuItemClass =
  "block w-full px-4 py-2.5 text-left text-[13px] text-ink no-underline " +
  "hover:bg-brand-light transition-colors cursor-pointer";

function SignedInMenu({ session }: { session: AuthPillSession }) {
  const origins = session.role === "admin" ? hostOrigins() : null;

  return (
    <div
      role="menu"
      className="absolute right-0 mt-2 w-72 bg-white border border-rule shadow-[0_12px_32px_rgba(16,16,20,0.14)]"
    >
      <div className="px-4 py-3 border-b border-rule">
        <p className="m-0 text-[13.5px] font-semibold text-ink truncate">
          {session.fullName.trim() || firstName(session.fullName, session.email)}
        </p>
        <p className="m-0 mt-0.5 text-[12px] text-muted truncate">
          {session.email}
        </p>
      </div>
      {origins ? (
        <div className="py-1">
          <a role="menuitem" href={origins.adminOrigin} className={menuItemClass}>
            Admin dashboard
          </a>
          <a role="menuitem" href={origins.submitOrigin} className={menuItemClass}>
            Submit a reimbursement
          </a>
        </div>
      ) : null}
      {session.role === "none" ? (
        <p className="m-0 px-4 py-3 text-[12px] text-muted leading-snug">
          No access yet — ask an admin to invite you.
        </p>
      ) : null}
      <form method="post" action="/auth/signout" className="border-t border-rule">
        <button
          type="submit"
          role="menuitem"
          className={menuItemClass + " bg-transparent border-0 font-inherit"}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AuthPill({ session }: AuthPillProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed top-3 right-4 z-50"
      style={{
        fontFamily: 'Inter, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {session === null ? (
        <GoogleSignInButton />
      ) : (
        <div className="relative">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((value) => !value)}
            className={
              "inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 !rounded-full " +
              "bg-white border border-rule text-ink cursor-pointer " +
              "shadow-[0_1px_3px_rgba(16,16,20,0.08)] " +
              "transition-[border-color,box-shadow,transform] duration-150 " +
              "hover:border-[#a8a8ac] hover:-translate-y-px " +
              "hover:shadow-[0_4px_12px_rgba(16,16,20,0.12)]"
            }
          >
            <Avatar
              fullName={session.fullName}
              email={session.email}
              avatarUrl={session.avatarUrl}
            />
            <span className="text-[11px] font-bold tracking-[0.14em] uppercase">
              {firstName(session.fullName, session.email)}
            </span>
          </button>
          {open ? <SignedInMenu session={session} /> : null}
        </div>
      )}
    </div>
  );
}
