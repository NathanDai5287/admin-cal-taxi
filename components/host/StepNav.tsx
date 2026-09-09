"use client";
import { ButtonLink, Button } from "@/components/brand/button";

import Link from "next/link";

/**
 * Linear progression: home → pricing → contract → documents. The Nav above
 * lets users jump anywhere; these components add the natural forward/back
 * arrows + a step indicator that mirrors the workflow.
 */

export type StepKey = "home" | "pricing" | "contract" | "documents";

const STEPS: { key: StepKey; href: string; label: string; short: string }[] = [
  { key: "home",      href: "/host",           label: "Event Details", short: "Details"   },
  { key: "pricing",   href: "/host/pricing",   label: "Pricing",       short: "Pricing"   },
  { key: "contract",  href: "/host/contract",  label: "Contract",      short: "Contract"  },
  { key: "documents", href: "/host/documents", label: "Documents",     short: "Documents" },
];

function indexOfStep(current: StepKey): number {
  return STEPS.findIndex(s => s.key === current);
}

export function StepIndicator({ current }: { current: StepKey }) {
  const idx = indexOfStep(current);
  return (
    <ol className="flex items-center gap-3 flex-wrap">
      {STEPS.map((s, i) => {
        const isActive = i === idx;
        const isDone = i < idx;
        return (
          <li key={s.key} className="flex items-center gap-3">
            <Link
              href={s.href}
              className="group flex items-center gap-2"
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={
                  "inline-flex items-center justify-center w-[22px] h-[22px] " +
                  "text-[11px] font-bold border " +
                  (isActive
                    ? "bg-action text-white border-action"
                    : isDone
                    ? "bg-brand-light text-brand border-brand"
                    : "bg-surface text-muted border-rule")
                }
              >
                {i + 1}
              </span>
              <span
                className={
                  "text-[11px] font-bold tracking-[0.16em] uppercase transition-colors " +
                  (isActive
                    ? "text-brand"
                    : isDone
                    ? "text-ink group-hover:text-brand"
                    : "text-muted group-hover:text-ink")
                }
              >
                {s.label}
              </span>
            </Link>
            {i < STEPS.length - 1 && (
              <span className="text-muted text-[12px]" aria-hidden="true">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Footer with prev/next buttons. `nextDisabled` lets the page block forward
 * progress until required fields are filled in (e.g. event details on `/host`).
 * `nextLabel` overrides the auto-generated "Continue to <step>" text.
 */
export function StepNav({
  current,
  nextDisabled = false,
  nextLabel,
}: {
  current: StepKey;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  const idx = indexOfStep(current);
  const prev = idx > 0 ? STEPS[idx - 1] : null;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : null;

  return (
    <nav className="flex items-center justify-between gap-4 border-t border-rule pt-6 mt-2 flex-wrap">
      {prev ? (
        <ButtonLink href={prev.href} variant="secondary">
          ← {prev.label}
        </ButtonLink>
      ) : <span />}

      {next ? (
        nextDisabled ? (
          <Button
            disabled
            title="Fill in the required fields above to continue"
          >
            {nextLabel ?? `Continue to ${next.label}`} →
          </Button>
        ) : (
          <ButtonLink href={next.href} variant="primary">
            {nextLabel ?? `Continue to ${next.label}`} →
          </ButtonLink>
        )
      ) : <span />}
    </nav>
  );
}
