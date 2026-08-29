import Image from "next/image";
import Link from "next/link";

export function SiteHomeIcon({ className = "" }: { className?: string }) {
  return (
    <Link
      aria-label="Admin home"
      className={`site-home-icon${className ? ` ${className}` : ""}`}
      href="/"
      title="Admin home"
    >
      <Image alt="" height={32} src="/taxi-icon.png" unoptimized width={32} />
    </Link>
  );
}
