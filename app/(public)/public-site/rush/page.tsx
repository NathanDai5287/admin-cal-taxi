import type { Metadata } from "next";
import Link from "next/link";

import cityImage from "@/public/site/chapter-city.jpg";
import dinnerImage from "@/public/site/chapter-dinner.jpg";
import nightFlagImage from "@/public/site/chapter-night-flag.jpg";
import accentureLogo from "@/public/site/logos/accenture.png";
import chpLogo from "@/public/site/logos/california-highway-patrol.png";
import eliLillyLogo from "@/public/site/logos/eli-lilly.png";
import equinoxLogo from "@/public/site/logos/equinox.png";
import genentechLogo from "@/public/site/logos/genentech.png";
import antigravityLogo from "@/public/site/logos/google-antigravity.png";
import deepmindLogo from "@/public/site/logos/google-deepmind.png";
import janeStreetLogo from "@/public/site/logos/jane-street.png";
import jpMorganLogo from "@/public/site/logos/jp-morgan.png";
import kpmgLogo from "@/public/site/logos/kpmg.png";
import mechanizeLogo from "@/public/site/logos/mechanize.png";
import metaLogo from "@/public/site/logos/meta.png";
import mongodbLogo from "@/public/site/logos/mongodb.png";
import nvidiaLogo from "@/public/site/logos/nvidia.png";
import optiverLogo from "@/public/site/logos/optiver.png";
import oracleLogo from "@/public/site/logos/oracle.png";
import robinhoodLogo from "@/public/site/logos/robinhood.png";
import twitchLogo from "@/public/site/logos/twitch.png";
import uberLogo from "@/public/site/logos/uber.png";
import vanguardLogo from "@/public/site/logos/vanguard.png";
import voleonLogo from "@/public/site/logos/voleon.png";
import { LightboxImage } from "@/components/public/lightbox-image";
import { LogoGrid, type LogoItem } from "@/components/public/logo-grid";
import { Arrow } from "@/components/public/public-shell";

const companies: LogoItem[] = [
  {
    name: "Jane Street",
    src: janeStreetLogo,
    href: "https://www.janestreet.com/",
    wordmark: true,
  },
  {
    name: "Mechanize",
    src: mechanizeLogo,
    href: "https://www.mechanize.work/",
  },
  {
    name: "KPMG",
    src: kpmgLogo,
    href: "https://kpmg.com/",
    wordmark: true,
  },
  {
    name: "Google DeepMind",
    src: deepmindLogo,
    href: "https://deepmind.google/",
    wordmark: true,
  },
  {
    name: "Google Antigravity",
    src: antigravityLogo,
    href: "https://antigravity.google/",
  },
  {
    name: "Meta",
    src: metaLogo,
    href: "https://www.meta.com/about/",
    wordmark: true,
  },
  {
    name: "MongoDB",
    src: mongodbLogo,
    href: "https://www.mongodb.com/",
    wordmark: true,
  },
  {
    name: "Uber",
    src: uberLogo,
    href: "https://www.uber.com/",
    wordmark: true,
  },
  {
    name: "Vanguard",
    src: vanguardLogo,
    href: "https://investor.vanguard.com/",
    wordmark: true,
  },
  {
    name: "JP Morgan",
    src: jpMorganLogo,
    href: "https://www.jpmorgan.com/global",
    wordmark: true,
  },
  {
    name: "Voleon",
    src: voleonLogo,
    href: "https://voleon.com/",
    wordmark: true,
  },
  {
    name: "Genentech",
    src: genentechLogo,
    href: "https://www.gene.com/",
    wordmark: true,
  },
  {
    name: "Oracle",
    src: oracleLogo,
    href: "https://www.oracle.com/",
    wordmark: true,
  },
  {
    name: "Eli Lilly",
    src: eliLillyLogo,
    href: "https://www.lilly.com/",
  },
  {
    name: "NVIDIA",
    src: nvidiaLogo,
    href: "https://www.nvidia.com/",
    wordmark: true,
  },
  {
    name: "Twitch",
    src: twitchLogo,
    href: "https://www.twitch.tv/",
  },
  {
    name: "Optiver",
    src: optiverLogo,
    href: "https://www.optiver.com/",
    wordmark: true,
  },
  {
    name: "Accenture",
    src: accentureLogo,
    href: "https://www.accenture.com/",
    wordmark: true,
  },
  {
    name: "Robinhood",
    src: robinhoodLogo,
    href: "https://robinhood.com/",
    wordmark: true,
  },
  {
    name: "Equinox",
    src: equinoxLogo,
    href: "https://www.equinox.com/",
  },
  {
    name: "California Highway Patrol",
    src: chpLogo,
    href: "https://www.chp.ca.gov/",
  },
];

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
          <Link className="public-action public-action-light" href="/events">
            Check public events <Arrow />
          </Link>
        </div>
        <LightboxImage
          alt="Two people holding a blue-and-white Theta Xi flag outside at night"
          eager
          sizes="(max-width: 760px) 100vw, (max-width: 2240px) 50vw, 1120px"
          src={nightFlagImage}
        />
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
          <LightboxImage
            alt="Four chapter members gathered around a restaurant table"
            caption="Dinner together"
            className="rush-life-dinner"
            naturalAspect
            sizes="(max-width: 760px) 100vw, (max-width: 1440px) 59vw, 904px"
            src={dinnerImage}
          />
          <LightboxImage
            alt="One person taking a selfie outside a city building"
            caption="An everyday stop together"
            className="rush-life-city"
            naturalAspect
            sizes="(max-width: 760px) 100vw, (max-width: 1440px) 33vw, 508px"
            src={cityImage}
          />
        </div>
      </section>

      <section className="logo-showcase" aria-labelledby="careers-title">
        <h2 id="careers-title">Where our brothers go.</h2>
        <LogoGrid items={companies} variant="careers" />
      </section>

      <section className="rush-invitation" aria-labelledby="rush-invitation-title">
        <div>
          <h2 id="rush-invitation-title">Come say hello.</h2>
          <p>
            If you are interested in Theta Xi at UC Berkeley, check the public schedule.
            It will show the next confirmed chance to meet Nu Chapter.
          </p>
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
