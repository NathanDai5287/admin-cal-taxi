import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import awardsImage from "@/public/site/chapter-awards.jpg";
import houseMealImage from "@/public/site/chapter-house-meal.jpg";
import outdoorsImage from "@/public/site/chapter-outdoors.jpg";
import { Arrow } from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Meet the Chapter",
  description: "Meet Theta Xi Nu Chapter at UC Berkeley and ask about recruitment.",
};

export default function RushPage() {
  return (
    <main id="main-content" className="public-page rush-page">
      <header className="rush-intro">
        <div>
          <h1>Meet Nu Chapter.</h1>
          <p>
            Theta Xi has been part of UC Berkeley since 1910.
            Get to know the chapter and ask when you can visit next.
          </p>
          <Link className="public-action public-action-light" href="#rush-contact">
            Start here <Arrow />
          </Link>
        </div>
        <figure>
          <Image
            alt="Five Nu Chapter members holding chapter awards"
            fill
            fetchPriority="high"
            sizes="(max-width: 760px) 100vw, 46vw"
            src={awardsImage}
          />
        </figure>
      </header>

      <dl className="chapter-facts" aria-label="Chapter facts">
        <div><dt>Organization</dt><dd>Theta Xi</dd></div>
        <div><dt>Chapter</dt><dd>Nu Chapter</dd></div>
        <div><dt>At Berkeley</dt><dd>Since 1910</dd></div>
      </dl>

      <section className="rush-life" aria-labelledby="rush-life-title">
        <header>
          <p>Life together</p>
          <h2 id="rush-life-title">More than one kind of day.</h2>
        </header>
        <div className="rush-life-grid">
          <figure className="rush-life-outdoors">
            <Image
              alt="A chapter member beside a large rock during an outdoor trip"
              fill
              sizes="(max-width: 760px) 100vw, 58vw"
              src={outdoorsImage}
            />
            <figcaption>A day outdoors</figcaption>
          </figure>
          <figure className="rush-life-meal">
            <Image
              alt="Two chapter members sharing an informal meal"
              fill
              sizes="(max-width: 760px) 100vw, 42vw"
              src={houseMealImage}
            />
            <figcaption>An informal meal together</figcaption>
          </figure>
        </div>
      </section>

      <section className="rush-invitation" id="rush-contact" aria-labelledby="rush-invitation-title">
        <div>
          <h2 id="rush-invitation-title">Come say hello.</h2>
          <p>
            If you are interested in Theta Xi at UC Berkeley, check the public schedule.
            It will show the next confirmed chance to meet Nu Chapter.
          </p>
        </div>
        <div className="rush-actions">
          <Link className="public-action public-action-dark" href="/events">
            Check public events <Arrow />
          </Link>
        </div>
      </section>

      <section className="rush-history" aria-labelledby="rush-history-title">
        <h2 id="rush-history-title">Nu Chapter at UC Berkeley.</h2>
        <p>
          The chapter has called Berkeley home since 1910.
          The next step is simple: see the public schedule and visit when a date is posted.
        </p>
      </section>
    </main>
  );
}
