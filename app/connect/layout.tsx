import Link from "next/link";
import "./connect.css";

export const metadata = {
  title: "Connect · Nu Chapter of Theta Xi",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-brand className="connect-shell min-h-screen">
      <header className="border-b border-rule">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <Link className="font-semibold text-brand" href="/connect">
            Nu Chapter of Theta Xi
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</main>
      <footer className="mx-auto max-w-3xl px-5 py-8 text-sm text-muted">
        Theta Xi · Nu Chapter · UC Berkeley ·{" "}
        <a href="https://cal.taxi" className="underline">
          Chapter website
        </a>
      </footer>
    </div>
  );
}
