import Image, { type StaticImageData } from "next/image";

export type LogoItem = {
  name: string;
  src: StaticImageData;
  href?: string;
  /** The logo already contains the name, so no caption is shown. */
  wordmark?: boolean;
};

export function LogoGrid({
  items,
  variant,
}: {
  items: LogoItem[];
  variant: "careers" | "clubs";
}) {
  return (
    <ul className={`logo-grid logo-grid-${variant}`}>
      {items.map((item) => {
        const logo = (
          <>
            <Image alt={item.wordmark ? item.name : ""} src={item.src} />
            {item.wordmark ? null : <span>{item.name}</span>}
          </>
        );

        return (
          <li key={item.name}>
            {item.href ? (
              <a
                aria-label={`Visit ${item.name}'s website (opens in a new tab)`}
                className="logo-grid-item logo-grid-link"
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {logo}
              </a>
            ) : (
              <div className="logo-grid-item">{logo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
