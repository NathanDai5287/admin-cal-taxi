import Link from "next/link";

import awardsImage from "@/public/site/chapter-awards.jpg";
import dinnerImage from "@/public/site/chapter-dinner.jpg";
import flagImage from "@/public/site/chapter-flag.jpg";
import graduationImage from "@/public/site/berkeley-graduation.jpg";
import houseMealImage from "@/public/site/chapter-house-meal.jpg";
import workImage from "@/public/site/chapter-work.jpg";
import { LightboxImage } from "@/components/public/lightbox-image";
import { Arrow } from "@/components/public/public-shell";

export default function PublicHomePage() {
  return (
    <main id="main-content">
      <section className="crossroads" aria-labelledby="crossroads-title">
        <h1 className="sr-only" id="crossroads-title">Meet Theta Xi or host an event at the chapter house</h1>
        <LightboxImage
          alt="Five Nu Chapter members holding awards"
          className="crossroads-path crossroads-chapter"
          eager
          sizes="(max-width: 760px) 100vw, (max-width: 2160px) 43vw, 908px"
          src={awardsImage}
        >
          <div className="crossroads-shade" />
          <div className="crossroads-copy">
            <h2>The chapter</h2>
            <Link className="public-action public-action-on-image" href="/rush">
              Rush Theta Xi <Arrow />
            </Link>
          </div>
        </LightboxImage>

        <div className="crossroads-mark" aria-hidden="true">
          <span lang="el">Θ</span>
          <span lang="el">Ξ</span>
        </div>

        <LightboxImage
          alt="Two Nu Chapter members holding the chapter flag during a trip"
          className="crossroads-path crossroads-host"
          eager
          sizes="(max-width: 760px) 100vw, (max-width: 2160px) 43vw, 908px"
          src={flagImage}
        >
          <div className="crossroads-shade" />
          <div className="crossroads-copy">
            <h2>Host with us</h2>
            <Link className="public-action public-action-on-image" href="/host">
              Plan an event <Arrow />
            </Link>
          </div>
        </LightboxImage>
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
        <LightboxImage
          alt="Nu Chapter members working together on an outdoor chapter project"
          caption="Shared work at the chapter house"
          className="record-image record-image-work"
          sizes="(max-width: 760px) 100vw, (max-width: 1440px) 58vw, 763px"
          src={workImage}
        />
        <LightboxImage
          alt="Two friends together at a UC Berkeley graduation"
          caption="Berkeley graduation"
          className="record-image record-image-graduation"
          sizes="(max-width: 760px) 100vw, (max-width: 1440px) 32vw, 436px"
          src={graduationImage}
        />
        <div className="chapter-invitation">
          <p>Come meet the people who make the chapter.</p>
        </div>
      </section>

      <section className="chapter-moments" aria-label="Chapter life">
        <div className="chapter-moments-grid chapter-moments-grid-home">
          <LightboxImage
            alt="Two chapter members sharing a meal at the chapter house"
            caption="A meal at the chapter house"
            className="chapter-moment chapter-moment-social"
            sizes="(max-width: 760px) 100vw, (max-width: 1680px) 31vw, 508px"
            src={houseMealImage}
          />
          <LightboxImage
            alt="Four chapter members gathered around a restaurant table"
            caption="Dinner together"
            className="chapter-moment chapter-moment-dinner"
            sizes="(max-width: 760px) 100vw, (max-width: 1680px) 55vw, 904px"
            src={dinnerImage}
          />
        </div>
      </section>

      <section className="public-ledger" aria-labelledby="events-title">
        <div className="public-ledger-heading">
          <h2 id="events-title">What is happening</h2>
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
        </div>
        <dl>
          <div><dt>Guest capacity</dt><dd>Up to 200</dd></div>
          <div><dt>Location</dt><dd>Near campus</dd></div>
          <div><dt>Setup</dt><dd>Flexible layout</dd></div>
          <div><dt>Support</dt><dd>Event coordination</dd></div>
        </dl>
      </section>
    </main>
  );
}
