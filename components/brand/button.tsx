"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type ButtonStyle = {
  variant?: "primary" | "secondary" | "danger" | "text";
  compact?: boolean;
  className?: string;
};

const variants = { primary: "btn-primary", secondary: "btn-ghost", danger: "btn-danger", text: "btn-link" };

function buttonClass({ variant = "primary", compact, className = "" }: ButtonStyle) {
  return `brand-button ${variants[variant]}${compact ? " btn-compact" : ""}${className ? ` ${className}` : ""}`;
}

// Works in server-rendered forms and client components without changing native
// form behavior. Callers explicitly choose submit vs. ordinary button actions.
export function Button({ variant, compact, className, type = "button", children, ...props }: ComponentProps<"button"> & ButtonStyle) {
  const { pending } = useFormStatus();
  const actionPending = type === "submit" && pending;
  return <button
    type={type}
    className={buttonClass({
      variant,
      compact,
      className: `${className ?? ""}${actionPending ? " opacity-65 cursor-wait" : ""}`.trim(),
    })}
    aria-busy={actionPending || undefined}
    {...props}
    disabled={props.disabled || actionPending}
  >
    {actionPending ? "Saving…" : children}
  </button>;
}

export function ButtonLink({ variant, compact, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, compact, className })} {...props} />;
}
