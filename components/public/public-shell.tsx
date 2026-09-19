import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" href="/" aria-label="Theta Xi Nu Chapter home">
        <span className="public-brand-mark" lang="el" aria-hidden="true">ΘΞ</span>
        <span>Theta Xi — Nu Chapter</span>
      </Link>
      <nav className="public-nav" aria-label="Public site">
        <Link href="/#chapter">Chapter</Link>
        <Link href="/rush">Rush</Link>
        <Link href="/events">Events</Link>
        <Link href="/host">Host</Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <p className="public-footer-mark" lang="el">ΘΞ</p>
        <p>Theta Xi, Nu Chapter</p>
        <p>University of California, Berkeley</p>
      </div>
      <div className="public-footer-links">
        <Link href="/rush">Meet the chapter</Link>
        <Link href="/events">Events</Link>
        <Link href="/host">Host at the house</Link>
        <a href="https://www.thetaxi.org" target="_blank" rel="noreferrer">National Theta Xi</a>
      </div>
      <p className="public-footer-history">Nu Chapter at UC Berkeley since 1910.</p>
    </footer>
  );
}

export function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}
