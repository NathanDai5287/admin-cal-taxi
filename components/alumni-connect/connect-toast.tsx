"use client";

import { useEffect, useState } from "react";

export function ConnectToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="connect-toast">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </svg>
      <div role="status">
        <p className="connect-toast-title">You’re subscribed</p>
        <p>{message}</p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss notification"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      </button>
    </div>
  );
}
