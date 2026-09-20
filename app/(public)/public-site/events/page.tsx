import type { Metadata } from "next";
import Link from "next/link";

import cocktailDinnerImage from "@/public/site/chapter-cocktail-dinner.jpg";
import socialNightImage from "@/public/site/chapter-social-night.jpg";
import { LightboxImage } from "@/components/public/lightbox-image";
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

      <section className="chapter-moments" aria-label="Chapter life">
        <div className="chapter-moments-grid chapter-moments-grid-events">
          <LightboxImage
            alt="Three people holding drinks during an outdoor evening gathering"
            caption="A social night together"
            className="chapter-moment chapter-moment-social"
            sizes="(max-width: 760px) 100vw, (max-width: 1680px) 45vw, 747px"
            src={socialNightImage}
          />
          <LightboxImage
            alt="Five people seated together at a restaurant table"
            caption="Dinner together"
            className="chapter-moment chapter-moment-dinner"
            sizes="(max-width: 760px) 100vw, (max-width: 1680px) 40vw, 664px"
            src={cocktailDinnerImage}
          />
        </div>
      </section>
    </main>
  );
}
