import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";

import { Arrow } from "@/components/public/public-shell";
import backyardPortraitImage from "@/public/site/venue-backyard-portrait.jpg";
import exteriorImage from "@/public/site/venue-exterior.jpg";
import indoorCocktailImage from "@/public/site/venue-indoor-cocktail.jpg";
import indoorEventImage from "@/public/site/venue-indoor-event.jpg";
import indoorHallImage from "@/public/site/venue-indoor-hall.jpg";
import indoorHallPortraitImage from "@/public/site/venue-indoor-hall-portrait.jpg";
import { VenueInquiryForm } from "./venue-inquiry-form";

export const metadata: Metadata = {
  title: "Host with Us",
  description: "Ask about hosting an event at the Theta Xi chapter house near UC Berkeley.",
};

const venueFacts = [
  ["Capacity", "Up to 200 guests"],
  ["Location", "Near the UC Berkeley campus"],
  ["Space", "Large, open event area"],
  ["Layout", "Flexible setup"],
  ["Equipment", "Sound system available"],
  ["Support", "Coordination with our event team"],
];

export default function HostPage() {
  return (
    <main id="main-content" className="public-page host-page">
      <header className="host-intro">
        <div>
          <h1>A Berkeley house made for gathering.</h1>
          <p>
            Host a mixer, club event, fundraiser, or private gathering in a flexible space near campus.
          </p>
          <a className="public-action public-action-dark" href="#venue-inquiry">
            Ask about a date <Arrow />
          </a>
        </div>
        <figure className="host-intro-photo">
          <Image
            alt="The brick chapter house with a Theta Xi banner and members gathered on the front lawn"
            fill
            sizes="(max-width: 760px) 100vw, 420px"
            src={exteriorImage}
          />
        </figure>
      </header>

      <section className="host-spaces" aria-label="Venue spaces">
        <article className="host-space-showcase host-space-indoor">
          <header>
            <h2>Indoor venue</h2>
            <p>Four photographs and a video.</p>
          </header>
          <div className="host-space-gallery">
            <VenuePhoto
              alt="Five people posing behind a decorated table at an indoor event"
              label="Indoor event setup"
              position="lead"
              sizes="(max-width: 760px) 100vw, 33vw"
              src={indoorEventImage}
            />
            <VenuePhoto
              alt="Chapter members at a cocktail night beneath blue and yellow balloons"
              label="Cocktail night"
              position="detail-one"
              sizes="(max-width: 760px) 50vw, 33vw"
              src={indoorCocktailImage}
            />
            <VenuePhoto
              alt="The event hall dressed with pennant flags and a chapter banner"
              label="Chapter banner"
              position="detail-two"
              sizes="(max-width: 760px) 50vw, 33vw"
              src={indoorHallPortraitImage}
            />
            <VenuePhoto
              alt="The open event hall with wood floors, pennant flags, and a Theta Xi banner"
              label="The open floor"
              position="detail-three"
              sizes="(max-width: 760px) 100vw, 75vw"
              src={indoorHallImage}
            />
            <figure className="host-space-photo host-space-photo-video host-space-photo-real">
              <video
                aria-label="Video walkthrough of the indoor event space"
                autoPlay
                loop
                muted
                playsInline
                src="/site/venue-indoor-walkthrough.mp4"
              />
              <figcaption>Walkthrough</figcaption>
            </figure>
          </div>
        </article>

        <div aria-hidden="true" className="host-spaces-mark" lang="el">ΘΞ</div>

        <article className="host-space-showcase host-space-backyard">
          <header>
            <h2>Backyard venue</h2>
            <p>One photograph shown. Three reserved.</p>
          </header>
          <div className="host-space-gallery">
            <VenuePhoto
              alt="A large daytime gathering in the backyard viewed from above"
              label="Backyard gathering"
              position="lead"
              sizes="(max-width: 760px) 100vw, 66vw"
              src={backyardPortraitImage}
            />
            <VenuePhotoPlaceholder label="Backyard photograph 2" position="detail-one" />
            <VenuePhotoPlaceholder label="Backyard photograph 3" position="detail-two" />
            <VenuePhotoPlaceholder label="Backyard photograph 4" position="detail-three" />
          </div>
        </article>
      </section>

      <section className="venue-facts" aria-labelledby="venue-facts-title">
        <h2 id="venue-facts-title">The space at a glance</h2>
        <dl>
          {venueFacts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="host-process" aria-labelledby="host-process-title">
        <div>
          <h2 id="host-process-title">Start with the event you have in mind.</h2>
          <p>
            Tell us your preferred date, group size, and setup needs.
            We will reply with availability, pricing, and the details for the space.
          </p>
        </div>
        <VenueInquiryForm />
      </section>
    </main>
  );
}

function VenuePhotoPlaceholder({ label, position }: { label: string; position: string }) {
  return (
    <figure className={`host-space-photo host-space-photo-${position}`}>
      <div aria-hidden="true" className="host-space-frame" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function VenuePhoto({
  alt,
  label,
  position,
  sizes,
  src,
}: {
  alt: string;
  label: string;
  position: string;
  sizes: string;
  src: StaticImageData;
}) {
  return (
    <figure className={`host-space-photo host-space-photo-${position} host-space-photo-real`}>
      <Image alt={alt} fill sizes={sizes} src={src} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}
