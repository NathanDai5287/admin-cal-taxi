import type { Metadata } from "next";
import Link from "next/link";

import { Arrow } from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Events",
  description: "Public events from Theta Xi Nu Chapter at UC Berkeley.",
};

export default function EventsPage() {
  return (
    <main id="main-content" className="public-page">
      <header className="public-page-header">
        <h1>Events at Nu Chapter</h1>
        <p>Recruitment, chapter, and community dates will appear here after the schedule is confirmed.</p>
      </header>

      <section className="events-ledger" aria-labelledby="schedule-title">
        <div className="events-ledger-heading">
          <h2 id="schedule-title">Current schedule</h2>
          <span>Berkeley, California</span>
        </div>
        <div className="events-empty">
          <p>No public dates are posted yet.</p>
          <span>Check back here for confirmed recruitment and chapter events.</span>
          <Link className="public-action public-action-dark" href="/rush">
            Meet the chapter <Arrow />
          </Link>
        </div>
      </section>

      <section className="events-context" aria-labelledby="events-context-title">
        <h2 id="events-context-title">Find your way in</h2>
        <div>
          <article>
            <h3>Meet the chapter</h3>
            <p>Prospective students can ask about recruitment and the next chance to visit.</p>
            <Link href="/rush">Meet the chapter <Arrow /></Link>
          </article>
          <article>
            <h3>Plan your own event</h3>
            <p>Student groups and organizers can ask about dates at the chapter house.</p>
            <Link href="/host#venue-inquiry">Start a venue inquiry <Arrow /></Link>
          </article>
        </div>
      </section>
    </main>
  );
}
