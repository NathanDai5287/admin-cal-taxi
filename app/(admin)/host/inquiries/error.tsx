"use client";

export default function VenueInquiriesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card-plain p-6" role="alert">
      <h1 className="text-[18px] font-bold text-ink">Venue inquiries are unavailable</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        The inquiry list could not be loaded. Try again.
      </p>
      <button className="btn-primary mt-5" onClick={reset} type="button">Try again</button>
    </section>
  );
}
