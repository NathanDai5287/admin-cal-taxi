"use client";

const themeStorageKey = "reimbursement-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const currentTheme = root.dataset.reimbursementTheme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    root.dataset.reimbursementTheme = nextTheme;
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // The visual toggle still works when storage is unavailable.
    }
  }

  return (
    <button
      aria-label="Toggle color theme"
      className={`theme-toggle${className ? ` ${className}` : ""}`}
      onClick={toggleTheme}
      title="Toggle color theme"
      type="button"
    >
      <svg aria-hidden="true" className="theme-icon theme-icon-moon" viewBox="0 0 24 24">
        <path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7 8.5 8.5 0 1 0 20.3 15.4Z" />
      </svg>
      <svg aria-hidden="true" className="theme-icon theme-icon-sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </svg>
    </button>
  );
}
