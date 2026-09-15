import Image from "next/image";
import Link from "next/link";

export function SiteHomeIcon({
  className = "",
  label = "Home",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link
      aria-label={label}
      className={`site-home-icon${className ? ` ${className}` : ""}`}
      href="/"
      title={label}
    >
      <Image alt="" height={32} src="/taxi-icon.png" unoptimized width={32} />
    </Link>
  );
}
