"use client";
import { Button } from "@/components/brand/button";

/**
 * One document in a list of four — the shared shell used by both the
 * /host/documents step (live, with editable fields) and an archived order's
 * detail page (replay a stored payload).
 *
 * Purely presentational: it owns the disclosure, the status pill, and the
 * download button. What a document *is* — its fields and its payload — stays
 * with the caller, so this file never needs to know about pricing or invoices.
 */

import { useId, useState } from "react";
import type { DocumentKind } from "@/lib/host-orders-types";

export type RowState =
  /** Generated in this session or previously archived. */
  | { kind: "generated"; number: string; detail?: string }
  /** Everything needed is present. */
  | { kind: "ready" }
  | { kind: "unavailable" }
  /** Required fields are still empty. */
  | { kind: "blocked"; missing: string[] }
  /** Another document has to exist first (e.g. the memo needs the deposit №). */
  | { kind: "waiting"; reason: string };

function StatusPill({ state }: { state: RowState }) {
  const [text, cls] =
    state.kind === "generated"
      ? [state.detail ? `${state.detail} · ${state.number}` : `Generated · ${state.number}`, state.detail && state.detail !== "Signed" ? "bg-brand-light text-brand border-brand/30" : "bg-ok-light text-ok border-ok/30"]
      : state.kind === "ready"
      ? ["Available to generate", "bg-brand-light text-brand border-brand/30"]
      : state.kind === "unavailable"
      ? ["Not generated", "bg-canvas text-muted border-rule"]
      : state.kind === "waiting"
      ? ["Waiting", "bg-canvas text-muted border-rule"]
      : [`Missing: ${state.missing.join(", ")}`, "bg-warn-light text-warn border-warn/30"];

  return (
    <span
      className={
        "inline-block px-2 py-0.5 border text-[10.5px] font-bold uppercase " +
        "tracking-[0.10em] max-w-full whitespace-normal break-words " + cls
      }
    >
      {text}
    </span>
  );
}

export default function DocumentRow({
  index,
  kind,
  label,
  subtitle,
  state,
  summary,
  onDownload,
  downloadLabel,
  busy = false,
  error,
  success,
  children,
  defaultOpen = false,
  grouped = false,
  inlineFields = false,
  fieldsLabel = "Edit fields",
  downloadVariant,
}: {
  /** 1-based position, shown as the step number. */
  index: number;
  kind: DocumentKind;
  label: string;
  subtitle: string;
  state: RowState;
  /** Key values at a glance while collapsed (e.g. "$2,000 · May 5, 2026"). */
  summary?: React.ReactNode;
  onDownload: () => void;
  /** Overrides the button text in every state. Defaults by state when omitted. */
  downloadLabel?: string;
  busy?: boolean;
  error?: string | null;
  success?: string | null;
  /** This document's own fields; omit for a download-only row. */
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** Use the enclosing document section's border and row dividers. */
  grouped?: boolean;
  /** Keep a short field, such as the contract signature option, inside the row. */
  inlineFields?: boolean;
  fieldsLabel?: string;
  downloadVariant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  const canDownload = state.kind !== "blocked" && state.kind !== "waiting" && state.kind !== "unavailable" && !busy;
  const isDone = state.kind === "generated";

  return (
    <section className={grouped ? "bg-surface" : "card-plain"} data-document-kind={kind}>
      <div className="flex items-start gap-4 px-5 py-4 flex-wrap sm:flex-nowrap">
        <span
          className={
            "inline-flex items-center justify-center w-[22px] h-[22px] shrink-0 mt-0.5 " +
            "text-[11px] font-bold border " +
            (isDone
              ? "bg-action text-white border-action"
              : "bg-surface text-muted border-rule")
          }
          aria-hidden="true"
        >
          {isDone ? "✓" : index}
        </span>

        <div className="flex-1 min-w-[180px]">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[14px] font-bold text-ink">{label}</span>
            <StatusPill state={state} />
          </div>
          <p className="text-[12px] text-muted mt-1">{subtitle}</p>
          {summary && (
            <p className="text-[12.5px] text-ink mt-1.5 tabular-nums">{summary}</p>
          )}
          {state.kind === "waiting" && (
            <p className="text-[12px] text-muted mt-1.5">{state.reason}</p>
          )}
          {children && inlineFields && open && (
            <div id={panelId} className="mt-4">{children}</div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {children && (
            <Button
              type="button"
              onClick={() => setOpen(o => !o)}
              variant="text"
              aria-expanded={open}
              aria-controls={panelId}
            >
              {open ? "Hide fields" : fieldsLabel}
            </Button>
          )}
          <Button
            type="button"
            aria-label={`${downloadLabel ?? "Download PDF"}: ${label}`}
            onClick={onDownload}
            disabled={!canDownload}
            variant={downloadVariant ?? (isDone ? "secondary" : "primary")}
          >
            {busy
              ? "Generating…"
              : downloadLabel ?? "Download PDF"}
          </Button>
        </div>
      </div>

      {(error || success) && (
        <div className="px-5 pb-3 -mt-1">
          {error   && <p className="text-warn text-[13px]">{error}</p>}
          {success && <p className="text-ok text-[13px]">{success}</p>}
        </div>
      )}

      {children && open && !inlineFields && (
        <div id={panelId} className="border-t border-rule px-5 py-5 bg-canvas/40">
          {children}
        </div>
      )}
    </section>
  );
}
