"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicNavLinks = [
  { href: "/", label: "Chapter", match: "/" },
  { href: "/rush", label: "Rush", match: "/rush" },
  { href: "/events", label: "Events", match: "/events" },
  { href: "/host", label: "Host", match: "/host" },
];

export function PublicNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="public-nav" aria-label="Public site">
      {publicNavLinks.map(({ href, label, match }) => {
        // The public host rewrites to /public-site/* while keeping the
        // browser URL; match both so the active state works on either.
        const internalPath = `/public-site${match === "/" ? "" : match}`;
        const current = pathname === match || pathname === internalPath;
        return (
          <Link aria-current={current ? "page" : undefined} href={href} key={href}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
