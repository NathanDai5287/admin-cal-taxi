import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import cocktailDinnerImage from "@/public/site/chapter-cocktail-dinner.jpg";
import socialNightImage from "@/public/site/chapter-social-night.jpg";
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

      <section className="chapter-moments" aria-labelledby="events-moments-title">
        <header>
          <p>Chapter life</p>
          <h2 id="events-moments-title">Gatherings beyond the schedule.</h2>
        </header>
        <div className="chapter-moments-grid">
          <figure className="chapter-moment chapter-moment-social">
            <Image
              alt="Three people holding drinks during an outdoor evening gathering"
              fill
              sizes="(max-width: 760px) 100vw, (max-width: 1440px) 55vw, 704px"
              src={socialNightImage}
            />
            <figcaption>A social night together</figcaption>
          </figure>
          <figure className="chapter-moment chapter-moment-dinner">
            <Image
              alt="Five people seated together at a restaurant table"
              fill
              sizes="(max-width: 760px) 100vw, (max-width: 1440px) 45vw, 521px"
              src={cocktailDinnerImage}
            />
            <figcaption>Dinner together</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
