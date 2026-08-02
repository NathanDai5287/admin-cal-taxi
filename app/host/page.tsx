"use client";

import ContactsForm from "@/components/host/ContactsForm";
import SharedDataForm from "@/components/host/SharedDataForm";
import { StepIndicator, StepNav } from "@/components/host/StepNav";
import { useSharedData } from "@/lib/host-shared-state";

export default function HostHome() {
  const { hydrated, data, clear } = useSharedData();

  // Block forward progression until the renter is identified.
  const ready =
    hydrated && data.clubName.trim() !== "" && data.eventDate.trim() !== "";

  function handleClear() {
    if (typeof window === "undefined") return;
    if (window.confirm("Clear every saved field across the app? This cannot be undone.")) {
      clear();
    }
  }

  return (
    <div className="space-y-10">
      {/* ── Step indicator + page heading ── */}
      <div>
        <StepIndicator current="home" />
        <h1 className="page-title mt-6">Event Details</h1>
        <p className="page-lede">
          Start here. Enter who you&rsquo;re renting to, when, and how big the event is. The
          following pages — pricing, contract, and invoices — pull from these fields.
        </p>
      </div>

      <SharedDataForm />

      <ContactsForm />

      {!ready && hydrated && (
        <p className="text-[12.5px] text-muted -mt-6">
          Fill in organization and event date to continue.
        </p>
      )}

      <StepNav current="home" nextDisabled={!ready} />

      {/* ── Clear data — kept on this page only since it's the entry point ── */}
      <div className="pt-2 flex items-center justify-between border-t border-rule">
        <p className="text-[12px] text-muted max-w-md leading-relaxed pt-4">
          Saved fields persist across reloads in your browser&rsquo;s local storage. Clearing wipes
          contract drafts, pricing selections, and shared event details.
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hydrated}
          className="btn-link mt-4 disabled:opacity-50"
        >
          Clear Saved Data
        </button>
      </div>
    </div>
  );
}
