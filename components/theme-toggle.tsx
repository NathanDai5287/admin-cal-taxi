"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE } from "@/lib/theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function followSystem() {
    const saved = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${THEME_COOKIE}=`));
    if (!saved) document.documentElement.dataset.theme = media.matches ? "dark" : "light";
  }
  media.addEventListener("change", followSystem);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", followSystem);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  function toggle() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    // Share this non-sensitive preference with the reimbursement subdomain.
    const hostname = window.location.hostname;
    const domain = hostname === "cal.taxi" || hostname.endsWith(".cal.taxi") ? "; Domain=cal.taxi" : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.9 13.1A9 9 0 0 1 10.9 3a9 9 0 1 0 10 10.1Z" />
      </svg>
    </button>
  );
}
