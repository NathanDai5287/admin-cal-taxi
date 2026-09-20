import Image from "next/image";
import Link from "next/link";

import awardsImage from "@/public/site/chapter-awards.jpg";
import dinnerImage from "@/public/site/chapter-dinner.jpg";
import flagImage from "@/public/site/chapter-flag.jpg";
import graduationImage from "@/public/site/berkeley-graduation.jpg";
import houseMealImage from "@/public/site/chapter-house-meal.jpg";
import workImage from "@/public/site/chapter-work.jpg";
import { Arrow } from "@/components/public/public-shell";

export default function PublicHomePage() {
  return (
    <main id="main-content">
      <section className="crossroads" aria-labelledby="crossroads-title">
        <h1 className="sr-only" id="crossroads-title">Meet Theta Xi or host an event at the chapter house</h1>
        <article className="crossroads-path crossroads-chapter">
          <Image
            alt="Five Nu Chapter members holding awards"
            fill
            fetchPriority="high"
            loading="eager"
            sizes="(max-width: 760px) 100vw, 43vw"
            src={awardsImage}
          />
          <div className="crossroads-shade" />
          <div className="crossroads-copy">
            <h2>The chapter</h2>
            <Link className="public-action public-action-on-image" href="/rush">
              Rush Theta Xi <Arrow />
            </Link>
          </div>
        </article>

        <div className="crossroads-mark" aria-hidden="true">
          <span lang="el">Θ</span>
          <span lang="el">Ξ</span>
        </div>

        <article className="crossroads-path crossroads-host">
          <Image
            alt="Two Nu Chapter members holding the chapter flag during a trip"
            fill
            loading="eager"
            sizes="(max-width: 760px) 100vw, 43vw"
            src={flagImage}
          />
          <div className="crossroads-shade" />
          <div className="crossroads-copy">
            <h2>Host with us</h2>
            <Link className="public-action public-action-on-image" href="/host">
              Plan an event <Arrow />
            </Link>
          </div>
        </article>
      </section>

      <dl className="chapter-facts" aria-label="Chapter facts">
        <div><dt>Chapter</dt><dd>UC Berkeley</dd></div>
        <div><dt>Founded here</dt><dd>Since 1910</dd></div>
        <div><dt>Home</dt><dd>Berkeley, CA</dd></div>
      </dl>

      <section className="chapter-record" id="chapter" aria-labelledby="chapter-title">
        <div className="chapter-record-intro">
          <h2 id="chapter-title">A chapter built in Berkeley.</h2>
          <p>
            Nu Chapter brings together UC Berkeley students through shared work,
            chapter traditions, and life beyond the classroom.
          </p>
        </div>
        <figure className="record-image record-image-work">
          <Image
            alt="Nu Chapter members working together on an outdoor chapter project"
            fill
            sizes="(max-width: 760px) 100vw, 58vw"
            src={workImage}
          />
          <figcaption>Shared work at the chapter house</figcaption>
        </figure>
        <figure className="record-image record-image-graduation">
          <Image
            alt="Two friends together at a UC Berkeley graduation"
            fill
            sizes="(max-width: 760px) 100vw, 32vw"
            src={graduationImage}
          />
          <figcaption>Berkeley graduation</figcaption>
        </figure>
        <div className="chapter-invitation">
          <p>Come meet the people who make the chapter.</p>
          <Link href="/rush">Meet the chapter <Arrow /></Link>
        </div>
      </section>

      <section className="chapter-moments" aria-labelledby="chapter-moments-title">
        <header>
          <p>Chapter life</p>
          <h2 id="chapter-moments-title">The everyday moments matter too.</h2>
        </header>
        <div className="chapter-moments-grid">
          <figure className="chapter-moment chapter-moment-social">
            <Image
              alt="Two chapter members sharing a meal at the chapter house"
              fill
              sizes="(max-width: 760px) 100vw, 55vw"
              src={houseMealImage}
            />
            <figcaption>A meal at the chapter house</figcaption>
          </figure>
          <figure className="chapter-moment chapter-moment-dinner">
            <Image
              alt="Four chapter members gathered around a restaurant table"
              fill
              sizes="(max-width: 760px) 100vw, 45vw"
              src={dinnerImage}
            />
            <figcaption>Dinner together</figcaption>
          </figure>
        </div>
      </section>

      <section className="public-ledger" aria-labelledby="events-title">
        <div className="public-ledger-heading">
          <h2 id="events-title">What is happening</h2>
          <Link href="/events">View events <Arrow /></Link>
        </div>
        <div className="public-empty-state">
          <p>New event dates are being prepared.</p>
          <span>Confirmed recruitment dates will appear on the public events page.</span>
          <Link href="/events">View event schedule</Link>
        </div>
      </section>

      <section className="venue-preview" aria-labelledby="venue-title">
        <div>
          <h2 id="venue-title">Make the house your next gathering place.</h2>
          <p>
            The chapter house offers a large, flexible event space near the UC Berkeley campus.
            Our event team can help coordinate the setup.
          </p>
          <Link className="public-action public-action-dark" href="/host">
            Explore the venue <Arrow />
          </Link>
        </div>
        <dl>
          <div><dt>Guest capacity</dt><dd>Up to 200</dd></div>
          <div><dt>Location</dt><dd>Near campus</dd></div>
          <div><dt>Setup</dt><dd>Flexible layout</dd></div>
          <div><dt>Support</dt><dd>Event coordination</dd></div>
        </dl>
      </section>

      <section className="paired-actions" aria-label="Contact options">
        <Link href="/rush">
          <span>For students</span>
          <strong>Meet Nu Chapter</strong>
          <Arrow />
        </Link>
        <Link href="/host#venue-inquiry">
          <span>For organizers</span>
          <strong>Ask about the house</strong>
          <Arrow />
        </Link>
      </section>
    </main>
  );
}
