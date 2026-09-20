import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";

import { Arrow } from "@/components/public/public-shell";
import backyardPortraitImage from "@/public/site/venue-backyard-portrait.jpg";
import indoorEventImage from "@/public/site/venue-indoor-event.jpg";
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
      </header>

      <section className="host-spaces" aria-label="Venue spaces">
        <article className="host-space-showcase host-space-indoor">
          <header>
            <h2>Indoor venue</h2>
            <p>One photograph shown. Three reserved.</p>
          </header>
          <div className="host-space-gallery">
            <VenuePhoto
              alt="Five people posing behind a decorated table at an indoor event"
              label="Indoor event setup"
              position="lead"
              sizes="(max-width: 760px) 100vw, 42vw"
              src={indoorEventImage}
            />
            <VenuePhotoPlaceholder label="Indoor photograph 2" position="detail-one" />
            <VenuePhotoPlaceholder label="Indoor photograph 3" position="detail-two" />
            <VenuePhotoPlaceholder label="Indoor photograph 4" position="detail-three" />
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
              sizes="(max-width: 760px) 100vw, 42vw"
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
