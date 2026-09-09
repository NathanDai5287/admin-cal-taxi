import Link from "next/link";
import type { ComponentProps } from "react";

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
export function Button({ variant, compact, className, type = "button", ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button type={type} className={buttonClass({ variant, compact, className })} {...props} />;
}

export function ButtonLink({ variant, compact, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, compact, className })} {...props} />;
}
