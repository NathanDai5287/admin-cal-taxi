import type { Metadata } from "next";
import type { StaticImageData } from "next/image";

import { HouseMap, houseDirectionsUrl } from "@/components/public/house-map";
import { LightboxImage } from "@/components/public/lightbox-image";
import { LogoGrid, type LogoItem } from "@/components/public/logo-grid";
import { Arrow } from "@/components/public/public-shell";
import backyardPortraitImage from "@/public/site/venue-backyard-portrait.jpg";
import betaAlphaPsiLogo from "@/public/site/logos/berkeley-beta-alpha-psi.png";
import indoorCocktailImage from "@/public/site/venue-indoor-cocktail.jpg";
import indoorEventImage from "@/public/site/venue-indoor-event.jpg";
import indoorHallImage from "@/public/site/venue-indoor-hall.jpg";
import indoorHallPortraitImage from "@/public/site/venue-indoor-hall-portrait.jpg";
import berkeleytimeLogo from "@/public/site/logos/berkeleytime-clock.png";
import calJapanClubLogo from "@/public/site/logos/cal-japan-club.png";
import codebaseLogo from "@/public/site/logos/codebase-wordmark.png";
import diversatechLogo from "@/public/site/logos/diversatech.png";
import dssLogo from "@/public/site/logos/data-science-society.png";
import gammaZetaAlphaLogo from "@/public/site/logos/gamma-zeta-alpha.png";
import plextechLogo from "@/public/site/logos/plextech.png";
import productSpaceLogo from "@/public/site/logos/product-space.png";
import thetaTauLogo from "@/public/site/logos/theta-tau.png";
import upsyncLogo from "@/public/site/logos/upsync.png";
import valleyConsultingGroupLogo from "@/public/site/logos/valley-consulting-group.png";
import webdevLogo from "@/public/site/logos/webdev-at-berkeley.png";
import { VenueInquiryForm } from "./venue-inquiry-form";
import { VenueWalkthroughVideo } from "./venue-walkthrough-video";

const clubs: LogoItem[] = [
  { name: "Gamma Zeta Alpha", src: gammaZetaAlphaLogo, wordmark: true },
  { name: "BerkeleyTime", src: berkeleytimeLogo },
  { name: "Codebase", src: codebaseLogo },
  { name: "WebDev at Berkeley", src: webdevLogo },
  { name: "DiversaTech", src: diversatechLogo },
  { name: "PlexTech", src: plextechLogo },
  { name: "Data Science Society", src: dssLogo },
  { name: "Theta Tau", src: thetaTauLogo },
  { name: "UpSync", src: upsyncLogo },
  { name: "Beta Alpha Psi", src: betaAlphaPsiLogo },
  { name: "Valley Consulting Group", src: valleyConsultingGroupLogo },
  { name: "Product Space", src: productSpaceLogo },
  { name: "Cal Japan Club", src: calJapanClubLogo },
];

export const metadata: Metadata = {
  title: "Host with Us",
  description: "Ask about hosting an event at the Theta Xi chapter house near UC Berkeley.",
};

const venueFacts = [
  ["Capacity", "Up to 200 guests"],
  ["Location", "2639 Durant Ave, Berkeley"],
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
          </header>
          <div className="host-space-gallery">
            <VenuePhoto
              alt="Chapter members at a cocktail night beneath blue and yellow balloons"
              label="Cocktail night"
              position="lead"
              sizes="(max-width: 760px) 100vw, (max-width: 1800px) 33vw, 510px"
              src={indoorCocktailImage}
            />
            <VenuePhoto
              alt="The event hall dressed with pennant flags and a chapter banner"
              label="Chapter banner"
              position="detail-one"
              sizes="(max-width: 760px) 50vw, (max-width: 1800px) 33vw, 510px"
              src={indoorHallPortraitImage}
            />
            <VenuePhoto
              alt="Five people posing behind a decorated table at an indoor event"
              label="Indoor event setup"
              position="detail-two"
              sizes="(max-width: 760px) 50vw, (max-width: 1800px) 33vw, 510px"
              src={indoorEventImage}
            />
            <VenuePhoto
              alt="The open event hall with wood floors, pennant flags, and a Theta Xi banner"
              label="The open floor"
              position="detail-three"
              sizes="(max-width: 760px) 100vw, (max-width: 1800px) 75vw, 1176px"
              src={indoorHallImage}
            />
            <VenueWalkthroughVideo />
          </div>
        </article>

        <div aria-hidden="true" className="host-spaces-mark" lang="el">ΘΞ</div>

        <article className="host-space-showcase host-space-backyard">
          <header>
            <h2>Backyard venue</h2>
          </header>
          <div className="host-space-gallery">
            <VenuePhoto
              alt="A large daytime gathering in the backyard viewed from above"
              label="Backyard gathering"
              position="lead"
              sizes="(max-width: 760px) 100vw, 760px"
              src={backyardPortraitImage}
            />
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

      <section className="house-location" aria-labelledby="house-location-title">
        <div>
          <h2 id="house-location-title">Find the house.</h2>
          <p>
            The chapter house sits on Durant Ave, just across from the south edge of
            the UC Berkeley campus — an easy walk from Sproul Plaza and Telegraph.
          </p>
          <dl className="house-location-address">
            <div><dt>Address</dt><dd>2639 Durant Ave</dd></div>
            <div><dt>City</dt><dd>Berkeley, CA 94704</dd></div>
            <div><dt>Campus</dt><dd>Across from the south edge</dd></div>
          </dl>
          <a
            className="public-action public-action-dark"
            href={houseDirectionsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get directions <Arrow />
          </a>
        </div>
        <HouseMap />
      </section>

      <section className="logo-showcase" aria-labelledby="clubs-title">
        <h2 id="clubs-title">Clubs that have hosted with us.</h2>
        <LogoGrid items={clubs} variant="clubs" />
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
    <LightboxImage
      alt={alt}
      caption={label}
      className={`host-space-photo host-space-photo-${position} host-space-photo-real`}
      sizes={sizes}
      src={src}
    />
  );
}
